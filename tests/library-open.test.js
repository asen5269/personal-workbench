import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import Database from 'better-sqlite3'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,basename} from 'node:path'
import {registerLibrary} from '../server/lib/library.js'

test('定位文件：限定来源、保留文件名、任意类型仅定位，编辑后下载读取同一文件',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'workbench-native-test-'))
  const app=Fastify(),db=new Database(':memory:'),opened=[]
  registerLibrary(app,db,directory,{revealFile:async path=>opened.push(path)})
  const upload=async name=>(await app.inject({method:'POST',url:'/api/library/files?name='+encodeURIComponent(name),headers:{'content-type':'application/octet-stream'},payload:'before'})).json()
  const request=(id,extra={})=>app.inject({method:'POST',url:`/api/library/${id}/reveal`,headers:{'x-workbench-action':'reveal-library-file',...extra}})
  try{
    const item=await upload("测试 ' 文件.txt")
    assert.equal((await app.inject({method:'POST',url:`/api/library/${item.id}/reveal`})).statusCode,403)
    assert.equal((await app.inject({method:'POST',url:`/api/library/${item.id}/open`})).statusCode,404)
    assert.equal((await request(item.id,{origin:'https://evil.test'})).statusCode,403)
    assert.equal((await request('missing')).statusCode,404)
    assert.equal(opened.length,0)
    assert.equal((await request(item.id,{origin:'http://127.0.0.1:5173'})).statusCode,200)
    assert.equal(basename(opened[0]),item.name)
    assert.equal((await app.inject(`/api/library/${item.id}/content`)).body,'before')
    await writeFile(opened[0],'saved after editing')
    assert.equal((await app.inject(`/api/library/${item.id}/content`)).body,'saved after editing')
    const listing=(await app.inject('/api/library')).json()
    assert.equal(listing.items.find(x=>x.id===item.id).size,19)
    assert.equal((await request(item.id)).statusCode,200)
    assert.equal(opened[1],opened[0])
    const executable=await upload('test.exe')
    assert.equal((await request(executable.id)).statusCode,200)
    assert.equal(basename(opened[2]),'test.exe')
    assert.equal((await app.inject({method:'DELETE',url:`/api/library/${item.id}`})).statusCode,200)
  }finally{await app.close();db.close();await rm(directory,{recursive:true,force:true})}
})
