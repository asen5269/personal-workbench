import http from 'node:http'
import https from 'node:https'
import {Readable} from 'node:stream'

export function requestPlatformPage(url,{headers,signal}) {
  return new Promise((resolve,reject)=>{
    const request=(new URL(url).protocol==='https:'?https:http).get(url,{headers,signal},response=>{
      const responseHeaders=new Headers()
      for(let i=0;i<response.rawHeaders.length;i+=2)responseHeaders.append(response.rawHeaders[i],response.rawHeaders[i+1])
      const body=[204,205,304].includes(response.statusCode)?null:Readable.toWeb(response)
      resolve(new Response(body,{status:response.statusCode,headers:responseHeaders}))
    })
    request.on('error',reject)
  })
}
