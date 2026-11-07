import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import {registerNetease,normalizeNeteaseTrack,neteaseMediaUrl} from '../server/lib/netease.js'

const song={id:123,name:'测试歌曲',ar:[{name:'歌手'}],al:{name:'专辑',picUrl:'http://p1.music.126.net/cover.jpg'},dt:180000,fee:0}
const stream={id:123,url:'http://m801.music.126.net/audio.mp3',code:200,time:180000,freeTrialInfo:null}
function mockApi(changes={}){
  const calls=[]
  const call=async(method,args)=>{
    calls.push({method,args})
    if(changes[method])return changes[method](args)
    return {body:{code:200,...({cloudsearch:{result:{songs:[song],songCount:41}},top_song:{data:Array.from({length:25},(_,i)=>({...song,id:i+1}))},song_detail:{songs:[song],privileges:[{id:123,st:0}]},song_url_v1:{data:[stream]}}[method])}}
  }
  return {call,calls}
}

test('网易云搜索、新歌分页、缓存、服务端凭据隔离和白名单参数',async()=>{
  const {call,calls}=mockApi(),app=Fastify()
  registerNetease(app,{call,cookie:'MUSIC_U=private'})
  try{
    let res=await app.inject('/api/music/netease/tracks?q=%E6%B5%8B%E8%AF%95&offset=20&proxy=evil&unblock=true')
    assert.equal(res.statusCode,200);assert.equal(res.json().hasMore,true)
    assert.equal(res.json().tracks[0].id,'netease:123')
    assert.equal(res.json().tracks[0].duration,180)
    assert.equal(res.json().tracks[0].cover,'https://p1.music.126.net/cover.jpg')
    assert.equal(res.payload.includes('private'),false)
    assert.equal(calls[0].args.cookie,'MUSIC_U=private')
    assert.equal(calls[0].args.proxy,undefined)
    assert.equal(calls[0].args.unblock,'false')
    assert.equal(calls[0].args.randomCNIP,false)
    await app.inject('/api/music/netease/tracks?q=%E6%B5%8B%E8%AF%95&offset=20')
    assert.equal(calls.length,1)
    res=await app.inject('/api/music/netease/tracks?offset=20')
    assert.equal(res.json().tracks.length,5);assert.equal(res.json().hasMore,false)
    assert.equal((await app.inject('/api/music/netease/tracks?offset=-1')).statusCode,400)
    assert.equal((await app.inject('/api/music/netease/tracks?q='+ 'x'.repeat(121))).statusCode,400)
    assert.equal((await app.inject('/api/music/audius/tracks')).statusCode,404)
  }finally{await app.close()}
})

test('播放地址只允许网易云 CDN，复用校验结果且不返回 Cookie',async()=>{
  const {call,calls}=mockApi(),app=Fastify();registerNetease(app,{call,cookie:'private'})
  try{
    const detail=await app.inject('/api/music/netease/tracks/123')
    assert.equal(detail.statusCode,200);assert.equal(detail.json().preview,false)
    const res=await app.inject('/api/music/netease/stream/123')
    assert.equal(res.statusCode,302);assert.equal(res.headers.location,'https://m801.music.126.net/audio.mp3')
    assert.equal(calls.length,2)
    assert.equal(calls.find(c=>c.method==='song_url_v1').args.level,'standard')
    assert.equal(calls.find(c=>c.method==='song_url_v1').args.crypto,'eapi')
    assert.equal((await app.inject('/api/music/netease/stream/not-an-id')).statusCode,400)
    assert.equal((await app.inject('/api/music/netease/stream/9007199254740992')).statusCode,400)
    assert.equal((await app.inject('/api/music/netease/tracks/123?quality=invalid')).statusCode,400)
    assert.equal((await app.inject('/api/music/netease/tracks/123?quality=lossless')).statusCode,200)
    assert.equal(calls.find(c=>c.method==='song_url_v1'&&c.args.level==='lossless').args.crypto,'eapi')
    assert.equal(neteaseMediaUrl('https://music.126.net.evil.com/audio.mp3'),'')
    assert.equal(neteaseMediaUrl('https://127.0.0.1/private'),'')
    assert.equal(neteaseMediaUrl('file:///etc/passwd'),'')
    assert.equal(normalizeNeteaseTrack({...song,id:'bad'}),null)
  }finally{await app.close()}
})

test('试听明确标记；无权限、无地址和非官方地址禁止播放',async()=>{
  for(const [item,status] of [[{...stream,freeTrialInfo:{start:0,end:30}},200],[{...stream,url:null},403],[{...stream,code:404},403],[{...stream,url:'https://evil.com/audio.mp3'},403]]){
    const {call}=mockApi({song_url_v1:async()=>({body:{code:200,data:[item]}})})
    const app=Fastify();registerNetease(app,{call})
    try{const res=await app.inject('/api/music/netease/tracks/123');assert.equal(res.statusCode,status);if(status===200){assert.equal(res.json().preview,true);assert.equal(res.json().duration,30);assert.equal(res.json().accessLabel,'试听')}}finally{await app.close()}
  }
})

test('失效凭据与网络错误不泄露上游敏感内容',async()=>{
  for(const [upstream,status] of [[{status:403,body:{code:301,message:'private cookie'}},403],[Error('secret stack'),502]]){
    const app=Fastify();registerNetease(app,{call:async()=>{throw upstream}})
    try{const res=await app.inject('/api/music/netease/tracks?q=hello');assert.equal(res.statusCode,status);assert.equal(res.payload.includes('private'),false);assert.equal(res.payload.includes('secret'),false)}finally{await app.close()}
  }
})
