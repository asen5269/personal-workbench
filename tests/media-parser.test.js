import { test } from 'node:test'
import assert from 'node:assert/strict'
import {extractUrl, routerDetail, extractDetail, parseMedia} from '../server/lib/media-parser.js'
test('extracts share URLs and escaped protocols; rejects foreign domains',()=>{
  assert.equal(extractUrl('标题 https\\://v.douyin.com/abc/ 复制链接'),'https://v.douyin.com/abc/')
  assert.throws(()=>extractUrl('https://douyin.com.evil.test/video/123'))
})
test('reads router JSON without executing page scripts',()=>{
  assert.equal(routerDetail('<script>window._ROUTER_DATA = {"loaderData":{"a":{"videoInfoRes":{"item_list":[{"desc":"测试"}]}}}};</script>').desc,'测试')
  assert.equal(routerDetail('<script>window._ROUTER_DATA = alert(1);</script>'),null)
})
test('keeps galleries distinct from videos and preserves signed CDN URLs',()=>{
  assert.deepEqual(extractDetail({images:[{url_list:['https://cdn.test/one']}],video:{play_addr:{url_list:['https://cdn.test/music']}}}).videos,[])
  const signed='https://cdn.test/playwm/a?signature=one%2Btwo'
  assert.equal(extractDetail({video:{play_addr:{url_list:[signed]}}}).videos[0],signed)
  assert.match(extractDetail({video:{play_addr:{url_list:['https://aweme.snssdk.com/aweme/v1/playwm/?video_id=x']}}}).videos[0],/\/play\/\?/)
})
test('resolves short links and exposes incomplete public metadata as a warning',async()=>{
  const visited=[]
  const result=await parseMedia('https://v.douyin.com/abc/',{fetchImpl:async url=>{visited.push(url);return url.includes('/abc/')?new Response(null,{status:302,headers:{location:'https://www.douyin.com/video/7703849989709057314'}}):new Response('<meta content="公开标题" property="og:title"><meta property="og:image" content="https://cdn.test/cover">')}})
  assert.equal(result.note_id,'7703849989709057314');assert.equal(result.videos.length,0);assert.equal(result.warnings.length,1);assert.equal(visited.length,5)
})
