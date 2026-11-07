import {test} from 'node:test'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'
import {prepareMedia,probeFile} from '../server/lib/media-quality.js'
import Fastify from 'fastify'
import {sendLocalMedia} from '../server/lib/media-response.js'
const exec=promisify(execFile)
test('measures complete files, rejects broken candidates, selects larger video and muxes audio without encoding',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'workbench-quality-test-'));let result
  try{
    for(const [name,size] of [['small','160x90'],['large','320x180']])await exec('ffmpeg',['-v','error','-f','lavfi','-i',`testsrc=size=${size}:rate=12`,'-t','1','-pix_fmt','yuv420p',join(dir,name+'.mp4')],{windowsHide:true})
    await exec('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=400','-t','1','-c:a','aac',join(dir,'audio.m4a')],{windowsHide:true})
    const padding=Buffer.alloc(5*1024*1024);padding.writeUInt32BE(padding.length);padding.write('free',4)
    const blobs={small:await readFile(join(dir,'small.mp4')),large:Buffer.concat([await readFile(join(dir,'large.mp4')),padding]),audio:await readFile(join(dir,'audio.m4a'))};let segments=0;const requested=[]
    result=await prepareMedia({platform:'douyin',videos:['https://fixture.test/small'],video_candidates:[{url:'https://fixture.test/aweme/v1/playwm/'},{url:'https://fixture.test/broken'},{url:'https://fixture.test/small'},{url:'https://fixture.test/large',default_probe:true,audio_url:'https://fixture.test/audio'}],warnings:[]},{original:true,fetchImpl:async(url,options)=>{requested.push(url);const bytes=blobs[new URL(url).pathname.slice(1)];if(!bytes)return new Response('not media');const [,from,to]=options.headers.Range.match(/bytes=(\d+)-(\d+)/),start=Number(from),end=Math.min(Number(to),bytes.length-1);segments++;return new Response(bytes.subarray(start,end+1),{status:206,headers:{'content-range':`bytes ${start}-${end}/${bytes.length}`}})}})
    assert.ok(segments>=4)
    assert.equal(requested[0],'https://fixture.test/large')
    assert.ok(!requested.some(url=>url.includes('/playwm/')))
    assert.equal(result.quality_report.selected.measured.width,320);assert.equal(result.quality_report.partial,true);assert.equal(result.quality_report.original_verified,false);assert.equal((await probeFile(result.local_video)).has_audio,true)
    const app=Fastify();app.get('/media',(req,reply)=>sendLocalMedia(req,reply,result.local_video));try{const r=await app.inject({url:'/media',headers:{range:'bytes=0-15'}});assert.equal(r.statusCode,206);assert.equal(r.rawPayload.length,16);const invalid=await app.inject({url:'/media',headers:{range:'bytes=99999999-'}});assert.equal(invalid.statusCode,416)}finally{await app.close()}
  }finally{await rm(dir,{recursive:true,force:true});if(result)await rm(dirname(result.local_video),{recursive:true,force:true})}
})
