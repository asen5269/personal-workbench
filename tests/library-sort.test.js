import test from 'node:test'
import assert from 'node:assert/strict'
import {sortLibraryItems} from '../src/utils/library-sort.js'
const files=[{id:'a',name:'视频10.mp4',kind:'file',size:100,created:20},{id:'b',name:'视频2.mp4',kind:'file',size:200,created:10},{id:'c',name:'资料',kind:'folder',size:0,created:30},{id:'d',name:'说明.txt',kind:'file',size:50,created:5}]
test('natural name sorting keeps folders first in both directions without mutating source',()=>{
  const original=[...files],asc=sortLibraryItems(files),desc=sortLibraryItems(files,'name','desc')
  assert.equal(asc[0].id,'c');assert.equal(desc[0].id,'c')
  assert.ok(asc.findIndex(x=>x.id==='b')<asc.findIndex(x=>x.id==='a'))
  assert.ok(desc.findIndex(x=>x.id==='a')<desc.findIndex(x=>x.id==='b'))
  assert.deepEqual(files,original)
})
test('size, added time and extension sorting support direction and optional folder grouping',()=>{
  assert.deepEqual(sortLibraryItems(files,'size','desc').map(x=>x.id),['c','b','a','d'])
  assert.deepEqual(sortLibraryItems(files,'created','asc',false).map(x=>x.id),['d','b','a','c'])
  assert.deepEqual(sortLibraryItems(files,'type','asc').map(x=>x.id),['c','b','a','d'])
})
