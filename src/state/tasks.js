import { reactive } from 'vue'
export const tasksState = reactive({ items: [], loading: false, loaded: false, error: '', pending: new Set() })
let loading
async function request(path = '', options = {}) {
  const response = await fetch(`/api/tasks${path}`, { ...options, headers: { 'Content-Type': 'application/json' } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw Error(data.error || '任务请求失败，请重试')
  return data
}
export function loadTasks(force = false) {
  if (loading) return loading
  if (tasksState.loaded && !force) return Promise.resolve()
  tasksState.loading = true
  tasksState.error = ''
  loading = request().then(items => { tasksState.items = items; tasksState.loaded = true }).catch(error => { tasksState.error = error.message }).finally(() => { tasksState.loading = false; loading = null })
  return loading
}
export async function saveTask(values, id) {
  const key = id || 'new'
  if (tasksState.pending.has(key)) return
  tasksState.pending.add(key)
  try {
    const task = await request(id ? `/${encodeURIComponent(id)}` : '', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(values) })
    const index = tasksState.items.findIndex(item => item.id === task.id)
    if (index < 0) tasksState.items.unshift(task)
    else tasksState.items.splice(index, 1, task)
    return task
  } finally { tasksState.pending.delete(key) }
}
export async function deleteTask(id) {
  if (tasksState.pending.has(id)) return
  tasksState.pending.add(id)
  try { await request(`/${encodeURIComponent(id)}`, { method: 'DELETE' }); tasksState.items = tasksState.items.filter(item => item.id !== id) }
  finally { tasksState.pending.delete(id) }
}
