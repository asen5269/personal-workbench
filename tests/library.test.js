import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import Database from 'better-sqlite3'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerLibrary } from '../server/lib/library.js'

test('资料库：多级目录、任意类型文件、原样下载、安全预览、范围读取及删除', async () => {
  const directory = await mkdtemp(join(tmpdir(),'workbench-library-'))
  const db = new Database(':memory:'), app = Fastify()
  registerLibrary(app,db,directory,{maxFileSize:64})
  const post = (url,payload) => app.inject({method:'POST',url,payload})
  const upload = (name, parent='', payload=Buffer.from('hello')) => app.inject({method:'POST',url:`/api/library/files?parent=${parent}&name=${encodeURIComponent(name)}`,headers:{'content-type':'application/octet-stream'},payload})
  try {
    await app.ready()
    const folder = (await post('/api/library/folders',{name:'学习资料'})).json()
    const nested = (await post('/api/library/folders',{name:'文档',parent:folder.id})).json()
    assert.equal((await post('/api/library/folders',{name:'学习资料'})).statusCode,409)
    assert.equal((await post('/api/library/folders',{name:'../bad'})).statusCode,400)
    assert.equal((await upload('lost.txt','missing')).statusCode,404)
    for (const name of ['笔记.txt','笔记.md','表格.xlsx','文档.docx','课件.pptx','视频.mp4','音乐.mp3','图片.png','其他.bin']) {
      const response = await upload(name,nested.id)
      assert.equal(response.statusCode,201,response.body)
      const item = response.json()
      const downloaded = await app.inject(`/api/library/${item.id}/content`)
      assert.equal(downloaded.body,'hello')
      assert.match(downloaded.headers['content-disposition'],/^attachment;/)
      assert.equal((await upload(name,nested.id)).statusCode,409)
    }
    let listing = (await app.inject(`/api/library?parent=${nested.id}`)).json()
    assert.deepEqual(listing.crumbs.map(c=>c.name),['学习资料','文档'])
    assert.equal(listing.items.length,9)
    const recent = (await app.inject('/api/library/recent')).json().items
    assert.equal(recent.length,3)
    assert.ok(recent.every(item=>item.parent===nested.id && listing.items.some(file=>file.id===item.id)))
    assert.ok(recent.every((item,index)=>index===0||recent[index-1].created>=item.created))
    assert.equal((await app.inject('/api/library')).json().items.length,1)
    const file = listing.items.find(item=>item.name==='笔记.txt')
    assert.equal((await app.inject(`/api/library?parent=${file.id}`)).statusCode,404)
    const ranged = await app.inject({url:`/api/library/${file.id}/content`,headers:{range:'bytes=1-3'}})
    assert.equal(ranged.statusCode,206); assert.equal(ranged.body,'ell')
    const suffix = await app.inject({url:`/api/library/${file.id}/content`,headers:{range:'bytes=-2'}})
    assert.equal(suffix.body,'lo')
    assert.equal((await app.inject({url:`/api/library/${file.id}/content`,headers:{range:'bytes=20-30'}})).statusCode,416)
    assert.match((await app.inject(`/api/library/${file.id}/content?preview=1`)).headers['content-type'],/^text\/plain/)
    const html = (await upload('危险.html')).json()
    assert.match((await app.inject(`/api/library/${html.id}/content?preview=1`)).headers['content-disposition'],/^attachment;/)
    const before = (await readdir(directory)).length
    assert.equal((await upload('大文件.bin','',Buffer.alloc(65))).statusCode,413)
    assert.equal((await readdir(directory)).length,before)
    assert.equal((await app.inject({method:'DELETE',url:`/api/library/${folder.id}`})).statusCode,409)
    for (const item of listing.items) assert.equal((await app.inject({method:'DELETE',url:`/api/library/${item.id}`})).statusCode,200)
    assert.equal((await app.inject(`/api/library/${file.id}/content`)).statusCode,404)
    assert.equal((await app.inject({method:'DELETE',url:`/api/library/${nested.id}`})).statusCode,200)
    assert.equal((await app.inject({method:'DELETE',url:`/api/library/${folder.id}`})).statusCode,200)
    await app.inject({method:'DELETE',url:`/api/library/${html.id}`})
    assert.deepEqual(await readdir(directory),[])
  } finally { await app.close(); db.close(); await rm(directory,{recursive:true,force:true}) }
})
