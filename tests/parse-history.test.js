import {test} from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import Database from 'better-sqlite3'
import {registerParseHistory} from '../server/lib/parse-history.js'
test('history deduplicates by URL/quality, survives server recreation and preserves media IDs after restart',async()=>{
  const db=new Database(':memory:'),app=Fastify(),history=registerParseHistory(app,db),raw={platform:'douyin',title:'历史测试',url:'https://www.douyin.com/video/1',images:['https://cdn.test/image'],videos:['https://cdn.test/video']}
  try{const id=history.record(raw,{...raw,videos:['runtime-id']},'standard');assert.equal(history.record(raw,raw,'standard'),id);history.record(raw,raw,'original');assert.equal((await app.inject('/api/parse-history')).json().length,2);const detail=(await app.inject('/api/parse-history/'+id)).json();assert.equal(detail.expired,false);assert.equal(detail.data.history_id,id);await app.close();const reopened=Fastify();registerParseHistory(reopened,db);try{const expired=(await reopened.inject('/api/parse-history/'+id)).json();assert.equal(expired.expired,false);assert.equal(expired.data.videos.length,1);assert.equal(expired.data.videos[0],detail.data.videos[0]);assert.equal(db.prepare('SELECT url FROM parse_media WHERE id=?').get(expired.data.videos[0]).url,raw.videos[0]);assert.equal(expired.data.url,raw.url);await reopened.inject({method:'DELETE',url:'/api/parse-history/'+id});assert.equal((await reopened.inject('/api/parse-history')).json().length,1);await reopened.inject({method:'DELETE',url:'/api/parse-history'});assert.equal((await reopened.inject('/api/parse-history')).json().length,0)}finally{await reopened.close()}}finally{await app.close();db.close()}
})
