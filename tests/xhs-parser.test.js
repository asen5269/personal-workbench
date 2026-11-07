import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parseMedia,extractUrl} from '../server/lib/media-parser.js'
import {jsonAfter} from '../server/lib/platforms.js'

const id='674011111111111111111111'
const url=`https://www.xiaohongshu.com/explore/${id}?xsec_token=token%2Bvalue&xsec_source=pc_share`
const page=note=>`<script>window.__INITIAL_STATE__ = ${JSON.stringify({note:{noteDetailMap:{[id]:{note}}}})}</script>`
const parse=html=>parseMedia(url,{fetchImpl:async()=>new Response(html)})

test('XHS share text retains signed URL parameters',()=>{
  assert.equal(extractUrl(`分享笔记 ${url}，复制打开小红书`),url)
})
test('page JSON supports undefined array values without rewriting text',()=>{
  assert.deepEqual(jsonAfter('window.__INITIAL_STATE__={"list":[undefined,{"value":undefined}],"text":":undefined / undefined"};','window.__INITIAL_STATE__'),{list:[null,{value:null}],text:':undefined / undefined'})
})
test('XHS prefers the requested note and supports image fileId fallback',async()=>{
  const html=`<script>window.__INITIAL_STATE__=${JSON.stringify({note:{noteDetailMap:{other:{note:{title:'other',imageList:[]}},[id]:{note:{title:'requested',description:'正文',imageList:[null,{fileId:'path/image'},{infoList:[{}, {url:'//cdn.test/preview'},{imageScene:'WB_DFT',url:'//cdn.test/full'}]}]}}}}})}</script>`
  const result=await parse(html)
  assert.equal(result.title,'requested');assert.equal(result.content,'正文')
  assert.deepEqual(result.images,['https://ci.xiaohongshu.com/path/image','https://cdn.test/full'])
  assert.deepEqual(result.warnings,[])
})
test('XHS video notes without imageList keep cover and use skill stream preference',async()=>{
  const result=await parse(page({title:'视频笔记',video:{image:{url:'//cdn.test/cover'},media:{stream:{h264:[{height:720,masterUrl:'https://cdn.test/master',backupUrls:['https://cdn.test/backup']}]}}}}))
  assert.deepEqual(result.images,['https://cdn.test/cover'])
  assert.deepEqual(result.videos,['https://cdn.test/backup'])
})
test('XHS fallback keeps all public OG images and clearly reports incomplete data',async()=>{
  const result=await parse('<meta property = "og:title" content="公开标题"><meta property="og:image" content="//cdn.test/1"><meta content="https://cdn.test/2?a=1&amp;b=2" property="og:image">')
  assert.equal(result.title,'公开标题')
  assert.deepEqual(result.images,['https://cdn.test/1','https://cdn.test/2?a=1&b=2'])
  assert.equal(result.warnings.length,1)
})
test('XHS redirects keep scoped cookies, request headers and signed parameters',async()=>{
  const visits=[]
  const result=await parseMedia('https://xhslink.com/a/test',{fetchImpl:async(target,options)=>{
    visits.push(target)
    assert.equal(options.headers['Accept-Language'],'zh-CN,zh;q=0.9')
    assert.match(options.headers.Accept,/text\/html/)
    if(visits.length===1)return new Response(null,{status:302,headers:{location:'https://xhslink.com/a/continue','set-cookie':'short=one; Path=/; Secure'}})
    if(visits.length===2){assert.equal(options.headers.Cookie,'short=one');return new Response(null,{status:302,headers:{location:url}})}
    assert.equal(options.headers.Cookie,undefined)
    return new Response(page({title:'图文',imageList:[{url:'https://cdn.test/img'}]}))
  }})
  assert.equal(result.url,url);assert.equal(result.note_id,id);assert.equal(visits.length,3)
})
test('XHS supports noteId query links and rejects external redirect hosts',async()=>{
  const result=await parseMedia(`https://www.xiaohongshu.com/?noteId=${id}`,{fetchImpl:async()=>new Response(page({title:'笔记',imageList:[]}))})
  assert.equal(result.note_id,id)
  await assert.rejects(()=>parseMedia('https://xhslink.com/a/test',{fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://xiaohongshu.com.evil.test/'}})}),/不支持的地址/)
})
