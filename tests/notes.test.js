import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import Database from 'better-sqlite3'
import { registerNotes } from '../server/lib/notes.js'

test('笔记迁移、摘要分页、筛选、详情、时间保留及删除', async () => {
  const app = Fastify(), db = new Database(':memory:')
  registerNotes(app, db)
  try {
    const notes = Array.from({ length: 12 }, (_, i) => ({ id: String(i), title: `笔记${i}`, category: i % 2 ? '工作' : '学习', content: '正文'.repeat(200), contentHtml: '<p>完整正文</p>', created: i + 1 }))
    const imported = await app.inject({ method: 'POST', url: '/api/notes/import', payload: notes })
    assert.equal(imported.statusCode, 200)
    await app.inject({ method: 'POST', url: '/api/notes/import', payload: notes })
    let result = (await app.inject('/api/notes?size=10')).json()
    assert.equal(result.count, 12)
    assert.equal(result.items.length, 10)
    assert.equal(result.items[0].id, '11')
    assert.equal(result.items[0].contentHtml, undefined)
    assert.equal(result.items[0].content.length, 240)
    result = (await app.inject('/api/notes?page=2&size=10')).json()
    assert.equal(result.items.length, 2)
    result = (await app.inject('/api/notes?category=' + encodeURIComponent('工作') + '&start=5&end=10&full=1')).json()
    assert.deepEqual(result.items.map(n => n.id), ['7', '5'])
    assert.equal(result.items[0].contentHtml, '<p>完整正文</p>')
    await app.inject({ method: 'PUT', url: '/api/notes/11', payload: { ...notes[11], created: 999, title: '修改标题', updated: 123 } })
    const detail = (await app.inject('/api/notes/11')).json()
    assert.equal(detail.created, 12)
    assert.equal(detail.updated, undefined)
    assert.equal(detail.title, '修改标题')
    await app.inject({ method: 'DELETE', url: '/api/notes/11' })
    await app.inject({ method: 'POST', url: '/api/notes/import', payload: notes })
    assert.equal((await app.inject('/api/notes')).json().count, 11)
    assert.equal((await app.inject('/api/notes/11')).statusCode, 404)
    assert.equal((await app.inject('/api/notes?page=999')).json().page, 2)
    assert.equal((await app.inject({ method: 'POST', url: '/api/notes/import', payload: [...notes, {}] })).statusCode, 400)
  } finally { await app.close(); db.close() }
})
