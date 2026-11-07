import {readFileSync} from 'node:fs'
const catalog=JSON.parse(readFileSync(new URL('./netease-catalog.json',import.meta.url),'utf8'))
const fail=(statusCode,message)=>Object.assign(new Error(message),{statusCode})
const idOf=value=>{if(!/^\d{1,16}$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<=0)throw fail(400,'无效资源编号');return String(value)}
const number=(value,min,max,fallback)=>{const n=Number(value??fallback);if(!Number.isInteger(n)||n<min||n>max)throw fail(400,'分页参数无效');return n}
export function registerNeteaseLibrary(routes,{invoke,getCookie,clearCache,normalize,mediaUrl}){
  const tracks=list=>(list||[]).map(t=>normalize(t.song||t.simpleSong||t.data||t)).filter(Boolean)
  const card=(item,kind)=>({id:String(item.id),kind,title:item.name||item.title,cover:mediaUrl(item.coverImgUrl||item.picUrl||item.img1v1Url||item.cover),subtitle:item.creator?.nickname||item.artist?.name||item.artists?.map(a=>a.name).join(' / ')||item.updateFrequency||'',count:item.trackCount||item.size||item.programCount||0,creatorUid:item.creator?.userId})
  async function me(){if(!getCookie())throw fail(401,'请先扫码登录网易云');const data=await invoke('user_account');const uid=data.profile?.userId||data.account?.id;if(!uid)throw fail(401,'登录状态已失效，请重新扫码');return {uid,profile:data.profile}}
  function origin(req,reply,done){try{if(req.headers.origin&&!['127.0.0.1','localhost','[::1]'].includes(new URL(req.headers.origin).hostname))return done(fail(403,'不允许跨站操作'))}catch{return done(fail(403,'无效请求来源'))}done()}
  routes.get('/api/music/netease/catalog',async()=>catalog)
  routes.get('/api/music/netease/browse',async req=>{
    const view=req.query.view||'playlists',offset=number(req.query.offset,0,10000,0),limit=20,q=String(req.query.q||'').trim()
    if(q.length>120)throw fail(400,'搜索词最多 120 字')
    let data,items=[],kind='collections',total
    if(q&&['playlists','artists','albums'].includes(view)){const types={playlists:1000,artists:100,albums:10},keys={playlists:'playlists',artists:'artists',albums:'albums'},kinds={playlists:'playlist',artists:'artist',albums:'album'};data=await invoke('cloudsearch',{keywords:q,type:types[view],limit,offset});items=(data.result?.[keys[view]]||[]).map(x=>card(x,kinds[view]));total=data.result?.[{playlists:'playlistCount',artists:'artistCount',albums:'albumCount'}[view]]}
    else if(view==='playlists'){data=await invoke('top_playlist',{cat:'全部',limit,offset,order:'hot'});items=(data.playlists||[]).map(x=>card(x,'playlist'));total=data.total}
    else if(view==='charts'){data=await invoke('toplist');const list=data.list||[];items=list.slice(offset,offset+limit).map(x=>card(x,'playlist'));total=list.length}
    else if(view==='albums'){data=await invoke('album_newest');const list=data.albums||[];items=list.slice(offset,offset+limit).map(x=>card(x,'album'));total=list.length}
    else if(view==='artists'){data=await invoke('top_artists',{limit,offset});items=(data.artists||[]).map(x=>card(x,'artist'))}
    else if(view==='recommend'){data=await invoke('personalized',{limit});items=(data.result||[]).map(x=>card(x,'playlist'));total=items.length}
    else if(view==='daily'){await me();data=await invoke('recommend_songs');kind='tracks';const list=data.data?.dailySongs||data.recommend||[];items=tracks(list.slice(offset,offset+limit));total=list.length}
    else if(view==='fm'){await me();data=await invoke('personal_fm',{},false);kind='tracks';items=tracks(data.data);total=items.length}
    else if(view==='mine'){const {uid}=await me();data=await invoke('user_playlist',{uid,limit,offset});items=(data.playlist||[]).map(x=>card(x,'playlist'));total=Number(data.more)?offset+limit+1:offset+items.length}
    else if(view==='cloud'){await me();data=await invoke('user_cloud',{limit,offset});kind='tracks';items=tracks(data.data);total=Number(data.count)||0}
    else if(view==='history'){await me();data=await invoke('record_recent_song',{limit:100});kind='tracks';const list=data.data?.list||[];items=tracks(list.slice(offset,offset+limit));total=list.length}
    else if(view==='liked'){const {uid}=await me();data=await invoke('likelist',{uid});kind='tracks';const ids=data.ids||[],slice=ids.slice(offset,offset+limit);total=ids.length;items=slice.length?tracks((await invoke('song_detail',{ids:slice.join(',')})).songs):[]}
    else if(view==='mvs'){data=await invoke('mv_first',{limit,offset});kind='videos';items=(data.data||[]).map(x=>card(x,'mv'))}
    else if(view==='podcasts'){data=await invoke('dj_hot',{limit,offset});items=(data.djRadios||[]).map(x=>card(x,'podcast'));total=data.count}
    else throw fail(400,'不支持的音乐分类')
    return {kind,items,total:typeof total==='number'?total:null,offset,hasMore:typeof total==='number'?offset+limit<total:items.length===limit,ownerUid:view==='mine'?(await me()).uid:undefined}
  })
  routes.get('/api/music/netease/collection/:kind/:id',async req=>{
    const id=idOf(req.params.id),kind=req.params.kind,offset=number(req.query.offset,0,10000,0),limit=20
    let data,list,title,cover,description='',total=0,creatorUid,subscribed=false
    if(kind==='playlist'){const detail=(await invoke('playlist_detail',{id})).playlist;if(!detail)throw fail(404,'歌单不存在');title=detail.name;cover=detail.coverImgUrl;description=detail.description;creatorUid=detail.creator?.userId;subscribed=!!detail.subscribed;total=detail.trackCount||detail.trackIds?.length||0;data=total?await invoke('playlist_track_all',{id,limit,offset}):{songs:[]};list=data.songs||[]}
    else if(kind==='album'){data=await invoke('album',{id});title=data.album?.name;cover=data.album?.picUrl;description=data.album?.description;total=data.songs?.length||0;list=(data.songs||[]).slice(offset,offset+limit)}
    else if(kind==='artist'){data=await invoke('artist_top_song',{id});const detail=(await invoke('artist_detail',{id})).data?.artist||{};title=detail.name;cover=detail.cover;description=detail.briefDesc;total=data.songs?.length||0;list=(data.songs||[]).slice(offset,offset+limit)}
    else if(kind==='podcast'){data=await invoke('dj_program',{rid:id,limit,offset});title='电台节目';list=(data.programs||[]).map(x=>x.mainSong);total=data.count||0}
    else throw fail(400,'不支持的资源类型')
    return {id,kind,title:title||'音乐合集',cover:mediaUrl(cover),description:description||'',creatorUid,subscribed,tracks:tracks(list),total,hasMore:offset+limit<total}
  })
  routes.get('/api/music/netease/lyrics/:id',async req=>{
    const data=await invoke('lyric',{id:idOf(req.params.id)})
    return {original:data.lrc?.lyric||'',translated:data.tlyric?.lyric||'',romanized:data.romalrc?.lyric||'',instrumental:!!data.nolyric}
  })
  routes.get('/api/music/netease/comments/:id',async req=>{
    const data=await invoke('comment_music',{id:idOf(req.params.id),limit:20,offset:number(req.query.offset,0,10000,0)})
    const clean=c=>({id:String(c.commentId),content:String(c.content||''),time:c.time,liked:!!c.liked,likes:c.likedCount||0,user:String(c.user?.nickname||'用户'),replies:(c.beReplied||[]).map(r=>({user:r.user?.nickname,content:r.content}))})
    return {items:(data.comments||[]).map(clean),hot:(data.hotComments||[]).map(clean),total:data.total||0,hasMore:!!data.more}
  })
  routes.get('/api/music/netease/mv/:id',async req=>{
    const data=await invoke('mv_url',{id:idOf(req.params.id),r:720})
    const url=data.data?.url
    try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||!/(^|\.)(music\.126\.net|music\.163\.com|vod\.126\.net)$/.test(u.hostname))throw Error();u.protocol='https:';return {url:u.href}}catch{throw fail(403,'此 MV 暂无可用播放地址')}
  })
  routes.post('/api/music/netease/action',{preHandler:origin},async req=>{
    if(req.body?.confirmed!==true)throw fail(400,'请确认操作后提交')
    const {uid}=await me(),action=req.body.action,p=req.body.params||{}
    let data
    const text=(value,max=100)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw fail(400,'请填写有效内容');return value.trim()}
    if(action==='like')data=await invoke('like',{id:idOf(p.id),like:p.like===false?'false':'true'},false)
    else if(action==='subscribe')data=await invoke('playlist_subscribe',{id:idOf(p.id),t:p.subscribe===false?2:1},false)
    else if(action==='create-playlist')data=await invoke('playlist_create',{name:text(p.name,40),privacy:p.private===true?10:0,type:'NORMAL'},false)
    else if(['rename-playlist','delete-playlist','playlist-add','playlist-remove'].includes(action)){
      const id=idOf(p.id),detail=(await invoke('playlist_detail',{id})).playlist
      if(String(detail?.creator?.userId)!==String(uid))throw fail(403,'只能修改自己创建的歌单')
      if(action==='rename-playlist')data=await invoke('playlist_name_update',{id,name:text(p.name,40)},false)
      if(action==='delete-playlist')data=await invoke('playlist_delete',{id},false)
      if(action==='playlist-add'||action==='playlist-remove')data=await invoke('playlist_tracks',{pid:id,tracks:idOf(p.trackId),op:action==='playlist-add'?'add':'del'},false)
    }else if(action==='comment')data=await invoke('comment',{id:idOf(p.id),type:0,t:1,content:text(p.content,1000)},false)
    else if(action==='comment-like')data=await invoke('comment_like',{id:idOf(p.id),cid:idOf(p.commentId),type:0,t:p.like===false?0:1},false)
    else throw fail(400,'不支持的账号操作')
    clearCache();return {success:true,id:data?.id||data?.playlist?.id}
  })
}
