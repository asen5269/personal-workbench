import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {libraryPath,migrateLibrary} from '../server/lib/library-storage.js'

test('历史 UUID 文件及 native 文件迁移为真实目录和原文件名，重复执行不改内容',async()=>{
  const root=await mkdtemp(join(tmpdir(),'library-layout-'))
  const items=[{id:'folder',name:'视频资料',kind:'folder',parent:''},{id:'nested',name:'课程',kind:'folder',parent:'folder'},{id:'video',name:'第一课.mp4',kind:'file',parent:'nested'},{id:'native-file',name:'说明.txt',kind:'file',parent:'folder'}]
  const get=id=>items.find(item=>item.id===id)
  try{
    await writeFile(join(root,'video'),Buffer.from([0,1,2,255]))
    await mkdir(join(root,'native','native-file'),{recursive:true})
    await writeFile(join(root,'native','native-file','说明.txt'),'说明')
    await migrateLibrary(root,items,get)
    assert.deepEqual(await readFile(join(root,'视频资料','课程','第一课.mp4')),Buffer.from([0,1,2,255]))
    assert.equal(await readFile(join(root,'视频资料','说明.txt'),'utf8'),'说明')
    await assert.rejects(()=>stat(join(root,'video')),/ENOENT/)
    await migrateLibrary(root,items,get)
    assert.equal(libraryPath(root,items[2],get),join(root,'视频资料','课程','第一课.mp4'))
    assert.throws(()=>libraryPath(root,{id:'bad',name:'../outside'},get),/名称/)
  }finally{await rm(root,{recursive:true,force:true})}
})
test('迁移遇到同名磁盘文件时保留两份原内容，不覆盖',async()=>{
  const root=await mkdtemp(join(tmpdir(),'library-conflict-'))
  try{
    await writeFile(join(root,'old-id'),'library content')
    await writeFile(join(root,'existing.txt'),'disk content')
    await assert.rejects(()=>migrateLibrary(root,[{id:'old-id',name:'existing.txt',kind:'file',parent:''}],()=>null),/未覆盖/)
    assert.equal(await readFile(join(root,'old-id'),'utf8'),'library content')
    assert.equal(await readFile(join(root,'existing.txt'),'utf8'),'disk content')
  }finally{await rm(root,{recursive:true,force:true})}
})
