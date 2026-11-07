import { platformReferer } from './platforms.js'
export function registerParseHistory(app,db){
  db.exec('CREATE TABLE IF NOT EXISTS parse_history (id INTEGER PRIMARY KEY, url TEXT NOT NULL, quality TEXT NOT NULL, snapshot TEXT NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(url,quality))')
  db.exec('CREATE TABLE IF NOT EXISTS parse_media (id TEXT PRIMARY KEY, history_id INTEGER NOT NULL, url TEXT NOT NULL, referer TEXT NOT NULL, path TEXT); CREATE INDEX IF NOT EXISTS parse_media_history ON parse_media(history_id)')
  const row=id=>db.prepare('SELECT * FROM parse_history WHERE id=?').get(id)
  function data(id){
    const saved=row(id);if(!saved)return null
    const snapshot=JSON.parse(saved.snapshot), result={...snapshot,history_id:saved.id}
    delete result.local_video
    for(const kind of ['videos','images'])result[kind]=(snapshot[kind]||[]).map(url=>{
      let asset=db.prepare('SELECT id FROM parse_media WHERE history_id=? AND url=?').get(saved.id,url)
      if(!asset){asset={id:crypto.randomUUID()};db.prepare('INSERT INTO parse_media VALUES (?,?,?,?,?)').run(asset.id,saved.id,url,platformReferer(snapshot.platform),kind==='videos'?(snapshot.local_video||null):null)}
      return asset.id
    })
    return result
  }
  function record(raw,response,quality){
    const {local_video,...snapshot}=raw
    if(local_video)snapshot.local_video=local_video
    const saved=db.transaction(()=>{
      db.prepare('INSERT INTO parse_history(url,quality,snapshot,updated_at) VALUES (?,?,?,?) ON CONFLICT(url,quality) DO UPDATE SET snapshot=excluded.snapshot,updated_at=excluded.updated_at').run(raw.url,quality,JSON.stringify(snapshot),Date.now())
      const saved=db.prepare('SELECT id FROM parse_history WHERE url=? AND quality=?').get(raw.url,quality)
      db.prepare('DELETE FROM parse_media WHERE history_id=?').run(saved.id)
      db.prepare('DELETE FROM parse_history WHERE id NOT IN (SELECT id FROM parse_history ORDER BY updated_at DESC LIMIT 200)').run()
      db.prepare('DELETE FROM parse_media WHERE history_id NOT IN (SELECT id FROM parse_history)').run()
      return saved
    })()
    data(saved.id);return saved.id
  }
  app.get('/api/parse-history',()=>db.prepare('SELECT * FROM parse_history ORDER BY updated_at DESC,id DESC').all().map(r=>{const data=JSON.parse(r.snapshot);return {id:r.id,title:data.title||'未命名作品',platform:data.platform,url:r.url,quality:r.quality,updated_at:r.updated_at,cover:data.images?.[0]||'',videos:data.videos.length,images:data.images.length}}))
  app.get('/api/parse-history/:id',(req,reply)=>{const saved=row(req.params.id);if(!saved)return reply.code(404).send({error:'历史记录不存在'});return {expired:false,quality:saved.quality,data:data(saved.id)}})
  app.delete('/api/parse-history/:id',req=>db.transaction(()=>{db.prepare('DELETE FROM parse_media WHERE history_id=?').run(req.params.id);return {deleted:db.prepare('DELETE FROM parse_history WHERE id=?').run(req.params.id).changes}})())
  app.delete('/api/parse-history',()=>db.transaction(()=>{db.prepare('DELETE FROM parse_media').run();return {deleted:db.prepare('DELETE FROM parse_history').run().changes}})())
  return {record,data}
}
