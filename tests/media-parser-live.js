import {parseMedia} from '../server/lib/media-parser.js'
const data=await parseMedia('9.20 红色高棉如何夺取柬埔寨？ https\\://v.douyin.com/j3sl766aaIc/ 复制此链接')
if(!data.videos.length)throw Error('No video returned')
const response=await fetch(data.videos[0],{headers:{Range:'bytes=0-1023',Referer:'https://www.douyin.com/'},signal:AbortSignal.timeout(30000)})
await response.body?.cancel()
if(!response.ok)throw Error('Media HTTP '+response.status)
console.log(JSON.stringify({id:data.note_id,title:data.title,videos:data.videos.length,images:data.images.length,mediaStatus:response.status}))
