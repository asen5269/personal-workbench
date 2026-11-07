import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const exec=promisify(execFile)
let windows
const nativeWindows=()=>windows||=import('./reveal-windows.js')

export async function warmNativeReveal(){if(process.platform==='win32')await nativeWindows()}
export async function revealFileInFolder(path,{platform=process.platform,run=exec,windowsReveal=async value=>(await nativeWindows()).revealWindowsFile(value)}={}){
  if(platform==='win32')return windowsReveal(path)
  if(platform==='darwin'){await run('/usr/bin/open',['-R',path],{timeout:10000});return}
  throw Error('当前系统暂不支持文件定位，请使用 Windows 或 macOS')
}
