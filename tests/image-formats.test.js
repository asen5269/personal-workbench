import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import decodeIco from 'decode-ico'
import Fastify from 'fastify'
import { registerFileTools } from '../server/lib/file-tools.js'
import { convertUniversal } from '../server/lib/universal-converter.js'

const source=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="150" height="100"><rect x="30" y="20" width="60" height="50" fill="#cc3344"/><circle cx="110" cy="60" r="18" fill="#338866"/></svg>')
function upload(buffer,format,name='图标.svg',scale=1){return {method:'POST',url:'/api/file-tools/convert?mode=image',headers:{'content-type':'multipart/form-data; boundary=image-formats'},payload:Buffer.concat([Buffer.from(`--image-formats\r\nContent-Disposition: form-data; name="format"\r\n\r\n${format}\r\n--image-formats\r\nContent-Disposition: form-data; name="scale"\r\n\r\n${scale}\r\n--image-formats\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),buffer,Buffer.from('\r\n--image-formats--\r\n')])}}

test('SVG 实际生成矢量路径，不嵌入位图，并保持缩放后的画布尺寸',async()=>{
  const app=Fastify();registerFileTools(app)
  try{
    const png=await sharp(source).png().toBuffer()
    const result=await app.inject(upload(png,'svg','图形.png',2))
    assert.equal(result.statusCode,200,result.body)
    assert.match(result.headers['content-type'],/image\/svg\+xml/)
    assert.match(result.body,/<path\b/)
    assert.doesNotMatch(result.body,/<image\b|data:image|<script\b/)
    const metadata=await sharp(result.rawPayload).metadata()
    assert.equal(metadata.width,300);assert.equal(metadata.height,200)
    assert.match(result.headers['content-disposition'],/\.svg$/)
  }finally{await app.close()}
})

test('ICO 为六种尺寸的有效图标，透明留白且可重新解码成 PNG/JPEG',async()=>{
  const app=Fastify();registerFileTools(app)
  try{
    const result=await app.inject(upload(source,'ico'))
    assert.equal(result.statusCode,200,result.body)
    assert.equal(result.rawPayload.readUInt32LE(0),0x00010000)
    const frames=decodeIco(result.rawPayload)
    assert.deepEqual(frames.map(frame=>frame.width),[16,32,48,64,128,256])
    assert.ok(frames.every(frame=>frame.width===frame.height))
    assert.equal(frames[5].data[3],0)
    const png=await app.inject(upload(result.rawPayload,'png','favicon.ico'))
    assert.equal(png.statusCode,200,png.body)
    assert.equal((await sharp(png.rawPayload).metadata()).width,256)
    const jpeg=await app.inject(upload(result.rawPayload,'jpeg','favicon.ico'))
    assert.equal(jpeg.statusCode,200,jpeg.body)
    assert.equal((await sharp(jpeg.rawPayload).metadata()).format,'jpeg')
    assert.match(jpeg.headers['content-disposition'],/\.jpeg$/)
    const jpg=await app.inject(upload(source,'jpg'))
    assert.equal(jpg.statusCode,200,jpg.body);assert.match(jpg.headers['content-disposition'],/\.jpg$/)
    assert.equal((await app.inject(upload(source,'ico','input.svg',2))).statusCode,400)
    const invalid=Buffer.alloc(6);invalid.writeUInt32LE(0x00010000);invalid.writeUInt16LE(257,4)
    assert.equal((await app.inject(upload(invalid,'png','broken.ico'))).statusCode,422)
  }finally{await app.close()}
})

test('通用转换同样支持 JPEG、ICO 和真正的 SVG 输出',async()=>{
  const ico=await convertUniversal({name:'input.svg',buffer:source},'ico')
  assert.equal(ico.mime,'image/x-icon');assert.equal(decodeIco(ico.buffer).length,6)
  const jpeg=await convertUniversal({name:'input.ico',buffer:ico.buffer},'jpeg')
  assert.equal(jpeg.name,'input.jpeg');assert.equal(jpeg.mime,'image/jpeg')
  const svg=await convertUniversal({name:'input.ico',buffer:ico.buffer},'svg')
  assert.equal(svg.mime,'image/svg+xml');assert.match(svg.buffer.toString(),/<path\b/)
})

test('高精度保留超过 32 色和细线，1280 像素图片不再降到 1024',async()=>{
  const app=Fastify();registerFileTools(app)
  const width=1280,height=64,pixels=Buffer.alloc(width*height*3)
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*3,line=x%31===0&&y<40
    pixels[i]=line?255:Math.round(20+220*x/(width-1));pixels[i+1]=line?255:Math.round(50+140*x/(width-1));pixels[i+2]=line?255:Math.round(150-80*x/(width-1))
  }
  try{
    const png=await sharp(pixels,{raw:{width,height,channels:3}}).png().toBuffer()
    const response=await app.inject(upload(png,'svg','gradient.png'))
    assert.equal(response.statusCode,200,response.body)
    assert.match(response.body,/viewBox="0 0 1280 64"/)
    assert.ok(new Set([...response.body.matchAll(/fill="(#[0-9a-f]+)"/gi)].map(match=>match[1])).size>32)
    const rendered=await sharp(response.rawPayload).removeAlpha().raw().toBuffer()
    let error=0;for(let i=0;i<pixels.length;i++)error+=Math.abs(pixels[i]-rendered[i])
    assert.ok(error/pixels.length<3,`渲染平均误差 ${error/pixels.length}`)
  }finally{await app.close()}
})

test('原生 SVG 保留渐变、文字与路径，仅在缩放时修改画布',async()=>{
  const app=Fastify();registerFileTools(app)
  const native=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="150" height="100" viewBox="0 0 150 100"><defs><linearGradient id="g"><stop stop-color="#123456"/><stop offset="1" stop-color="#abcdef"/></linearGradient></defs><rect width="150" height="100" fill="url(#g)"/><text x="10" y="40">原生矢量文字</text><path id="thin" d="M10 50h100" stroke="white" stroke-width=".1"/></svg>')
  try{
    const unchanged=await app.inject(upload(native,'svg'))
    assert.equal(unchanged.statusCode,200,unchanged.body);assert.deepEqual(unchanged.rawPayload,native)
    const scaled=await app.inject(upload(native,'svg','source.svg',2))
    assert.equal(scaled.statusCode,200,scaled.body)
    assert.match(scaled.body,/linearGradient/);assert.match(scaled.body,/原生矢量文字/);assert.match(scaled.body,/id="thin"/)
    assert.match(scaled.body,/viewBox="0 0 150 100"/)
    const metadata=await sharp(scaled.rawPayload).metadata();assert.equal(metadata.width,300);assert.equal(metadata.height,200)
  }finally{await app.close()}
})
