import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import Database from 'better-sqlite3'
import { registerTasks } from '../server/lib/tasks.js'
import { sortTasks, localDay, taskDue } from '../src/utils/tasks.js'

test('task lifecycle preserves details, completion history and database content', async () => {
  const db = new Database(':memory:'), app = Fastify()
  registerTasks(app, db)
  try {
    let reply = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: '  准备发布  ', dueDate: '2026-11-07', priority: 2, category: '工作', notes: '检查安装包', subtasks: [{ title: '测试', done: false }] } })
    assert.equal(reply.statusCode, 201)
    const task = reply.json(), url = `/api/tasks/${task.id}`
    assert.equal(task.title, '准备发布')
    reply = await app.inject({ method: 'PATCH', url, payload: { status: 'done', createdAt: 0, id: 'fake' } })
    assert.equal(reply.json().id, task.id)
    assert.equal(reply.json().createdAt, task.createdAt)
    assert.ok(reply.json().completedAt)
    assert.deepEqual(reply.json().subtasks, task.subtasks)
    reply = await app.inject({ method: 'PATCH', url, payload: { status: 'doing' } })
    assert.equal(reply.json().completedAt, null)
    assert.equal((await app.inject('/api/tasks')).json()[0].status, 'doing')
    assert.equal(JSON.parse(db.prepare('SELECT data FROM tasks').get().data).notes, '检查安装包')
    assert.equal((await app.inject({ method: 'DELETE', url })).statusCode, 200)
    assert.deepEqual((await app.inject('/api/tasks')).json(), [])
    assert.equal((await app.inject({ method: 'PATCH', url, payload: { title: '不存在' } })).statusCode, 404)
  } finally { await app.close(); db.close() }
})
test('invalid dates and malformed fields never create tasks', async () => {
  const db = new Database(':memory:'), app = Fastify()
  registerTasks(app, db)
  try {
    for (const payload of [{ title: ' ' }, { title: 'x', dueDate: '2026-02-30' }, { title: 'x', status: 'invalid' }, { title: 'x', priority: 3 }, { title: 'x', subtasks: [{ title: '', done: false }] }, { title: 'x', category: 'x'.repeat(31) }]) assert.equal((await app.inject({ method: 'POST', url: '/api/tasks', payload })).statusCode, 400)
    assert.deepEqual((await app.inject('/api/tasks')).json(), [])
  } finally { await app.close(); db.close() }
})
test('date sorting and local calendar boundary do not use UTC day', () => {
  assert.equal(localDay(new Date(2026, 10, 7, 0, 1)), '2026-11-07')
  const tasks = [{ id: 1, dueDate: null, priority: 2 }, { id: 2, dueDate: '2026-11-07', priority: 0 }, { id: 3, dueDate: '2026-11-06', priority: 0 }, { id: 4, dueDate: '2026-11-07', priority: 2 }]
  assert.deepEqual(sortTasks(tasks).map(t => t.id), [3, 4, 2, 1])
  assert.equal(taskDue(tasks[1], '2026-11-07'), '今天截止')
  assert.match(taskDue(tasks[2], '2026-11-07'), /已逾期/)
})
