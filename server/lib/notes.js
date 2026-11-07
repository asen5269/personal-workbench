export function registerNotes(app, db) {
  db.exec(`CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, content TEXT NOT NULL, created INTEGER, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS notes_created ON notes(created DESC, id);
    CREATE INDEX IF NOT EXISTS notes_category_created ON notes(category, created DESC);
    CREATE TABLE IF NOT EXISTS note_imports (id TEXT PRIMARY KEY);`)
  const clean = n => {
    if (!n || typeof n.id !== 'string' || !n.id || typeof n.title !== 'string' || !n.title.trim()) throw Object.assign(Error('笔记数据无效'), { statusCode: 400 })
    const { updated, ...note } = n
    return { ...note, title: n.title.trim(), category: String(n.category || '工作'), content: String(n.content || ''), created: Number.isFinite(n.created) ? n.created : null }
  }
  const insert = db.prepare('INSERT INTO notes VALUES (@id,@title,@category,@content,@created,@data)')
  const row = n => ({ ...n, data: JSON.stringify(n) })
  app.post('/api/notes/import', { bodyLimit: 64 * 1024 * 1024 }, req => {
    if (!Array.isArray(req.body)) throw Object.assign(Error('笔记数据无效'), { statusCode: 400 })
    const notes = req.body.map(clean)
    db.transaction(() => { for (const n of notes) {
      if (db.prepare('SELECT id FROM note_imports WHERE id=?').get(n.id)) continue
      if (!db.prepare('SELECT id FROM notes WHERE id=?').get(n.id)) insert.run(row(n))
      db.prepare('INSERT INTO note_imports VALUES (?)').run(n.id)
    } })()
    return { imported: true }
  })
  app.get('/api/notes', req => {
    const q = req.query, args = [], where = []
    if (q.category) { where.push('category=?'); args.push(q.category) }
    if (q.query) { where.push('instr(lower(title || char(32) || content),lower(?))>0'); args.push(q.query) }
    if (q.start) { where.push('created>=?'); args.push(Number(q.start)) }
    if (q.end) { where.push('created<?'); args.push(Number(q.end)) }
    const filter = where.length ? ' WHERE ' + where.join(' AND ') : ''
    const size = Math.max(1, Math.min(50, Number(q.size) || 10))
    const total = db.prepare('SELECT count(*) AS n FROM notes' + filter).get(...args).n
    const page = Math.max(1, Math.min(Math.ceil(total / size) || 1, Math.floor(Number(q.page) || 1)))
    const select = q.full === '1' ? 'data' : `id,title,category,substr(content,1,240) AS content,created,json_extract(data,'$.cover') AS cover,json_extract(data,'$.pinned') AS pinned`
    const items = db.prepare(`SELECT ${select} FROM notes${filter} ORDER BY created DESC,id LIMIT ? OFFSET ?`).all(...args, size, (page - 1) * size).map(n => q.full === '1' ? JSON.parse(n.data) : { ...n, pinned: !!n.pinned, coverImage: '/api/notes/' + encodeURIComponent(n.id) + '/cover' })
    return { items, total, page, count: db.prepare('SELECT count(*) AS n FROM notes').get().n, categories: db.prepare('SELECT DISTINCT category FROM notes ORDER BY category').all().map(n => n.category) }
  })
  app.get('/api/notes/:id/cover', (req, reply) => {
    const data = db.prepare("SELECT json_extract(data,'$.coverImage') AS image,json_extract(data,'$.cover') AS cover FROM notes WHERE id=?").get(req.params.id)
    const match = data?.image?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s)
    if (match) return reply.header('Cache-Control', 'no-cache').type(match[1]).send(Buffer.from(match[2], 'base64'))
    return reply.redirect('/notes/' + (['mountains','cat','interior','ocean','mountain','city'].includes(data?.cover) ? data.cover : 'mountains') + '.png')
  })
  app.get('/api/notes/:id', (req, reply) => {
    const note = db.prepare('SELECT data FROM notes WHERE id=?').get(req.params.id)
    return note ? JSON.parse(note.data) : reply.code(404).send({ error: '笔记不存在' })
  })
  app.put('/api/notes/:id', { bodyLimit: 64 * 1024 * 1024 }, req => {
    const previous = db.prepare('SELECT created FROM notes WHERE id=?').get(req.params.id)
    const note = clean({ ...req.body, id: req.params.id, created: previous ? previous.created : Date.now() })
    db.prepare('INSERT INTO notes VALUES (@id,@title,@category,@content,@created,@data) ON CONFLICT(id) DO UPDATE SET title=excluded.title,category=excluded.category,content=excluded.content,data=excluded.data').run(row(note))
    return { saved: true }
  })
  app.delete('/api/notes/:id', req => ({ deleted: db.prepare('DELETE FROM notes WHERE id=?').run(req.params.id).changes }))
}
