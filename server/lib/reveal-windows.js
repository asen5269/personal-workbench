import koffi from 'koffi'
import {join,basename,dirname} from 'node:path'

const system=join(process.env.SystemRoot||'C:\\Windows','System32')
const shell=koffi.load(join(system,'shell32.dll')),user=koffi.load(join(system,'user32.dll')),kernel=koffi.load(join(system,'kernel32.dll')),ole=koffi.load(join(system,'ole32.dll'))
const initialize=ole.func('int32 __stdcall CoInitializeEx(void *reserved, uint32 flags)')
const parse=shell.func('int32 __stdcall SHParseDisplayName(str16 name, void *bind, _Out_ void **pidl, uint32 attributes, void *outAttributes)')
const reveal=shell.func('int32 __stdcall SHOpenFolderAndSelectItems(void *pidl, uint32 count, void *children, uint32 flags)')
const free=ole.func('void __stdcall CoTaskMemFree(void *memory)')
const findNext=user.func('void * __stdcall FindWindowExW(void *parent, void *after, str16 className, str16 title)')
const windowText=user.func('int __stdcall GetWindowTextW(void *window, void *text, int length)')
const foreground=user.func('void * __stdcall GetForegroundWindow()')
const windowThread=user.func('uint32 __stdcall GetWindowThreadProcessId(void *window, void *process)')
const currentThread=kernel.func('uint32 __stdcall GetCurrentThreadId()')
const attach=user.func('int __stdcall AttachThreadInput(uint32 from, uint32 to, int attached)')
const restore=user.func('int __stdcall ShowWindowAsync(void *window, int command)')
const activate=user.func('int __stdcall SetForegroundWindow(void *window)')
const peek=user.func('int __stdcall PeekMessageW(void *message, void *window, uint32 min, uint32 max, uint32 flags)')
const initialized=initialize(null,2)
if(initialized<0&&initialized!==-2147417850)throw Error('无法初始化 Windows 文件管理器')

function withForeground(action){
  peek(Buffer.alloc(64),null,0,0,0)
  const current=currentThread(),target=windowThread(foreground(),null)
  const attached=target&&target!==current&&attach(current,target,1)
  try{return action()}finally{if(attached)attach(current,target,0)}
}

function folderWindow(folder){
  const name=basename(folder),matches=[],active=foreground()
  let window=null
  while((window=findNext(null,window,'CabinetWClass',null))){
    const buffer=Buffer.alloc(2048),length=windowText(window,buffer,1024),title=buffer.toString('utf16le',0,length*2)
    if(![name,folder].some(value=>title===value||title.startsWith(value+' - ')||title.startsWith(value+' — ')))continue
    if(active&&koffi.address(active)===koffi.address(window))return window
    matches.push(window)
  }
  return matches.length===1?matches[0]:null
}

export async function revealWindowsFile(path){
  const pidl=[null]
  const parsed=parse(path,null,pidl,0,null)
  if(parsed<0)throw Error('Windows 无法定位此文件')
  try{if(withForeground(()=>reveal(pidl[0],0,null,0))<0)throw Error('无法打开资源管理器')}
  finally{free(pidl[0])}
  const folder=dirname(path)
  for(let attempt=0;attempt<10;attempt++){
    const window=folderWindow(folder)
    if(window){const activated=withForeground(()=>{restore(window,9);activate(window);const active=foreground();return active&&koffi.address(active)===koffi.address(window)});if(activated)return}
    await new Promise(resolve=>setTimeout(resolve,50))
  }
}
