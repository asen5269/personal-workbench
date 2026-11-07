import {parseMedia} from '../server/lib/media-parser.js'
const links=process.argv.slice(2)
if(!links.length)throw Error('请提供待验证的公开作品链接')
for(const url of links){try{const r=await parseMedia(url);console.log(JSON.stringify({platform:r.platform,id:r.note_id,videos:r.videos.length,images:r.images.length,warnings:r.warnings}))}catch(error){console.log(JSON.stringify({url,error:error.message}));process.exitCode=1}}
