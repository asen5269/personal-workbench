import {createReadStream} from 'node:fs'
import {stat} from 'node:fs/promises'
export async function sendLocalMedia(req,reply,path){
  let size;try{size=(await stat(path)).size}catch{return reply.code(410).send({error:'素材缓存已过期，请重新解析'})}
  reply.header('content-type','video/mp4').header('accept-ranges','bytes')
  if(req.query.download)reply.header('Content-Disposition','attachment; filename="media.mp4"')
  if(!req.headers.range)return reply.header('content-length',size).send(createReadStream(path))
  const range=req.headers.range.match(/^bytes=(\d*)-(\d*)$/)
  if(!range||(!range[1]&&!range[2]))return reply.code(416).header('content-range',`bytes */${size}`).send()
  const start=range[1]?Number(range[1]):Math.max(0,size-Number(range[2])),end=range[1]&&range[2]?Math.min(size-1,Number(range[2])):size-1
  if(start>end||start>=size)return reply.code(416).header('content-range',`bytes */${size}`).send()
  return reply.code(206).header('content-range',`bytes ${start}-${end}/${size}`).header('content-length',end-start+1).send(createReadStream(path,{start,end}))
}
