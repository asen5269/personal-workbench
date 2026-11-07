import test from 'node:test'
import assert from 'node:assert/strict'
import { unzipSync,strFromU8 } from 'fflate'
import { createImageArchive } from '../src/utils/image-batch.js'

test('图片批量打包保留全部结果及中文文件名，同名输出不覆盖',async()=>{
  const results=[{name:'图标.png',blob:new Blob(['first'])},{name:'图标.png',blob:new Blob(['second'])},{name:'ICON.ico',blob:new Blob(['third'])},{name:'icon.ico',blob:new Blob(['fourth'])}]
  const archive=await createImageArchive(results)
  assert.equal(archive.type,'application/zip')
  const entries=unzipSync(new Uint8Array(await archive.arrayBuffer()))
  assert.deepEqual(Object.keys(entries),['图标.png','图标 (2).png','ICON.ico','icon (2).ico'])
  assert.equal(strFromU8(entries['图标.png']),'first');assert.equal(strFromU8(entries['图标 (2).png']),'second')
  assert.equal(strFromU8(entries['icon (2).ico']),'fourth')
})

test('ZIP 文件名不创建子目录，过大的结果要求分别下载',async()=>{
  const archive=await createImageArchive([{name:'../folder/image.svg',blob:new Blob(['<svg/>'])}])
  const entries=unzipSync(new Uint8Array(await archive.arrayBuffer()))
  assert.deepEqual(Object.keys(entries),['.._folder_image.svg'])
  await assert.rejects(createImageArchive([{name:'large.png',blob:{size:201*1024**2}}]),/分别下载/)
})
