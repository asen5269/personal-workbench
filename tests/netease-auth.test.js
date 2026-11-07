import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import {registerNetease} from '../server/lib/netease.js'

function mockApi(codes=[801,802,803]){
  const calls=[]
  return {calls,call:async(method,args)=>{
    calls.push({method,args})
    if(method==='login_qr_key')return {body:{code:200,data:{unikey:'remote-key'}},cookie:['NMTID=guest']}
    if(method==='login_qr_create')return {body:{data:{qrimg:'data:image/png;base64,cXI='}}}
    if(method==='login_qr_check'){const code=codes.shift()||801;return {body:{code,nickname:'测试用户',cookie:code===803?'MUSIC_U=private-token; __csrf=secret':''}}}
    if(method==='login_status')return {body:{data:{code:200,profile:{userId:1,nickname:'测试用户'}}}}
    if(method==='cloudsearch')return {body:{code:200,result:{songs:[],songCount:0}}}
  }}
}
const post=(app,path,payload={})=>app.inject({method:'POST',url:'/api/music/netease/auth/'+path,payload})

test('二维码生成、限频轮询、授权后 Cookie 只留后端、退出清除缓存与凭据',async()=>{
  const mock=mockApi(),app=Fastify(),realNow=Date.now;let clock=realNow()
  Date.now=()=>clock;registerNetease(app,{call:mock.call})
  try{
    assert.equal((await app.inject('/api/music/netease/auth/status')).json().loggedIn,false)
    await app.inject('/api/music/netease/tracks?q=test')
    const created=await post(app,'qr'),data=created.json()
    assert.equal(created.statusCode,200);assert.equal(created.headers['cache-control'],'no-store')
    assert.ok(data.image.startsWith('data:image/png;base64,'));assert.equal(data.unikey,undefined)
    assert.equal(mock.calls[0].args.cookie instanceof Object,true)
    const payload={sessionId:data.sessionId}
    assert.equal((await post(app,'check',payload)).json().code,801)
    assert.equal((await post(app,'check',payload)).json().code,801)
    assert.equal(mock.calls.filter(c=>c.method==='login_qr_check').length,1)
    clock+=3000
    assert.equal((await post(app,'check',payload)).json().code,802)
    clock+=3000
    const success=await post(app,'check',payload)
    assert.equal(success.json().code,803);assert.equal(success.payload.includes('private-token'),false);assert.equal(success.payload.includes('__csrf'),false)
    assert.equal((await app.inject('/api/music/netease/auth/status')).json().loggedIn,true)
    await app.inject('/api/music/netease/tracks?q=test')
    assert.ok(mock.calls.filter(c=>c.method==='cloudsearch').at(-1).args.cookie.includes('private-token'))
    assert.equal(mock.calls.filter(c=>c.method==='cloudsearch').length,2)
    await post(app,'logout')
    assert.equal((await app.inject('/api/music/netease/auth/status')).json().loggedIn,false)
    await app.inject('/api/music/netease/tracks?q=test')
    assert.deepEqual(mock.calls.filter(c=>c.method==='cloudsearch').at(-1).args.cookie,{})
    assert.equal((await post(app,'check',payload)).json().code,800)
  }finally{Date.now=realNow;await app.close()}
})

test('取消、过期、跨站请求及旧会话不可产生登录',async()=>{
  const mock=mockApi([803]),app=Fastify();registerNetease(app,{call:mock.call})
  try{
    let res=await app.inject({method:'POST',url:'/api/music/netease/auth/qr',headers:{origin:'https://evil.example'},payload:{}})
    assert.equal(res.statusCode,403);assert.equal(mock.calls.length,0)
    const first=(await post(app,'qr')).json()
    await app.inject({method:'DELETE',url:'/api/music/netease/auth/qr/'+first.sessionId})
    assert.equal((await post(app,'check',{sessionId:first.sessionId})).json().code,800)
    const second=(await post(app,'qr')).json()
    const third=(await post(app,'qr')).json()
    assert.equal((await post(app,'check',{sessionId:second.sessionId})).json().code,800)
    const now=Date.now;Date.now=()=>third.expiresAt+1
    try{assert.equal((await post(app,'check',{sessionId:third.sessionId})).json().code,800)}finally{Date.now=now}
    assert.equal((await app.inject('/api/music/netease/auth/status')).json().loggedIn,false)
    assert.equal(mock.calls.filter(c=>c.method==='login_qr_check').length,0)
  }finally{await app.close()}
})

test('退出与已发出的扫码确认竞争时，不恢复已退出的登录',async()=>{
  let resolveCheck
  const mock=mockApi(),base=mock.call,app=Fastify()
  mock.call=(method,args)=>method==='login_qr_check'?new Promise(resolve=>{resolveCheck=resolve}):base(method,args)
  registerNetease(app,{call:mock.call})
  try{
    const qr=(await post(app,'qr')).json()
    const checking=post(app,'check',{sessionId:qr.sessionId})
    await new Promise(resolve=>setImmediate(resolve))
    await post(app,'logout')
    resolveCheck({body:{code:803,cookie:'MUSIC_U=late-secret'}})
    assert.equal((await checking).json().code,800)
    assert.equal((await app.inject('/api/music/netease/auth/status')).json().loggedIn,false)
  }finally{await app.close()}
})
