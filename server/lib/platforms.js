import { Innertube, Platform } from 'youtubei.js'
import {evaluateYouTube} from './youtube-runtime.js'
import {CookieJar} from 'tough-cookie'
import {requestPlatformPage} from './platform-request.js'
Platform.shim.eval=evaluateYouTube

const domains={douyin:['douyin.com','iesdouyin.com'],xhs:['xiaohongshu.com','xhslink.com'],bilibili:['bilibili.com','b23.tv'],kuaishou:['kuaishou.com','chenzhongtech.com'],tiktok:['tiktok.com'],youtube:['youtube.com','youtu.be'],x:['twitter.com','x.com']}
export function detectPlatform(url){const host=new URL(url).hostname;return Object.entries(domains).find(([,list])=>list.some(d=>host===d||host.endsWith('.'+d)))?.[0]||'unknown'}
export const platformReferer=p=>({douyin:'https://www.douyin.com/',xhs:'https://www.xiaohongshu.com/',bilibili:'https://www.bilibili.com/',kuaishou:'https://www.kuaishou.com/',tiktok:'https://www.tiktok.com/',youtube:'https://www.youtube.com/',x:'https://x.com/'})[p]
export function jsonAfter(source,marker){
  let start=source.indexOf(marker);if(start<0)return null;start=source.indexOf('{',start+marker.length);if(start<0)return null
  let depth=0,quoted=false,escape=false
  for(let i=start;i<source.length;i++){const c=source[i];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue}if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){try{return JSON.parse(source.slice(start,i+1).replace(/"(?:\\.|[^"\\])*"|\bundefined\b/g,token=>token==='undefined'?'null':token))}catch{return null}}}return null
}
const norm=url=>typeof url==='string'?(url.startsWith('//')?'https:'+url:url):''
const unique=urls=>[...new Set(urls.map(norm).filter(u=>/^https?:\/\//.test(u)))]
function find(data,predicate,depth=0){if(depth>12||!data||typeof data!=='object')return null;if(predicate(data))return data;for(const value of Object.values(data)){const found=find(value,predicate,depth+1);if(found)return found}return null}
function metadataValues(source,name){const values=[];for(const tag of source.match(/<meta\b[^>]*>/gi)||[]){const attrs=Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(m=>[m[1].toLowerCase(),m[3].replaceAll('&amp;','&')]));if((attrs.property||attrs.name)===name&&attrs.content)values.push(attrs.content)}return values}
function metadata(source,name){return metadataValues(source,name)[0]||''}
function xhsImage(image){if(!image||typeof image!=='object')return '';return image.urlDefault||image.urlPre||image.url||image.infoList?.find(x=>x?.imageScene==='WB_DFT'&&x.url)?.url||image.infoList?.find(x=>x?.url)?.url||(image.fileId?'https://ci.xiaohongshu.com/'+image.fileId:'')}
function xhsNote(state,id){const map=find(state,n=>n.noteDetailMap)?.noteDetailMap;const entries=map?[map[id],...Object.values(map)]:[];for(const entry of entries){const note=entry?.note;if(note&&('title'in note||Array.isArray(note.imageList)||note.video))return note}return find(state,n=>Array.isArray(n.imageList)&&('title'in n||'desc'in n))}
function base(platform,url,source=''){return {platform,url,note_id:null,title:metadata(source,'og:title'),content:metadata(source,'og:description'),images:unique([metadata(source,'og:image')]),videos:[],video_candidates:[],warnings:[]}}
function finish(data,candidates){data.video_candidates=candidates.filter(c=>/^https?:\/\//.test(c.url||''));data.videos=unique(data.video_candidates.map(c=>c.url)).slice(0,1);if(!data.videos.length)data.warnings.push('仅获取到公开页面信息，视频可能需要登录或暂不可用');return data}
export async function parsePlatform(url,platform,{fetchImpl=fetch}={}){
  const headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',Referer:platformReferer(platform)}
  if(platform==='xhs')Object.assign(headers,{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',Accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','Accept-Language':'zh-CN,zh;q=0.9'})
  const cookies=new CookieJar()
  const request=platform==='xhs'&&fetchImpl===fetch?requestPlatformPage:fetchImpl
  async function get(target,json=false){for(let n=0;n<8;n++){const cookie=await cookies.getCookieString(target);const response=await request(target,{headers:{...headers,...(cookie?{Cookie:cookie}:{})},redirect:'manual',signal:AbortSignal.timeout(25000)});for(const value of response.headers.getSetCookie?.()||[])await cookies.setCookie(value,target,{ignoreError:true});if([301,302,303,307,308].includes(response.status)&&response.headers.get('location')){await response.body?.cancel();target=new URL(response.headers.get('location'),target).href;if(detectPlatform(target)!==platform)throw Error('平台链接跳转到不支持的地址');continue}if(!response.ok)throw Error('平台返回 HTTP '+response.status);return {data:json?await response.json():await response.text(),url:target}}throw Error('平台链接跳转过多')}
  if(platform==='youtube')return parseYouTube(url)
  if(platform==='x'){
    const id=url.match(/\/status\/(\d+)/)?.[1];if(!id)throw Error('请输入 X/Twitter 帖子链接')
    const {data}=await get(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${((Number(id)/1e15)*Math.PI).toString(36).replace(/(0+|\.)/g,'')}`,true)
    const result={...base(platform,url),note_id:id,title:data.text||'',images:unique((data.photos||[]).map(p=>p.url))}
    const variants=(data.video?.variants||data.mediaDetails?.find(m=>m.type==='video')?.video_info?.variants||[]).filter(v=>(v.type||v.content_type)==='video/mp4').map(v=>({url:v.src||v.url,declared:{bit_rate:v.bitrate}})).sort((a,b)=>(b.declared.bit_rate||0)-(a.declared.bit_rate||0))
    return finish(result,variants)
  }
  const page=await get(url), source=page.data,result=base(platform,page.url,source)
  if(platform==='xhs'){
    result.note_id=page.url.match(/\/(?:explore|discovery\/item)\/([a-f0-9]{24})/)?.[1]||new URL(page.url).searchParams.get('noteId')?.match(/^[a-f0-9]{24}$/)?.[0]||null
    const state=jsonAfter(source,'window.__INITIAL_STATE__'),note=xhsNote(state,result.note_id)
    if(!note){result.images=unique(metadataValues(source,'og:image'));result.warnings.push('仅获取到公开页面信息，完整笔记可能需要登录或分享链接已失效');return result}
    Object.assign(result,{title:note.title||note.name||'',content:note.desc||note.description||'',images:unique((note.imageList||[]).map(xhsImage))})
    if(!result.images.length)result.images=unique([note.video?.image?.url])
    const streams=note.video?.media?.stream||{},candidates=[...(streams.h264||[]),...(streams.h265||[])].filter(v=>v&&typeof v==='object').map(v=>({url:v.backupUrls?.[0]||v.masterUrl,declared:{width:v.width,height:v.height,bit_rate:v.avgBitrate}})).sort((a,b)=>(b.declared.height||0)-(a.declared.height||0))
    const origin=note.video?.consumer?.originVideoKey;if(origin)candidates.unshift({url:'https://sns-video-bd.xhscdn.com/'+origin,source:'originVideoKey'})
    result.video_candidates=candidates.filter(c=>/^https?:\/\//.test(c.url||''));result.videos=unique(result.video_candidates.map(c=>c.url)).slice(0,1)
    if(!result.images.length&&!result.videos.length)result.warnings.push('未获取到图片或视频，作品可能需要登录或暂不可用')
    return result
  }
  if(platform==='bilibili'){
    const id=page.url.match(/BV[\w]+/)?.[0],state=jsonAfter(source,'window.__INITIAL_STATE__')||{},video=state.videoData||{}
    Object.assign(result,{note_id:id,title:video.title||result.title,content:video.desc||result.content,images:unique([video.pic,...result.images])})
    const part=Math.max(0,Number(new URL(page.url).searchParams.get('p')||1)-1),cid=video.pages?.[part]?.cid||state.cid||video.cid
    let play=jsonAfter(source,'window.__playinfo__')?.data
    if(cid&&(video.aid||state.aid||id)){try{const api=await get(`https://api.bilibili.com/x/player/playurl?${id?'bvid='+id:'avid='+(video.aid||state.aid)}&cid=${cid}&qn=127&fnval=4048&fourk=1`,true);if(api.data.code===0&&api.data.data){const fresh=api.data.data;if(fresh.dash?.video?.length||!play?.dash?.video?.length)play=fresh}else result.warnings.push('B站当前仅能读取公开可用清晰度')}catch{result.warnings.push('B站播放接口不可用，尝试页面播放数据')}}
    const audio=[...(play?.dash?.audio||[])].sort((a,b)=>b.bandwidth-a.bandwidth)[0]
    const candidates=(play?.dash?.video||[]).map(v=>({url:v.baseUrl||v.base_url,audio_url:audio?.baseUrl||audio?.base_url,declared:{width:v.width,height:v.height,bit_rate:v.bandwidth},source:'dash'})).sort((a,b)=>(b.declared.height||0)-(a.declared.height||0)||(b.declared.bit_rate||0)-(a.declared.bit_rate||0))
    if(!candidates.length&&play?.durl?.length===1)candidates.push({url:play.durl[0].url,source:'progressive'})
    if(play?.durl?.length>1)result.warnings.push('此作品为分段视频，请使用完整 DASH 流')
    return finish(result,candidates)
  }
  if(platform==='kuaishou'){
    const state=jsonAfter(source,'window.__APOLLO_STATE__')||{},photo=find(state,n=>typeof n.caption==='string'&&(n.videoResource||n.photoUrl))
    result.note_id=page.url.match(/\/(?:short-video|photo)\/([\w-]+)/)?.[1]||null
    if(!photo)return finish(result,[])
    result.title=photo.caption;result.images=unique([photo.coverUrl,...result.images])
    let resource=photo.videoResource?.json||photo.videoResource||{};if(typeof resource==='string'){try{resource=JSON.parse(resource)}catch{resource={}}}
    const candidates=Object.values(resource).flatMap(codec=>(codec?.adaptationSet||[]).flatMap(set=>(set.representation||[]).map(v=>({url:v.url,declared:{width:v.width,height:v.height,bit_rate:v.avgBitrate}})))).sort((a,b)=>(b.declared.height||0)-(a.declared.height||0))
    if(photo.photoUrl)candidates.push({url:photo.photoUrl});if(!candidates.length)for(const [key,value]of Object.entries(state.defaultClient||{}))if(key.includes('Representation')&&value?.url)candidates.push({url:value.url,declared:{bit_rate:value.avgBitrate,width:value.width,height:value.height}});return finish(result,candidates)
  }
  if(platform==='tiktok'){
    const hydration=source.match(/<script[^>]+id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/)?.[1],sigi=source.match(/<script[^>]+id=["']SIGI_STATE["'][^>]*>([\s\S]*?)<\/script>/)?.[1]
    let state;try{state=JSON.parse(hydration||sigi||'{}')}catch{state={}}
    const item=find(state,n=>n.video&&(n.desc||n.id)&&n.video.playAddr)
    if(!item)return finish(result,[])
    result.note_id=String(item.id||'');result.title=item.desc||result.title;result.images=unique([item.video.originCover,item.video.cover,...result.images])
    const candidates=(item.video.bitrateInfo||[]).flatMap(v=>(v.PlayAddr?.UrlList||[]).map(url=>({url,declared:{bit_rate:v.Bitrate}})))
    for(const address of [item.video.playAddr,item.video.downloadAddr])if(typeof address==='string')candidates.unshift({url:address})
    return finish(result,candidates)
  }
  throw Error('暂不支持该平台')
}
let youtube
async function parseYouTube(url){
  const u=new URL(url),id=u.hostname==='youtu.be'?u.pathname.slice(1):u.searchParams.get('v')||u.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/)?.[1]
  if(!id)throw Error('请输入 YouTube 视频链接')
  youtube||=await Innertube.create({generate_session_locally:true,fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.any([AbortSignal.timeout(25000),...(init.signal?[init.signal]:[])])})})
  const info=await youtube.getBasicInfo(id),data=base('youtube',`https://www.youtube.com/watch?v=${id}`)
  data.note_id=id;data.title=info.basic_info.title||'';data.content=info.basic_info.short_description||'';data.images=unique((info.basic_info.thumbnail||[]).map(x=>x.url))
  if(info.playability_status?.status!=='OK')throw Error(info.playability_status?.reason||'该视频无法公开访问')
  const formats=[...(info.streaming_data?.formats||[]),...(info.streaming_data?.adaptive_formats||[])],audio=formats.filter(f=>f.has_audio&&!f.has_video).sort((a,b)=>b.bitrate-a.bitrate)[0],candidates=[]
  let audioUrl;try{audioUrl=await audio?.decipher(youtube.session.player)}catch{}
  for(const f of formats.filter(f=>f.has_video)){try{const candidate={url:await f.decipher(youtube.session.player),declared:{width:f.width,height:f.height,bit_rate:f.bitrate},source:f.has_audio?'progressive':'dash'};if(!f.has_audio){if(!audioUrl)continue;candidate.audio_url=audioUrl}candidates.push(candidate)}catch{}}
  candidates.sort((a,b)=>Number(!!a.audio_url)-Number(!!b.audio_url)||(b.declared.height||0)-(a.declared.height||0))
  return finish(data,candidates)
}
