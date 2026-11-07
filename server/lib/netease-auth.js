import {randomUUID} from 'node:crypto'
const fail=(code,message)=>Object.assign(new Error(message),{statusCode:code})
export function registerNeteaseAuth(routes,{call,getCookie,setCookie}){
  const sessions=new Map()
  let revision=0,profile=null,verifiedAt=0
  async function invoke(method,args={},cookie={}){
    try{return await call(method,{...args,cookie,timeout:15000,randomCNIP:false,unblock:'false',timestamp:Date.now()})}
    catch{throw fail(502,'网易云登录服务暂时不可用，请稍后重试')}
  }
  function localOrigin(req,reply,done){
    if(req.headers.origin){try{if(!['127.0.0.1','localhost','[::1]'].includes(new URL(req.headers.origin).hostname))return done(fail(403,'不允许来自其他站点的登录操作'))}catch{return done(fail(403,'无效请求来源'))}}
    done()
  }
  const secure={preHandler:localOrigin}
  routes.addHook('onSend',(req,reply,payload,done)=>{if(req.url.startsWith('/api/music/netease/auth/'))reply.header('cache-control','no-store');done(null,payload)})
  routes.post('/api/music/netease/auth/qr',secure,async()=>{
    const generation=revision
    const keyResult=await invoke('login_qr_key')
    const key=keyResult.body?.data?.unikey
    if(typeof key!=='string'||!key)throw fail(502,'二维码获取失败，请稍后重试')
    const created=await invoke('login_qr_create',{key,qrimg:true,platform:'pc'})
    const image=created.body?.data?.qrimg
    if(typeof image!=='string'||!image.startsWith('data:image/png;base64,'))throw fail(502,'二维码生成失败')
    if(generation!==revision)throw fail(409,'登录状态已变化，请重新打开登录窗口')
    sessions.clear()
    const id=randomUUID(),expiresAt=Date.now()+120000
    sessions.set(id,{key,expiresAt,generation,cookie:keyResult.cookie?.join(';')||{},nextPoll:0})
    return {sessionId:id,image,expiresAt}
  })
  routes.post('/api/music/netease/auth/check',secure,async req=>{
    const id=req.body?.sessionId
    if(typeof id!=='string'||id.length>80)throw fail(400,'无效的登录会话')
    const session=sessions.get(id)
    if(!session||session.expiresAt<=Date.now()||session.generation!==revision){sessions.delete(id);return {code:800,message:'二维码已过期，请刷新'}}
    if(session.pending)return session.pending
    if(Date.now()<session.nextPoll)return {code:session.lastCode||801,message:session.lastCode===802?'已扫码，请在手机上确认':'等待扫码'}
    const task=(async()=>{
      session.nextPoll=Date.now()+2500
      const result=await invoke('login_qr_check',{key:session.key,noCookie:true},session.cookie)
      if(sessions.get(id)!==session||session.generation!==revision)return {code:800,message:'登录会话已结束'}
      const code=Number(result.body?.code)
      if(code===803){
        const cookie=result.body?.cookie || result.cookie?.join(';')
        if(typeof cookie!=='string'||!/(^|;\s*)MUSIC_U=[^;]+/.test(cookie))throw fail(502,'登录确认成功，但未取得有效凭据，请刷新二维码重试')
        setCookie(cookie);revision++;sessions.clear();verifiedAt=Date.now();profile={nickname:session.nickname||'网易云用户'}
        return {code:803,message:'登录成功',profile}
      }
      if(code===800){sessions.delete(id);return {code:800,message:'二维码已过期，请刷新'}}
      if(![801,802].includes(code))throw fail(502,'二维码状态查询失败，请稍后重试')
      session.lastCode=code
      if(code===802&&result.body.nickname)session.nickname=String(result.body.nickname).slice(0,100)
      return {code,message:code===802?'已扫码，请在手机上确认登录':'使用网易云音乐 App 扫码'}
    })()
    session.pending=task
    try{return await task}finally{session.pending=null}
  })
  routes.delete('/api/music/netease/auth/qr/:id',secure,async req=>{sessions.delete(req.params.id);return {cancelled:true}})
  routes.get('/api/music/netease/auth/status',async()=>{
    const cookie=getCookie()
    if(!cookie)return {loggedIn:false,mode:'anonymous'}
    if(profile&&Date.now()-verifiedAt<30000)return {loggedIn:true,profile}
    const generation=revision,result=await invoke('login_status',{},cookie)
    if(generation!==revision)return {loggedIn:false,mode:'changed'}
    const data=result.body?.data||result.body
    if(data?.profile?.userId||data?.account?.id){profile={nickname:String(data.profile?.nickname||'网易云用户').slice(0,100)};verifiedAt=Date.now();return {loggedIn:true,profile}}
    if(Number(data?.code)===200||[301,401,403].includes(Number(data?.code))){setCookie('');revision++;profile=null;sessions.clear();return {loggedIn:false,mode:'expired'}}
    throw fail(502,'暂时无法确认网易云登录状态，请稍后重试')
  })
  routes.post('/api/music/netease/auth/logout',secure,async()=>{
    setCookie('');revision++;profile=null;verifiedAt=0;sessions.clear()
    return {loggedIn:false}
  })
}
