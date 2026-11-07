import { registerParseHistory } from './lib/parse-history.js'
import { registerNotes } from './lib/notes.js'
import { registerTasks } from './lib/tasks.js'
import { registerNetease } from './lib/netease.js'
import { registerBookmarks } from './lib/bookmarks.js'
import { registerDownloadJobs } from './lib/download-jobs.js'
import { registerToolbox } from './lib/toolbox.js'
import { registerLibrary } from './lib/library.js'
import {warmNativeReveal} from './lib/native-open.js'
import { registerFileTools } from './lib/file-tools.js'
import Fastify from 'fastify'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { parseMedia } from './lib/media-parser.js'
import { prepareMedia } from './lib/media-quality.js'
import { platformReferer } from './lib/platforms.js'
import { sendLocalMedia } from './lib/media-response.js'
import { Readable } from 'node:stream'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dataDirectory, writablePublic } from './lib/app-paths.js'
import fastifyStatic from '@fastify/static'
const app = Fastify({ logger: true })
mkdirSync(dataDirectory,{recursive:true})
const db = new Database(join(dataDirectory,'workbench.db'))
registerNotes(app, db)
registerTasks(app, db)
registerNetease(app)
registerBookmarks(app, db)
registerToolbox(app,db)
registerLibrary(app,db)
registerFileTools(app)
db.exec('CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY, type TEXT NOT NULL, data TEXT NOT NULL)')
app.get('/api/entries', () => db.prepare('SELECT * FROM entries ORDER BY id DESC').all().map(x => ({ id: x.id, type: x.type, ...JSON.parse(x.data) })))
app.post('/api/entries', (req, reply) => { const { type, ...data } = req.body; if (!['account','server','domain'].includes(type) || !data.name?.trim()) return reply.code(400).send({error:'请填写名称'}); const result = db.prepare('INSERT INTO entries (type,data) VALUES (?,?)').run(type, JSON.stringify(data)); return {id:Number(result.lastInsertRowid)} })
app.put('/api/entries/:id', (req, reply) => { const { type, ...data } = req.body; if (!['account','server','domain'].includes(type) || !data.name?.trim()) return reply.code(400).send({error:'请填写名称'}); const result = db.prepare('UPDATE entries SET type=?,data=? WHERE id=?').run(type,JSON.stringify(data),req.params.id); return {updated:result.changes} })
app.delete('/api/entries/:id', req => ({deleted:db.prepare('DELETE FROM entries WHERE id=?').run(req.params.id).changes}))

const history=registerParseHistory(app,db)
registerDownloadJobs(app,{parseMedia,prepareMedia,platformReferer,history})
app.post('/api/parse', async (req, reply) => { const input=String(req.body?.input||'').trim();if(!input||input.length>4000)return reply.code(400).send({error:'请输入作品链接或分享内容'});try{const parsed=await parseMedia(input);const data=await prepareMedia(parsed,{original:req.body?.quality==='original',referer:platformReferer(parsed.platform)});const id=history.record(data,data,req.body?.quality==='original'?'original':'standard');return history.data(id)}catch(error){return reply.code(502).send({error:error.message,quality_report:error.qualityReport})} })
app.get('/api/media/:id', async (req, reply) => { const asset=db.prepare('SELECT * FROM parse_media WHERE id=?').get(req.params.id); if(!asset) return reply.code(404).send({error:'素材已失效，请重新解析'}); if(asset.path)return sendLocalMedia(req,reply,asset.path);const url=asset.url; try { const headers={ 'User-Agent':'Mozilla/5.0', 'Referer':asset.referer }; if(req.headers.range) headers.Range=req.headers.range; const response=await fetch(url,{headers,signal:AbortSignal.timeout(30000)}); if(!response.ok) return reply.code(502).send({error:'素材获取失败'}); for(const h of ['content-type','content-length','content-range','accept-ranges']) if(response.headers.has(h)) reply.header(h,response.headers.get(h)); if(req.query.download) reply.header('Content-Disposition',`attachment; filename="media.${req.query.download==='video'?'mp4':'jpg'}"`); return reply.code(response.status).send(Readable.fromWeb(response.body)) } catch { return reply.code(502).send({error:'素材获取失败'}) } })
if(process.env.WORKBENCH_DESKTOP==='1'){
  const token=process.env.WORKBENCH_SESSION_TOKEN
  if(!token)throw Error('Missing desktop session token')
  app.addHook('onRequest',async(req,reply)=>{
    if(req.url.startsWith('/__desktop/start?')&&req.query.token===token){reply.header('Set-Cookie',`workbench_session=${token}; HttpOnly; SameSite=Strict; Path=/`);return reply.redirect('/')}
    const valid=String(req.headers.cookie||'').split(';').some(c=>c.trim()===`workbench_session=${token}`)
    if(!valid)return reply.code(403).send({error:'Unauthorized'})
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return reply.code(403).send({error:'Invalid origin'})
  })
  app.get('/__desktop/start',()=>({}))
  mkdirSync(writablePublic,{recursive:true})
  await app.register(fastifyStatic,{root:[writablePublic,join(import.meta.dirname,'../dist')],index:['index.html']})
  app.setNotFoundHandler((req,reply)=>req.url.startsWith('/api/')?reply.code(404).send({error:'Not found'}):reply.sendFile('index.html'))
}
app.listen({port:process.env.WORKBENCH_DESKTOP==='1'?Number(process.env.WORKBENCH_PORT||38641):3001,host:'127.0.0.1'}).then(address=>{
  if(process.env.WORKBENCH_READY_FILE)writeFileSync(process.env.WORKBENCH_READY_FILE,address)
  warmNativeReveal().catch(()=>{})
}).catch(error=>{app.log.error(error);process.exit(1)})
