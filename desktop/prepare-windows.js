import { readdirSync, copyFileSync, statSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { prepareDependencies } from './prepare-dependencies.js'
const root=resolve(import.meta.dirname,'..'),out=join(root,'artifacts/desktop-payload')
if(process.platform!=='win32'||process.arch!=='x64')throw Error('此准备脚本仅支持 Windows x64')
mkdirSync(out,{recursive:true})
const copy=(from,to)=>{if(!existsSync(from))throw Error('缺少打包依赖：'+from);if(statSync(from).isFile()){mkdirSync(resolve(to,'..'),{recursive:true});copyFileSync(from,to)}else{mkdirSync(to,{recursive:true});for(const name of readdirSync(from))copy(join(from,name),join(to,name))}}
mkdirSync(join(out,'dist'),{recursive:true})
for(const name of readdirSync(join(root,'dist')))if(!['site-icons','toolbox-images'].includes(name))copy(join(root,'dist',name),join(out,'dist',name))
copy(join(root,'desktop'),join(out,'desktop'))
copy(join(root,'server/lib'),join(out,'server/lib'))
copy(join(root,'server/python'),join(out,'server/python'))
copy(join(root,'server/index.js'),join(out,'server/index.js'))
mkdirSync(join(out,'src/state'),{recursive:true})
copy(join(root,'src/state/food-photos.json'),join(out,'src/state/food-photos.json'))
copy(process.execPath,join(out,'node.exe'))
writeFileSync(join(out,'package.json'),JSON.stringify({private:true,type:'module'}))
prepareDependencies(out)
const scoop=join(process.env.USERPROFILE,'scoop/apps')
console.log('Copying conversion engines')
for(const name of ['ffmpeg.exe','ffprobe.exe'])copy(join(scoop,'ffmpeg/current/bin',name),join(out,'engines/ffmpeg',name))
copy(join(scoop,'ffmpeg/current/LICENSE'),join(out,'engines/ffmpeg-LICENSE'))
copy(join(scoop,'pandoc/current/pandoc.exe'),join(out,'engines/pandoc/pandoc.exe'))
copy(join(scoop,'pandoc/current/COPYING.rtf'),join(out,'engines/pandoc/COPYING.rtf'))
copy(join(scoop,'libreoffice/current/LibreOffice'),join(out,'engines/libreoffice'))
// A venv launcher depends on the original machine. Ship its matching full Python runtime instead.
const venv=readFileSync(join(root,'.venv-pdf/pyvenv.cfg'),'utf8')
const pythonHome=venv.match(/^home\s*=\s*(.+)$/m)?.[1].trim()
copy(pythonHome,join(out,'engines/python'))
copy(join(root,'.venv-pdf/Lib/site-packages'),join(out,'engines/python/Lib/site-packages'))
mkdirSync(join(root,'src-tauri/icons'),{recursive:true})
if(!existsSync(join(root,'src-tauri/icons/icon.png')))await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="52" fill="#618a6c"/><path d="M60 76h136v24h-56v76h65v24H51v-24h65v-76H60z" fill="white"/></svg>')).png().toFile(join(root,'src-tauri/icons/icon.png'))
if(!existsSync(join(out,'NODE-LICENSE.txt'))){const response=await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`);if(!response.ok)throw Error('Node 许可证下载失败');writeFileSync(join(out,'NODE-LICENSE.txt'),await response.text())}
console.log('Windows resources prepared (no user database or library files included).')
