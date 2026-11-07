import { randomUUID } from 'node:crypto'

export function registerTasks(app, db) {
  db.exec('CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
  const get = id => { const row = db.prepare('SELECT data FROM tasks WHERE id=?').get(id); return row && JSON.parse(row.data) }
  const invalid = message => { throw Object.assign(Error(message), { statusCode: 400 }) }
  function clean(input, previous) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('任务数据无效')
    const value = { ...previous, ...input }
    if (typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 200) invalid('任务标题需为 1–200 字')
    const status = value.status ?? 'todo', priority = value.priority ?? 0, dueDate = value.dueDate || null
    if (!['todo', 'doing', 'done'].includes(status)) invalid('任务状态无效')
    if (![0, 1, 2].includes(priority)) invalid('优先级无效')
    if (dueDate && (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate)) invalid('截止日期无效')
    if (typeof (value.notes ?? '') !== 'string' || (value.notes || '').length > 10000) invalid('备注最多 10000 字')
    if (typeof (value.category ?? '') !== 'string' || (value.category || '').trim().length > 30) invalid('分类最多 30 字')
    const subtasks = value.subtasks ?? []
    if (!Array.isArray(subtasks) || subtasks.length > 50 || subtasks.some(s => !s || typeof s.title !== 'string' || !s.title.trim() || s.title.trim().length > 200 || typeof s.done !== 'boolean')) invalid('子任务最多 50 项，每项需填写标题')
    const now = Date.now()
    return { id: previous?.id || randomUUID(), title: value.title.trim(), status, priority, dueDate, category: (value.category || '').trim(), notes: value.notes || '', subtasks: subtasks.map(s => ({ title: s.title.trim(), done: s.done })), createdAt: previous?.createdAt || now, updatedAt: now, completedAt: status === 'done' ? previous?.completedAt || now : null }
  }
  app.register(async routes => {
    routes.setErrorHandler((error, req, reply) => reply.code(error.statusCode || 500).send({ error: error.statusCode ? error.message : '任务保存失败' }))
    routes.get('/api/tasks', () => db.prepare('SELECT data FROM tasks ORDER BY rowid DESC').all().map(row => JSON.parse(row.data)))
    routes.post('/api/tasks', (req, reply) => {
      const task = clean(req.body)
      db.prepare('INSERT INTO tasks VALUES (?,?)').run(task.id, JSON.stringify(task))
      return reply.code(201).send(task)
    })
    routes.patch('/api/tasks/:id', (req, reply) => {
      const previous = get(req.params.id)
      if (!previous) return reply.code(404).send({ error: '任务不存在或已删除' })
      const task = clean(req.body, previous)
      db.prepare('UPDATE tasks SET data=? WHERE id=?').run(JSON.stringify(task), task.id)
      return task
    })
    routes.delete('/api/tasks/:id', (req, reply) => db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id).changes ? { deleted: true } : reply.code(404).send({ error: '任务不存在或已删除' }))
  })
}
