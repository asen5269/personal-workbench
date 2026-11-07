import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import Database from 'better-sqlite3'
import { registerBookmarks } from '../server/lib/bookmarks.js'

test('网址增改删与排序持久化', async () => {
  const db = new Database(':memory:'), app = Fastify()
  registerBookmarks(app, db)
  try {
    for (const id of ['a', 'b']) assert.equal((await app.inject({ method: 'PUT', url: '/api/bookmarks/' + id, payload: { name: id, url: 'https://example.com' } })).statusCode, 200)
    await app.inject({ method: 'PUT', url: '/api/bookmarks/order', payload: ['b', 'a'] })
    await app.inject({ method: 'PUT', url: '/api/bookmarks/b', payload: { name: '编辑', url: 'https://example.com/edit', color: '#4295db' } })
    const items = (await app.inject('/api/bookmarks')).json()
    assert.deepEqual(items.map(x => x.id), ['b', 'a'])
    assert.equal(items[0].name, '编辑')
    assert.equal((await app.inject({ method: 'PUT', url: '/api/bookmarks/x', payload: { name: '错误', url: 'javascript:alert(1)' } })).statusCode, 400)
    await app.inject({ method: 'DELETE', url: '/api/bookmarks/a' })
    assert.equal((await app.inject('/api/bookmarks')).json().length, 1)
  } finally { await app.close(); db.close() }
})
