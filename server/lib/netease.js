import {registerNeteaseAuth} from './netease-auth.js'
import {registerNeteaseLibrary} from './netease-library.js'
const fail=(statusCode,message)=>Object.assign(new Error(message),{statusCode})
const validId=value=>/^\d{1,16}$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value)>0
let sdk
async function defaultCall(method,args){sdk||=(await import('@neteasecloudmusicapienhanced/api')).default;return sdk[method](args)}
export function neteaseMediaUrl(value){
  try {
    const url=new URL(value)
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port||!/(^|\.)(music\.126\.net|music\.163\.com|music\.126\.com)$/i.test(url.hostname))return ''
    url.protocol='https:';return url.href
  }catch{return ''}
}
export function normalizeNeteaseTrack(song,privilege=song?.privilege){
  if(!validId(song?.id))return null
  const album=song.al||song.album||{},artists=song.ar||song.artists||[]
  const playable=!(Number(privilege?.st)<0) && song.noCopyrightRcmd==null
  return {id:`netease:${song.id}`,provider:'netease',providerId:String(song.id),title:String(song.name||'未命名歌曲').slice(0,500),artist:artists.map(a=>a.name).filter(Boolean).join(' / ')||'未知艺人',album:String(album.name||''),genre:'',duration:Math.max(0,Number(song.dt??song.duration)||0)/1000,cover:neteaseMediaUrl(album.picUrl),sourceUrl:`https://music.163.com/#/song?id=${song.id}`,playable,unavailableReason:playable?'':'当前账号或地区无播放权限',accessLabel:[1,4].includes(Number(song.fee))?'会员 / 付费曲目':'',preview:false}
}
export function registerNetease(app,{call=defaultCall,cookie=process.env.NETEASE_COOKIE||''}={}){
  const cache=new Map(),pending=new Map()
  let sessionCookie=cookie,authRevision=0
  function setCookie(value){sessionCookie=value;authRevision++;cache.clear();pending.clear()}
  async function invoke(method,args={},cacheable=true){
    const revision=authRevision,credentials=sessionCookie
    const key=JSON.stringify([revision,method,args]),hit=cache.get(key)
    if(cacheable&&hit?.expires>Date.now())return hit.body
    if(cacheable&&pending.has(key))return pending.get(key)
    const task=(async()=>{
      try{
        const response=await call(method,{...args,cookie:credentials||{},timeout:15000,randomCNIP:false,unblock:'false'})
        const body=response.body
        if(Number(body?.code)!==200&&Number(body?.body?.code)!==200)throw fail([301,401,403].includes(Number(body?.code))?403:502,[301,401,403].includes(Number(body?.code))?'网易云需要登录或当前账号无权限':'网易云服务暂时不可用，请稍后重试')
        if(cache.size>=100)cache.delete(cache.keys().next().value)
        if(cacheable&&revision===authRevision)cache.set(key,{body,expires:Date.now()+30000});return body
      }catch(error){
        if(error.statusCode)throw error
        const code=Number(error.body?.code||error.status)
        if(/风险|频繁|风控/.test(String(error.body?.message||'')))throw fail(429,'网易云触发访问风控，请稍后再试')
        throw fail([301,401,403].includes(code)?403:code===429?429:502,code===429?'网易云请求频繁，请稍后重试':[301,401,403].includes(code)?'网易云登录已失效或账号无权限':'无法连接网易云，请检查网络后重试')
      }
    })()
    if(cacheable)pending.set(key,task)
    try{return await task}finally{if(cacheable)pending.delete(key)}
  }
  const idOf=req=>{const id=req.params.id;if(!validId(id))throw fail(400,'无效的网易云歌曲编号');return id}
  function qualityOf(req){const quality=req.query.quality||'standard';if(!['standard','exhigh','lossless','hires'].includes(quality))throw fail(400,'无效音质选项');return quality}
  async function playback(id,quality='standard'){
    const [details,streams]=await Promise.all([invoke('song_detail',{ids:id}),invoke('song_url_v1',{id,level:quality,crypto:'eapi'})])
    const song=details.songs?.find(s=>String(s.id)===id)
    const privilege=details.privileges?.find(p=>String(p.id)===id)
    const track=normalizeNeteaseTrack(song,privilege),stream=streams.data?.find(s=>String(s.id)===id)
    if(!track)throw fail(404,'歌曲不存在或已下架')
    const url=neteaseMediaUrl(stream?.url)
    if(!track.playable||Number(stream?.code)!==200||!url)throw fail(403,'该歌曲暂无可用播放地址，可能需要登录、会员权限或受版权地区限制')
    const trial=stream.freeTrialInfo
    track.quality=stream.level||quality
    track.preview=!!trial && typeof trial==='object'
    if(track.preview){track.accessLabel='试听';const seconds=Number(trial.end)-Number(trial.start);if(seconds>0)track.duration=seconds}
    else if(Number(stream.time)>0)track.duration=Number(stream.time)/1000
    return {track,url}
  }
  app.register(async routes=>{
    routes.setErrorHandler((error,req,reply)=>reply.code(error.statusCode||500).send({error:error.statusCode?error.message:'网易云操作失败'}))
    registerNeteaseAuth(routes,{call,getCookie:()=>sessionCookie,setCookie})
    registerNeteaseLibrary(routes,{invoke,getCookie:()=>sessionCookie,clearCache:()=>cache.clear(),normalize:normalizeNeteaseTrack,mediaUrl:neteaseMediaUrl})
    routes.get('/api/music/netease/tracks',async req=>{
      const q=req.query.q||'',offset=Number(req.query.offset||0),limit=20
      if(typeof q!=='string'||q.length>120||!Number.isInteger(offset)||offset<0||offset>10000)throw fail(400,'搜索词最多 120 字，分页参数必须为有效整数')
      let songs,hasMore
      if(q.trim()){
        const data=await invoke('cloudsearch',{keywords:q.trim(),type:1,limit,offset})
        songs=data.result?.songs||[]
        hasMore=Number.isFinite(data.result?.songCount)?offset+limit<data.result.songCount:songs.length>0
      }else{
        const data=await invoke('top_song',{type:0})
        if(!Array.isArray(data.data))throw fail(502,'网易云返回了无效的新歌列表')
        songs=data.data.slice(offset,offset+limit);hasMore=offset+limit<data.data.length
      }
      if(!Array.isArray(songs))throw fail(502,'网易云返回了无效的搜索结果')
      return {tracks:songs.map(song=>normalizeNeteaseTrack(song)).filter(Boolean),offset,hasMore,provider:'网易云音乐',accountMode:sessionCookie?'configured':'anonymous'}
    })
    routes.get('/api/music/netease/tracks/:id',async(req,reply)=>{reply.header('cache-control','no-store');return (await playback(idOf(req),qualityOf(req))).track})
    routes.get('/api/music/netease/stream/:id',async(req,reply)=>{const {url}=await playback(idOf(req),qualityOf(req));reply.header('cache-control','no-store');return reply.redirect(url)})
  })
}
