import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import {readdirSync,readFileSync} from 'node:fs'
import {registerNetease} from '../server/lib/netease.js'
import {parseLyrics,activeLyric} from '../src/utils/music-lyrics.js'

const song={id:123,name:'Song',ar:[{name:'Artist'}],al:{name:'Album'},dt:120000}
function setup(cookie=''){
  const calls=[],app=Fastify()
  const data={user_account:{profile:{userId:77,nickname:'Me'}},top_playlist:{playlists:[{id:1,name:'Playlist'}],total:30},toplist:{list:[{id:2,name:'Chart'}]},album_newest:{albums:[{id:3,name:'Album'}]},top_artists:{artists:[{id:4,name:'Artist'}]},personalized:{result:[{id:5,name:'Recommendation'}]},recommend_songs:{data:{dailySongs:[song]}},personal_fm:{data:[song]},user_playlist:{playlist:[{id:1,name:'Mine',creator:{userId:77}}],more:false},user_cloud:{data:[{simpleSong:song}],count:1},record_recent_song:{data:{list:[{data:song}]}},likelist:{ids:[123]},song_detail:{songs:[song]},playlist_detail:{playlist:{id:1,name:'Mine',trackCount:1,creator:{userId:77}}},playlist_track_all:{songs:[song]},album:{album:{name:'Album'},songs:[song]},artist_top_song:{songs:[song]},artist_detail:{data:{artist:{name:'Artist'}}},lyric:{lrc:{lyric:'[00:01.00]Hello'}},comment_music:{comments:[{commentId:1,content:'Hi',user:{nickname:'Person',cookie:'secret'}}],total:1},mv_first:{data:[{id:10,name:'MV'}]},mv_url:{data:{url:'https://vod.music.126.net/video.mp4'}},dj_hot:{djRadios:[{id:9,name:'Radio'}],count:1},dj_program:{programs:[{mainSong:song}],count:1}}
  registerNetease(app,{cookie,call:async(method,args)=>{calls.push({method,args});return {body:{code:200,...(data[method]||{})}}}})
  return {app,calls,data}
}
test('完整模块目录与安装包一致，所有条目区分接入状态且无任意方法调用入口',async()=>{
  const {app}=setup()
  try{
    const res=await app.inject('/api/music/netease/catalog'),catalog=res.json()
    const files=readdirSync('node_modules/@neteasecloudmusicapienhanced/api/module').filter(x=>x.endsWith('.js'))
    assert.equal(catalog.count,files.length)
    assert.deepEqual(catalog.items.map(x=>x.method).sort(),files.map(x=>x.slice(0,-3)).sort())
    assert.ok(catalog.items.some(x=>x.integration==='directory'))
    for(const file of ['server/lib/netease.js','server/lib/netease-library.js','server/lib/netease-auth.js']){
      for(const match of readFileSync(file,'utf8').matchAll(/\binvoke\('([^']+)'/g))assert.equal(catalog.items.find(x=>x.method===match[1])?.integration,'player',match[1])
    }
    assert.equal((await app.inject({method:'POST',url:'/api/music/netease/sdk/api',payload:{url:'http://127.0.0.1'}})).statusCode,404)
  }finally{await app.close()}
})
test('公开浏览、合集详情、歌词评论与MV均归一化返回',async()=>{
  const {app}=setup()
  try{
    for(const view of ['playlists','charts','artists','albums','recommend','mvs','podcasts']){
      const res=await app.inject('/api/music/netease/browse?view='+view)
      assert.equal(res.statusCode,200,view);assert.equal(res.json().items.length,1,view)
    }
    for(const kind of ['playlist','album','artist','podcast']){
      const res=await app.inject('/api/music/netease/collection/'+kind+'/1')
      assert.equal(res.statusCode,200,kind);assert.equal(res.json().tracks[0].id,'netease:123',kind)
    }
    assert.equal((await app.inject('/api/music/netease/lyrics/123')).json().original,'[00:01.00]Hello')
    assert.equal((await app.inject('/api/music/netease/comments/123')).payload.includes('secret'),false)
    assert.equal((await app.inject('/api/music/netease/mv/123')).json().url,'https://vod.music.126.net/video.mp4')
    assert.equal((await app.inject('/api/music/netease/browse?view=unknown')).statusCode,400)
    assert.equal((await app.inject('/api/music/netease/collection/playlist/notanid')).statusCode,400)
  }finally{await app.close()}
})
test('个人内容需要登录，账号内容与空页边界正确',async()=>{
  const guest=setup()
  try{for(const view of ['daily','fm','mine','liked','cloud','history'])assert.equal((await guest.app.inject('/api/music/netease/browse?view='+view)).statusCode,401,view);assert.equal(guest.calls.length,0)}finally{await guest.app.close()}
  const {app,calls}=setup('MUSIC_U=mock')
  try{
    for(const view of ['daily','fm','mine','liked','cloud','history']){
      const res=await app.inject('/api/music/netease/browse?view='+view);assert.equal(res.statusCode,200,view);assert.equal(res.json().items.length,1,view)
    }
    assert.equal((await app.inject('/api/music/netease/browse?view=mine')).json().ownerUid,77)
    assert.equal((await app.inject('/api/music/netease/browse?view=liked&offset=20')).json().items.length,0)
    assert.ok(!calls.some(c=>c.method==='song_detail'&&c.args.ids===''))
  }finally{await app.close()}
})
test('云端写入需确认，验证所有权，写请求不缓存且不向任意 SDK 方法透传',async()=>{
  const {app,calls,data}=setup('MUSIC_U=mock')
  const action=payload=>app.inject({method:'POST',url:'/api/music/netease/action',payload})
  try{
    assert.equal((await action({action:'like',params:{id:123}})).statusCode,400)
    assert.equal(calls.length,0)
    for(let i=0;i<2;i++)assert.equal((await action({action:'like',params:{id:123},confirmed:true})).statusCode,200)
    assert.equal(calls.filter(c=>c.method==='like').length,2)
    data.playlist_detail.playlist.creator.userId=99
    assert.equal((await action({action:'delete-playlist',params:{id:1},confirmed:true})).statusCode,403)
    assert.equal(calls.some(c=>c.method==='playlist_delete'),false)
    assert.equal((await action({action:'api',params:{url:'http://127.0.0.1'},confirmed:true})).statusCode,400)
    const external=await app.inject({method:'POST',url:'/api/music/netease/action',headers:{origin:'https://evil.test'},payload:{action:'like',params:{id:123},confirmed:true}})
    assert.equal(external.statusCode,403)
  }finally{await app.close()}
})
test('同步歌词支持多时间戳、毫秒、纯文本与当前行边界',()=>{
  const lines=parseLyrics('[ar:Artist]\n[00:01.5][00:05.00]Hello\n[00:03.01]World\n[00:08]')
  assert.deepEqual(lines,[{time:1.5,text:'Hello'},{time:3.01,text:'World'},{time:5,text:'Hello'}])
  assert.equal(activeLyric(lines,0),-1);assert.equal(activeLyric(lines,3.01),1);assert.equal(activeLyric(lines,99),2)
  assert.deepEqual(parseLyrics('没有时间戳'),[])
})
