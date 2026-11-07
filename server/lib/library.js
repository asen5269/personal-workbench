import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, unlink, stat, rmdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import {libraryPath,migrateLibrary} from './library-storage.js'
import {revealFileInFolder} from './native-open.js'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const MAX_LIBRARY_FILE = 2 * 1024 ** 3
const previewTypes = { '.txt':'text/plain; charset=utf-8', '.md':'text/plain; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.avif':'image/avif', '.mp4':'video/mp4', '.webm':'video/webm', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.flac':'audio/flac' }
const fail = (code, message) => Object.assign(new Error(message), { statusCode: code })
function nameOf(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 240 || /[\x00-\x1f\\/<>:"|?*]|[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) || ['.', '..'].includes(value.trim())) throw fail(400, '名称不能为空、超过 240 字或包含系统不支持的字符')
  return value.trim()
}

export function registerLibrary(app, db, directory = join(process.env.WORKBENCH_DATA_DIR||join(import.meta.dirname,'../data'), 'library'), { maxFileSize = MAX_LIBRARY_FILE, revealFile=revealFileInFolder } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS library_items (
    id TEXT PRIMARY KEY, parent TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('folder','file')), size INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL, UNIQUE(parent,name));
    CREATE INDEX IF NOT EXISTS library_parent ON library_items(parent);`)
  const get = id => db.prepare('SELECT * FROM library_items WHERE id=?').get(id)
  const filePath=item=>libraryPath(directory,item,get)
  const parentOf = value => {
    const parent = value || ''
    if (typeof parent !== 'string' || (parent && get(parent)?.kind !== 'folder')) throw fail(404, '文件夹不存在')
    return parent
  }
  app.register(async routes => {
    await mkdir(directory, { recursive: true })
    await migrateLibrary(directory,db.prepare('SELECT * FROM library_items').all(),get)
    routes.addContentTypeParser('application/octet-stream', (req, payload, done) => done(null, payload))
    routes.setErrorHandler((error, req, reply) => reply.code(error.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 409 : error.statusCode || 500).send({ error: error.code === 'SQLITE_CONSTRAINT_UNIQUE' ? '当前文件夹已有同名文件或文件夹' : error.statusCode ? error.message : '资料库操作失败，请检查磁盘空间或重试' }))
    routes.get('/api/library', async req => {
      const parent = parentOf(req.query.parent)
      const crumbs = []
      let folder = parent && get(parent)
      while (folder) { crumbs.unshift({ id:folder.id, name:folder.name }); folder = folder.parent && get(folder.parent) }
      const items=db.prepare("SELECT * FROM library_items WHERE parent=? ORDER BY kind DESC, name COLLATE NOCASE").all(parent)
      for(const item of items)if(item.kind==='file'&&existsSync(filePath(item))){const info=await stat(filePath(item));if(info.size!==item.size){item.size=info.size;db.prepare('UPDATE library_items SET size=? WHERE id=?').run(item.size,item.id)}}
      return { items, crumbs }
    })
    routes.get('/api/library/recent', () => ({items:db.prepare("SELECT id,parent,name,size,created FROM library_items WHERE kind='file' ORDER BY created DESC,id DESC LIMIT 3").all()}))
    routes.post('/api/library/folders', async req => {
      const parent = parentOf(req.body?.parent), name = nameOf(req.body?.name), id = randomUUID()
      if(db.prepare('SELECT id FROM library_items WHERE parent=? AND name=? COLLATE NOCASE').get(parent,name))throw fail(409,'当前文件夹已有同名文件或文件夹')
      const path=filePath({id,parent,name})
      try{await mkdir(path)}catch(error){if(error.code==='EEXIST')throw fail(409,'磁盘上已有同名文件或文件夹');throw error}
      try{db.prepare("INSERT INTO library_items(id,parent,name,kind,created) VALUES(?,?,?,'folder',?)").run(id,parent,name,Date.now())}catch(error){await rmdir(path).catch(()=>{});throw error}
      return get(id)
    })
    routes.post('/api/library/files', { bodyLimit:maxFileSize }, async (req, reply) => {
      const parent = parentOf(req.query.parent), name = nameOf(req.query.name), id = randomUUID(), path = filePath({id,parent,name})
      if (req.headers['content-type']?.split(';')[0] !== 'application/octet-stream') throw fail(415, '请上传文件内容')
      if (Number(req.headers['content-length']) > maxFileSize) throw fail(413, '单个文件最大 2GB')
      if (db.prepare('SELECT id FROM library_items WHERE parent=? AND name=? COLLATE NOCASE').get(parent,name)||existsSync(path)) throw fail(409, '当前文件夹已有同名文件或文件夹')
      let size = 0
      let created=false
      try {
        const stream=createWriteStream(path,{flags:'wx'})
        stream.on('open',()=>{created=true})
        await pipeline(req.body, new Transform({ transform(chunk, encoding, done) { size += chunk.length; done(size > maxFileSize ? fail(413,'单个文件最大 2GB') : null, chunk) } }), stream)
        parentOf(parent)
        db.prepare("INSERT INTO library_items(id,parent,name,kind,size,created) VALUES(?,?,?,'file',?,?)").run(id,parent,name,size,Date.now())
        return reply.code(201).send(get(id))
      } catch (error) { if(created)await unlink(path).catch(() => {});if(error.code==='EEXIST')throw fail(409,'磁盘上已有同名文件');throw error }
    })
    routes.get('/api/library/:id/content', async (req, reply) => {
      const item = get(req.params.id)
      if (!item || item.kind !== 'file') throw fail(404, '文件不存在')
      const path = filePath(item)
      const info = await stat(path).catch(() => { throw fail(410,'本机文件已丢失') })
      const mime = previewTypes[extname(item.name).toLowerCase()]
      const inline = req.query.preview === '1' && mime
      reply.header('Content-Type',inline ? mime : 'application/octet-stream').header('X-Content-Type-Options','nosniff')
        .header('Content-Security-Policy',"default-src 'none'; media-src 'self'; img-src 'self'; sandbox")
        .header('Content-Disposition',`${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(item.name).replace(/['()*]/g,c => '%' + c.charCodeAt(0).toString(16))}`)
        .header('Accept-Ranges','bytes')
      if (!req.headers.range) return reply.header('Content-Length',info.size).send(createReadStream(path))
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range)
      const start = range?.[1] ? Number(range[1]) : Math.max(0,info.size - Number(range?.[2]))
      const end = range?.[1] && range[2] ? Math.min(info.size-1,Number(range[2])) : info.size-1
      if (!range || (!range[1] && !range[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) return reply.code(416).header('Content-Range',`bytes */${info.size}`).send()
      return reply.code(206).header('Content-Range',`bytes ${start}-${end}/${info.size}`).header('Content-Length',end-start+1).send(createReadStream(path,{start,end}))
    })
    routes.post('/api/library/:id/reveal',async req=>{
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.ip)||req.headers['x-workbench-action']!=='reveal-library-file')throw fail(403,'仅允许本机工作台定位文件')
      if(req.headers.origin&&!['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:3001','http://localhost:3001'].includes(req.headers.origin))throw fail(403,'请求来源不受支持')
      const item=get(req.params.id)
      if(!item||item.kind!=='file')throw fail(404,'文件不存在')
      nameOf(item.name)
      const path=filePath(item)
      if(!await stat(path).catch(()=>null))throw fail(410,'本机文件已丢失')
      try{await revealFile(path)}catch{throw fail(502,'无法打开所在文件夹，请检查系统文件管理器是否可用')}
      return {revealed:true,name:item.name}
    })
    routes.delete('/api/library/:id', async req => {
      const item = get(req.params.id)
      if (!item) throw fail(404,'文件不存在')
      if (db.prepare('SELECT id FROM library_items WHERE parent=? LIMIT 1').get(item.id)) throw fail(409,'请先清空文件夹中的内容')
      if (item.kind === 'file') await unlink(filePath(item)).catch(error => { if (error.code !== 'ENOENT') throw error })
      else await rmdir(filePath(item)).catch(error=>{if(error.code==='ENOTEMPTY')throw fail(409,'磁盘文件夹不为空，请先处理其中的文件');if(error.code!=='ENOENT')throw error})
      db.prepare('DELETE FROM library_items WHERE id=?').run(item.id)
      return { deleted:true }
    })
  })
}
