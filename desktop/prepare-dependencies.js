import { readdirSync, readFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { join, resolve, posix, sep } from 'node:path'
const root=resolve(import.meta.dirname,'..')
const packages=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8')).packages
function files(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(directory,e.name)):[join(directory,e.name)])}
function locate(name,from=''){
  for(let directory=from;;directory=posix.dirname(directory)){
    const candidate=posix.join(directory,'node_modules',name)
    if(packages[candidate]&&existsSync(join(root,candidate)))return candidate
    if(!directory||directory==='.')return null
  }
}
const selected=new Set()
function include(name,from='',required=false){
  const location=locate(name,from)
  if(!location){if(required)throw Error('缺少后台依赖 '+name);return}
  if(selected.has(location))return
  selected.add(location)
  const entry=packages[location]
  for(const dep of Object.keys(entry.dependencies||{}))include(dep,location,true)
  for(const dep of Object.keys({...entry.optionalDependencies,...entry.peerDependencies}))include(dep,location)
}
for(const file of files(join(root,'server')).filter(p=>p.endsWith('.js'))){
  for(const match of readFileSync(file,'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"]([@\w./:-]+)['"]/g)){
    const name=match[1]
    if(name.startsWith('.')||name.startsWith('node:'))continue
    include(name.startsWith('@')?name.split('/').slice(0,2).join('/'):name.split('/')[0],'',true)
  }
}
function copy(from,to){
  mkdirSync(to,{recursive:true})
  for(const entry of readdirSync(from,{withFileTypes:true})){
    if(entry.name==='node_modules')continue
    if(entry.isDirectory())copy(join(from,entry.name),join(to,entry.name))
    else copyFileSync(join(from,entry.name),join(to,entry.name))
  }
}
export function prepareDependencies(destination){
  const modules=resolve(destination,'node_modules')
  if(!modules.startsWith(resolve(root,'artifacts')+sep))throw Error('依赖输出必须位于项目 artifacts 目录')
  rmSync(modules,{recursive:true,force:true})
  for(const location of selected)copy(join(root,location),join(destination,location))
  console.log(`Prepared ${selected.size} backend packages`)
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename))prepareDependencies(resolve(process.argv[2]||join(root,'artifacts/backend-dependencies')))
