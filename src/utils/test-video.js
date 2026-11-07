export function videoDimensions(resolution, ratio) {
  const [w,h]=ratio.split(':').map(Number)
  const even=value=>Math.round(value/2)*2
  return w>=h?{width:even(resolution*w/h),height:resolution}:{width:resolution,height:even(resolution*h/w)}
}

export function imagePlacement(iw,ih,width,height,fit='contain') {
  const scale=(fit==='cover'?Math.max:Math.min)(width/iw,height/ih)
  return {x:(width-iw*scale)/2,y:(height-ih*scale)/2,width:iw*scale,height:ih*scale}
}

export function drawVideoImage(canvas,image,fit) {
  const ctx=canvas.getContext('2d'),rect=imagePlacement(image.naturalWidth,image.naturalHeight,canvas.width,canvas.height,fit)
  ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height)
  ctx.drawImage(image,rect.x,rect.y,rect.width,rect.height)
}

export async function supportedVideoFormats(width,height) {
  if(!globalThis.VideoEncoder)return []
  const {canEncodeVideo}=await import('mediabunny')
  const formats=[]
  for(const [format,codec] of [['mp4','avc'],['webm','vp9'],['webm','vp8']]) {
    if(formats.some(item=>item.format===format))continue
    if(await canEncodeVideo(codec,{width,height,frameRate:30,bitrate:Math.min(24000000,width*height*4)}))formats.push({format,codec})
  }
  return formats
}

export async function generateTestVideo({image,width,height,seconds,fit,format,codec,signal,onProgress}) {
  const {Output,BufferTarget,Mp4OutputFormat,WebMOutputFormat,CanvasSource}=await import('mediabunny')
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
  drawVideoImage(canvas,image,fit)
  const output=new Output({format:format==='mp4'?new Mp4OutputFormat():new WebMOutputFormat(),target:new BufferTarget()})
  const source=new CanvasSource(canvas,{codec,bitrate:Math.min(24000000,width*height*4)})
  output.addVideoTrack(source,{frameRate:30})
  try {
    await output.start()
    for(let i=0;i<seconds*30;i++) {
      signal.throwIfAborted()
      await source.add(i/30,1/30)
      if(i%10===0){onProgress(Math.floor((i+1)/(seconds*30)*95));await new Promise(resolve=>setTimeout(resolve,0))}
    }
    signal.throwIfAborted();source.close();await output.finalize();signal.throwIfAborted()
    return new Blob([output.target.buffer],{type:`video/${format}`})
  } catch(error) {await output.cancel().catch(()=>{});throw error}
}
