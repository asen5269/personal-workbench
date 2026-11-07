import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { registerDownloadJobs } from '../server/lib/download-jobs.js'
test('下载任务立即响应，提供进度并返回结果或失败', async () => {
  const app=Fastify()
  let finish
  registerDownloadJobs(app,{parseMedia:async input=>({platform:'test',url:input}),prepareMedia:async(data,{onProgress})=>{onProgress({stage:'下载画质候选',bytes:1024});await new Promise(resolve=>{finish=resolve});return data},platformReferer:()=>'',history:{record:()=>1,data:()=>({videos:['saved-id']})}})
  try{
    const response=await app.inject({method:'POST',url:'/api/download-jobs',payload:{input:'https://example.com',quality:'original'}})
    assert.equal(response.statusCode,202)
    const url='/api/download-jobs/'+response.json().id
    await new Promise(resolve=>setImmediate(resolve))
    assert.equal((await app.inject(url)).json().bytes,1024)
    finish();await new Promise(resolve=>setImmediate(resolve))
    const job=(await app.inject(url)).json()
    assert.equal(job.status,'done');assert.deepEqual(job.result.videos,['saved-id'])
    assert.equal((await app.inject('/api/download-jobs/missing')).statusCode,404)
  }finally{await app.close()}
})
