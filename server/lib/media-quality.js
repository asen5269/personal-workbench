import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtemp,rm,stat,open} from 'node:fs/promises'
import {createWriteStream} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Readable,Transform} from 'node:stream'
import {pipeline} from 'node:stream/promises'
const exec=promisify(execFile)
function isWatermarked(url){const u=new URL(url);return u.pathname.includes('/playwm/')||u.searchParams.get('watermark')==='1'}
export async function checkMediaTools(){for(const name of ['ffprobe','ffmpeg'])try{await exec(name,['-version'],{windowsHide:true,timeout:10000})}catch{throw Error(`需要安装 ${name} 并加入 PATH；无需 Python 或 skills`)}}
export function rankMeasured(a,b){return b.width*b.height-a.width*a.height||b.video_bit_rate-a.video_bit_rate||b.fps-a.fps||b.size_bytes-a.size_bytes}
export async function probeFile(path){
  const {stdout}=await exec('ffprobe',['-v','error','-count_packets','-show_streams','-show_format','-of','json',path],{windowsHide:true,timeout:120000,maxBuffer:4*1024*1024})
  const info=JSON.parse(stdout),v=info.streams?.find(s=>s.codec_type==='video'&&!s.disposition?.attached_pic),duration=Number(v?.duration||info.format?.duration),size=(await stat(path)).size
  if(!v?.width||!v?.height||!duration||!(Number(v.nb_read_packets)>0))throw Error('文件中没有有效视频画面')
  const {stdout:packets}=await exec('ffprobe',['-v','error','-select_streams','v:0','-show_entries','packet=size','-of','csv=p=0',path],{windowsHide:true,timeout:120000,maxBuffer:64*1024*1024})
  const bytes=packets.split('\n').reduce((n,line)=>n+(parseInt(line,10)||0),0),[num,den]=String(v.avg_frame_rate||'0/1').split('/').map(Number)
  return {width:v.width,height:v.height,video_bit_rate:Math.round(bytes*8/duration),fps:den?num/den:0,size_bytes:size,duration,codec:v.codec_name,has_audio:info.streams.some(s=>s.codec_type==='audio')}
}
export async function prepareMedia(data,{original=false,fetchImpl=fetch,referer='',onProgress=()=>{}}={}){
  const all=[...new Map((data.video_candidates?.length?data.video_candidates:data.videos.map(url=>({url}))).map(c=>[c.url,c])).values()]
  if(!all.length)return data
  if(!original&&!all.find(c=>c.url===data.videos[0])?.audio_url)return data
  await checkMediaTools()
  const dir=await mkdtemp(join(tmpdir(),'workbench-media-')),report={mode:original?'original':'standard',policy:'measured pixels > video bitrate > fps > bytes',original_verified:false,reencoded:false,candidates:[],partial:false}
  let deadline;const totalLimit=1024*1024*1024;let total=0,best
  async function download(url,file){
    deadline=Date.now()+90000
    const chunkSize=4*1024*1024
    async function request(start,end){if(Date.now()>deadline)throw Error('画质探测达到时间限制');return fetchImpl(url,{headers:{Referer:referer,'User-Agent':'Mozilla/5.0',Range:`bytes=${start}-${end}`},signal:AbortSignal.timeout(Math.max(1,Math.min(60000,deadline-Date.now())))})}
    const response=await request(0,chunkSize-1);if(original&&data.platform==='douyin'&&response.url&&isWatermarked(response.url)){await response.body?.cancel();throw Error('跳转到带水印地址，已排除')}if(!response.ok)throw Error('HTTP '+response.status)
    const range=response.headers.get('content-range')?.match(/^bytes 0-(\d+)\/(\d+)$/),length=range?Number(range[2]):Number(response.headers.get('content-length')||0)
    if(length>512*1024*1024){await response.body?.cancel();throw Error('素材超过单文件 512MB 限制')}
    let received=0
    const counter=()=>new Transform({transform(chunk,encoding,callback){received+=chunk.length;total+=chunk.length;onProgress({bytes:total});if(total>totalLimit||received>512*1024*1024)callback(Error('素材超过探测流量限制'));else callback(null,chunk)}})
    await pipeline(Readable.fromWeb(response.body),counter(),createWriteStream(file))
    if(response.status!==206||!range)return
    const firstSize=(await stat(file)).size;if(firstSize!==Number(range[1])+1)throw Error('素材分段不完整')
    if(firstSize===length)return
    const handle=await open(file,'r+');let next=firstSize
    try{const workers=Array.from({length:3},async()=>{while(next<length){const start=next,end=Math.min(length-1,start+chunkSize-1);next=end+1;const part=await request(start,end);if(part.status!==206||part.headers.get('content-range')!==`bytes ${start}-${end}/${length}`){await part.body?.cancel();throw Error('平台不支持完整分段下载')}const chunks=[];let size=0;for await(const chunk of part.body){size+=chunk.length;total+=chunk.length;onProgress({bytes:total});if(size>end-start+1||total>totalLimit)throw Error('素材超过探测流量限制');chunks.push(chunk)}if(size!==end-start+1)throw Error('素材分段不完整');const buffer=Buffer.concat(chunks);let offset=0;while(offset<buffer.length){const written=await handle.write(buffer,offset,buffer.length-offset,start+offset);offset+=written.bytesWritten}}});const outcomes=await Promise.allSettled(workers);const failed=outcomes.find(r=>r.status==='rejected');if(failed)throw failed.reason}finally{await handle.close()}
  }
  try{
    const candidates=original?[...all].sort((a,b)=>Number(!!b.default_probe)-Number(!!a.default_probe)):[all.find(c=>c.url===data.videos[0])||all[0]]
    for(const [i,candidate] of candidates.entries()){
      if(total>=totalLimit){report.partial=true;break}
      const path=join(dir,`${i}.video`),entry={url:candidate.url,declared:candidate.declared||{}}
      if(original&&data.platform==='douyin'&&isWatermarked(candidate.url)){entry.error='已排除带水印地址';report.candidates.push(entry);continue}
      try{onProgress({stage:'下载画质候选',candidate:i+1,candidates:candidates.length,bytes:total});await download(candidate.url,path);onProgress({stage:'校验视频画质'});entry.measured=await probeFile(path);const expected=Number(data.video_duration_ms||0)/1000;if(expected&&Math.abs(entry.measured.duration-expected)>Math.max(2,expected*.03))throw Error('视频时长不完整');if(!best||rankMeasured(entry.measured,best.measured)<0){best={...candidate,path,measured:entry.measured}}}catch(error){entry.error=error.message;await rm(path,{force:true})}report.candidates.push(entry)
    }
    if(!best)throw Error('没有通过实测校验的视频候选；'+report.candidates.map(c=>c.error).filter(Boolean).join('；'))
    onProgress({stage:'整理音视频文件',bytes:total});let selected=best.path
    if(best.audio_url){const audio=join(dir,'audio'),merged=join(dir,'merged.mp4');await download(best.audio_url,audio);await exec('ffmpeg',['-v','error','-y','-i',best.path,'-i',audio,'-map','0:v:0','-map','1:a:0','-c','copy','-movflags','+faststart',merged],{windowsHide:true,timeout:120000,maxBuffer:1024*1024});const measured=await probeFile(merged);if(!measured.has_audio)throw Error('音轨合并失败');selected=merged;report.muxed=true}
    else{const mp4=join(dir,'selected.mp4');await exec('ffmpeg',['-v','error','-y','-i',selected,'-map','0:v:0','-map','0:a?','-c','copy','-movflags','+faststart',mp4],{windowsHide:true,timeout:120000,maxBuffer:1024*1024});selected=mp4}
    report.selected={url:best.url,measured:best.measured,watermark_endpoint:new URL(best.url).pathname.includes('/playwm/')};report.transfer_bytes=total;report.partial ||= report.candidates.some(c=>c.error&&!c.error.includes('已排除'));report.default_probes=report.candidates.filter(c=>new URL(c.url).searchParams.get('ratio')==='default').map(c=>({url:c.url,completed:!!c.measured,error:c.error}));report.fallback_reason=original&&!report.default_probes.some(c=>c.completed)?'默认高清候选均未通过校验，当前文件仅为本次实测可用画质，不保证高于默认画质':null
    const timer=setTimeout(()=>rm(dir,{recursive:true,force:true}).catch(()=>{}),3600000);timer.unref()
    return {...data,videos:[best.url],local_video:selected,quality_report:report,warnings:[...data.warnings,...(report.partial?['部分画质候选不可用或达到探测限制，已选择本次实测最高可用画质']:[]),...(report.selected.watermark_endpoint?['本次最高画质来自平台水印播放地址，可能包含平台水印']:[])]}
  }catch(error){error.qualityReport=report;await rm(dir,{recursive:true,force:true});throw error}
}
