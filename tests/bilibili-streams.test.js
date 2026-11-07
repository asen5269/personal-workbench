import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parsePlatform} from '../server/lib/platforms.js'

const dash={video:[{baseUrl:'https://cdn.test/dash',width:1920,height:1080,bandwidth:1000}],audio:[{baseUrl:'https://cdn.test/audio',bandwidth:100}]}
const durl=[{url:'https://cdn.test/progressive'}]
const page=play=>`<script>window.__INITIAL_STATE__={"cid":2,"videoData":{"aid":1,"title":"B站"}};window.__playinfo__=${JSON.stringify({data:play})};</script>`
const parse=(embedded,api)=>parsePlatform('https://www.bilibili.com/video/BV123/','bilibili',{fetchImpl:async url=>url.includes('/x/player/')?Response.json({code:0,data:api}):new Response(page(embedded))})

test('Bilibili prefers DASH over progressive when both are returned',async()=>{
  const result=await parse({}, {dash,durl})
  assert.deepEqual(result.videos,['https://cdn.test/dash'])
  assert.equal(result.video_candidates[0].audio_url,'https://cdn.test/audio')
  assert.ok(result.video_candidates.every(candidate=>candidate.source==='dash'))
})
test('Bilibili preserves page DASH when API returns only progressive',async()=>{
  const result=await parse({dash},{durl})
  assert.deepEqual(result.videos,['https://cdn.test/dash'])
  assert.equal(result.video_candidates[0].audio_url,'https://cdn.test/audio')
})
test('Bilibili retains progressive fallback when DASH is unavailable',async()=>{
  const result=await parse({}, {durl})
  assert.deepEqual(result.videos,['https://cdn.test/progressive'])
  assert.equal(result.video_candidates[0].source,'progressive')
})
