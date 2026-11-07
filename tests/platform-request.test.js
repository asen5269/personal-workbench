import {test} from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {requestPlatformPage} from '../server/lib/platform-request.js'

test('platform request keeps redirect control and individual cookies without fetch-only headers',async()=>{
  const server=http.createServer((req,res)=>{
    assert.equal(req.headers['sec-fetch-mode'],undefined)
    assert.equal(req.headers['user-agent'],'parser-test')
    res.writeHead(302,{location:'/target','set-cookie':['first=1; Path=/','second=2; Path=/']});res.end('redirect')
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  try {
    const response=await requestPlatformPage(`http://127.0.0.1:${server.address().port}/`,{headers:{'User-Agent':'parser-test'},signal:AbortSignal.timeout(3000)})
    assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/target')
    assert.deepEqual(response.headers.getSetCookie(),['first=1; Path=/','second=2; Path=/'])
    assert.equal(await response.text(),'redirect')
  }finally{await new Promise(resolve=>server.close(resolve))}
})
