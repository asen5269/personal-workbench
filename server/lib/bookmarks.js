import { fetchSiteIcon } from './site-icons.js'
export function registerBookmarks(app, db) {
  app.post('/api/bookmarks/icon', async (req, reply) => { try { return await fetchSiteIcon(req.body.url) } catch(error) { return reply.code(422).send({error:error.message}) } })
  db.exec('CREATE TABLE IF NOT EXISTS bookmarks (id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL, position INTEGER NOT NULL)')
  app.get('/api/bookmarks', () => db.prepare('SELECT * FROM bookmarks ORDER BY position,id').all())
  app.put('/api/bookmarks/order', req => {
    const ids = req.body
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) return { error: '排序无效' }
    db.transaction(() => ids.forEach((id, index) => db.prepare('UPDATE bookmarks SET position=? WHERE id=?').run(index, id)))()
    return { saved: true }
  })
  app.put('/api/bookmarks/:id', { bodyLimit: 3 * 1024 * 1024 }, (req, reply) => {
    const { name, url, icon = '', color = '#5d8b78' } = req.body || {}
    let parsed
    try { parsed = new URL(url) } catch { return reply.code(400).send({ error: '网址无效' }) }
    if (!['https:', 'http:'].includes(parsed.protocol) || !name?.trim() || typeof icon !== 'string' || !/^(#[a-f0-9]{6})$/i.test(color) || (icon && !/^\/site-icons\/[a-f0-9]{64}\.png$/.test(icon) && !/^https?:\/\//i.test(icon) && !/^data:image\/(png|jpeg|webp);base64,/.test(icon))) return reply.code(400).send({ error: '请检查名称、网址与图标' })
    db.prepare('INSERT INTO bookmarks VALUES (?,?,?,?,?,(SELECT coalesce(max(position),-1)+1 FROM bookmarks)) ON CONFLICT(id) DO UPDATE SET name=excluded.name,url=excluded.url,icon=excluded.icon,color=excluded.color').run(req.params.id, name.trim(), parsed.href, icon, color)
    return { saved: true }
  })
  app.delete('/api/bookmarks/:id', req => ({ deleted: db.prepare('DELETE FROM bookmarks WHERE id=?').run(req.params.id).changes }))
}
