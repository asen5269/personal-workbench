export function daysUntil(value, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return (date.getTime() - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000
}
export function renewalLevel(value, today) {
  const days = daysUntil(value, today)
  return days === null || days > 30 ? '' : days < 0 ? 'expired' : days <= 7 ? 'critical' : 'warning'
}
