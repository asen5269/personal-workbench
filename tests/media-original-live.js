import {parseMedia} from '../server/lib/media-parser.js'
import {prepareMedia} from '../server/lib/media-quality.js'
import {platformReferer} from '../server/lib/platforms.js'
const parsed=await parseMedia('https://v.douyin.com/j3sl766aaIc/')
try{const result=await prepareMedia(parsed,{original:true,referer:platformReferer(parsed.platform)});console.log(JSON.stringify({platform:result.platform,id:result.note_id,quality:result.quality_report,cache:result.local_video},null,2))}catch(error){console.log(JSON.stringify({error:error.message,quality: error.qualityReport},null,2));process.exitCode=1}
