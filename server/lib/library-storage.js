import {existsSync} from 'node:fs'
import {mkdir,stat,link,unlink,rmdir,lstat} from 'node:fs/promises'
import {resolve,relative,isAbsolute,join,dirname} from 'node:path'

export function libraryPath(directory,item,get) {
  const names=[],seen=new Set()
  while(item){
    if(seen.has(item.id))throw Error('资料库文件夹路径存在循环')
    seen.add(item.id)
    if(!item.name||/[\x00-\x1f\\/<>:"|?*]|[. ]$/.test(item.name)||['.','..'].includes(item.name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(item.name))throw Error('资料名称不适合磁盘保存：'+item.name)
    names.unshift(item.name);item=item.parent?get(item.parent):null
  }
  const root=resolve(directory),path=resolve(root,...names),inside=relative(root,path)
  if(!inside||inside.startsWith('..')||isAbsolute(inside))throw Error('资料路径超出资料库')
  return path
}

export async function migrateLibrary(directory,items,get) {
  const root=resolve(directory),paths=new Set(),plans=[]
  for(const item of items){
    const path=libraryPath(root,item,get),key=path.toLowerCase()
    if(paths.has(key))throw Error('资料名称在磁盘上重复：'+item.name)
    paths.add(key)
    for(let cursor=path;cursor!==root;cursor=dirname(cursor))if(existsSync(cursor)&&(await lstat(cursor)).isSymbolicLink())throw Error('资料路径不能使用符号链接')
    const old=[join(root,'native',item.id,item.name),join(root,item.id)].find(candidate=>candidate!==path&&existsSync(candidate))
    if(old){const inside=relative(root,resolve(old));if(inside.startsWith('..')||isAbsolute(inside))throw Error('旧资料路径超出资料库');for(let cursor=resolve(old);cursor!==root;cursor=dirname(cursor))if((await lstat(cursor)).isSymbolicLink())throw Error('旧资料路径不能使用符号链接')}
    if(item.kind==='file'&&existsSync(path)&&!(await stat(path)).isFile())throw Error('磁盘上已有同名文件夹：'+path)
    if(item.kind==='file'&&existsSync(path)&&old){const a=await stat(path),b=await stat(old);if(a.ino!==b.ino||a.dev!==b.dev)throw Error('磁盘上已有同名文件，未覆盖：'+path)}
    if(item.kind==='folder'&&existsSync(path)&&!(await stat(path)).isDirectory())throw Error('磁盘上已有同名文件：'+path)
    plans.push({item,path,old})
  }
  for(const {path} of plans.filter(p=>p.item.kind==='folder').sort((a,b)=>a.path.length-b.path.length))await mkdir(path,{recursive:true})
  for(const {item,path,old} of plans.filter(p=>p.item.kind==='file'))if(old){
    await mkdir(dirname(path),{recursive:true})
    if(!existsSync(path))await link(old,path)
    await unlink(old)
    await rmdir(join(root,'native',item.id)).catch(()=>{})
  }
  await rmdir(join(root,'native')).catch(()=>{})
}
