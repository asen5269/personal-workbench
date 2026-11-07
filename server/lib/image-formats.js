import sharp from 'sharp'
import decodeIco from 'decode-ico'
import pngToIco from 'png-to-ico'
import { Worker } from 'node:worker_threads'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

export async function preserveNativeSvg(buffer,{scale=1,width,height}={}) {
  const metadata=await sharp(buffer,{limitInputPixels:40_000_000}).metadata()
  if(metadata.format!=='svg')return null
  const ratio=scale!==1?scale:Math.min(width?width/metadata.width:1,height?height/metadata.height:1)
  const outputWidth=Math.max(1,Math.round(metadata.width*ratio)),outputHeight=Math.max(1,Math.round(metadata.height*ratio))
  if(outputWidth>12000||outputHeight>12000||outputWidth*outputHeight>40_000_000)throw Object.assign(Error('SVG 画布过大，请选择较小倍数'),{statusCode:400})
  if(ratio===1)return {data:buffer,width:metadata.width,height:metadata.height,mime:'image/svg+xml'}
  const encoding=buffer[0]===0xff&&buffer[1]===0xfe?'utf-16le':buffer[0]===0xfe&&buffer[1]===0xff?'utf-16be':buffer.subarray(0,256).toString('latin1').match(/<\?xml[^>]*encoding=["']([^"']+)/i)?.[1]||'utf-8'
  const text=new TextDecoder(encoding).decode(buffer).replace(/(<\?xml[^>]*encoding=)(["'])[^"']+\2/i,'$1"UTF-8"')
  const xml=new DOMParser({onError:(level,message)=>{if(level!=='warning')throw Error(message)}}).parseFromString(text,'image/svg+xml')
  const root=xml.documentElement
  if(root.localName!=='svg')throw Error('SVG 根节点无效')
  if(!root.hasAttribute('viewBox'))root.setAttribute('viewBox',`0 0 ${metadata.width} ${metadata.height}`)
  root.setAttribute('width',String(outputWidth));root.setAttribute('height',String(outputHeight))
  return {data:Buffer.from(new XMLSerializer().serializeToString(xml)),width:outputWidth,height:outputHeight,mime:'image/svg+xml'}
}

export async function normalizeImage(buffer) {
  if(buffer.length<6||buffer.readUInt32LE(0)!==0x00010000)return buffer
  if(buffer.readUInt16LE(4)>256)throw Error('ICO 图层数量过多')
  const frame=decodeIco(buffer).filter(frame=>frame.width>0&&frame.height>0&&frame.width<=256&&frame.height<=256).sort((a,b)=>b.width*b.height-a.width*a.height)[0]
  if(!frame)throw Error('ICO 没有有效的图像')
  if(frame.type==='png')return Buffer.from(frame.data)
  return sharp(Buffer.from(frame.data),{raw:{width:frame.width,height:frame.height,channels:4}}).png().toBuffer()
}

function trace(png) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./svg-worker.js',import.meta.url),{workerData:png})
    const timer=setTimeout(()=>{worker.terminate();reject(Object.assign(Error('高精度 SVG 描摹超过 2 分钟，请缩小图片后重试'),{statusCode:504}))},120000)
    worker.once('message',result=>{clearTimeout(timer);worker.terminate();result.error?reject(Error(result.error)):resolve(result.svg)})
    worker.once('error',error=>{clearTimeout(timer);reject(error)})
    worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error('SVG 描摹进程已停止'))})
  })
}

export async function encodeSpecialImage(processor,format,options={}) {
  if(format==='svg'&&options.original){const original=await preserveNativeSvg(options.original,options);if(original)return original}
  const {data,info}=await processor.png().toBuffer({resolveWithObject:true})
  if(format==='ico') {
    const sizes=[16,32,48,64,128,256]
    const frames=await Promise.all(sizes.map(size=>sharp(data).resize(size,size,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer()))
    return {data:await pngToIco(frames),width:256,height:256,mime:'image/x-icon'}
  }
  const sampleScale=Math.min(1,4096/Math.max(info.width,info.height),Math.sqrt(8_000_000/(info.width*info.height)))
  const png=await sharp(data).resize({width:Math.max(1,Math.floor(info.width*sampleScale)),height:Math.max(1,Math.floor(info.height*sampleScale)),fit:'fill'}).png().toBuffer({resolveWithObject:true})
  const svg=await trace(png.data)
  const output=svg.replace(/<svg\b([^>]*)>/,(_,attributes)=>`<svg${attributes.replace(/\s(?:width|height|viewBox)="[^"]*"/g,'')} width="${info.width}" height="${info.height}" viewBox="0 0 ${png.info.width} ${png.info.height}">`)
  return {data:Buffer.from(output),width:info.width,height:info.height,mime:'image/svg+xml'}
}
