export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || b.priority - a.priority || b.createdAt - a.createdAt)
}
export function taskDue(task, today = localDay()) {
  if (!task.dueDate) return '未设日期'
  if (task.status === 'done') return task.dueDate
  return task.dueDate < today ? `已逾期 · ${task.dueDate}` : task.dueDate === today ? '今天截止' : task.dueDate
}
export const priorityLabels = ['普通', '优先', '紧急']
