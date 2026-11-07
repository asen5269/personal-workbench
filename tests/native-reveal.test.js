import test from 'node:test'
import assert from 'node:assert/strict'
import {revealFileInFolder} from '../server/lib/native-open.js'

test('Windows dispatches a Unicode path directly to native file manager',async()=>{
  const path="C:\\资料 库\\视频资料\\片段 ' 1.mp4",calls=[]
  await revealFileInFolder(path,{platform:'win32',windowsReveal:async value=>calls.push(value),run:()=>assert.fail('No shell process should start')})
  assert.deepEqual(calls,[path])
})
test('macOS passes file path as a separate Finder reveal argument without shell interpolation',async()=>{
  const path="/Users/test/资料 库/视频'$(echo test).mp4",calls=[]
  await revealFileInFolder(path,{platform:'darwin',run:async(...args)=>calls.push(args),windowsReveal:()=>assert.fail('Windows API must not load')})
  assert.deepEqual(calls,[['/usr/bin/open',['-R',path],{timeout:10000}]])
})
test('native errors propagate and unsupported systems do not launch a process',async()=>{
  await assert.rejects(()=>revealFileInFolder('/test',{platform:'darwin',run:async()=>{throw Error('Finder unavailable')}}),/Finder unavailable/)
  await assert.rejects(()=>revealFileInFolder('/test',{platform:'linux',run:()=>assert.fail()}),/Windows 或 macOS/)
})
