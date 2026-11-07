import { test } from 'node:test'
import assert from 'node:assert/strict'
import { daysUntil, renewalLevel } from '../src/utils/renewal.js'

const today = new Date(2026, 9, 30, 23, 59)
test('30天、7天、当天和过期的提醒边界', () => {
  for (const [date, days, level] of [['2026-11-30',31,''],['2026-11-29',30,'warning'],['2026-11-07',8,'warning'],['2026-11-06',7,'critical'],['2026-10-30',0,'critical'],['2026-10-29',-1,'expired']]) {
    assert.equal(daysUntil(date, today), days)
    assert.equal(renewalLevel(date, today), level)
  }
})
test('无日期和无效日期不触发误报', () => {
  for (const date of [undefined, '', '2026-02-30', '2026-13-01', '2026-2-03', 'invalid']) {
    assert.equal(daysUntil(date, today), null)
    assert.equal(renewalLevel(date, today), '')
  }
})
test('按本地日历跨月、跨年和闰日计算', () => {
  assert.equal(daysUntil('2027-01-01',new Date(2026,11,31,23,59)),1)
  assert.equal(daysUntil('2028-03-01',new Date(2028,1,28)),2)
  assert.equal(daysUntil('2026-03-09',new Date(2026,2,7)),2)
})
