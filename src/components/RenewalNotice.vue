<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { IconBell } from '@tabler/icons-vue'
import AppDialog from './AppDialog.vue'
import AppButton from './AppButton.vue'
import { daysUntil, renewalLevel } from '../utils/renewal.js'
import '../css/notifications.css'
const props = defineProps({ items: { type: Array, required: true }, storageKey: { type: String, default: 'workbench-renewal-dismissed' } })
const emit = defineEmits(['edit'])
const now = ref(new Date()), visible = ref(false), pending = ref(null)
const labels = { account: '账号订阅', server: '服务器', domain: '域名' }
const reminders = computed(() => props.items.filter(item => renewalLevel(item.renewal, now.value)).sort((a,b) => daysUntil(a.renewal, now.value) - daysUntil(b.renewal, now.value)))
const signature = computed(() => reminders.value.map(item => JSON.stringify([item.type,item.id,item.name,item.renewal])).sort().join('|'))
const date = computed(() => `${now.value.getFullYear()}-${now.value.getMonth()+1}-${now.value.getDate()}`)
const urgent = computed(() => reminders.value.some(item => daysUntil(item.renewal, now.value) <= 7))
let timer, dismissed = ''
function token() { return `${date.value}|${signature.value}` }
function isDismissed() { try { return localStorage.getItem(props.storageKey) === token() } catch { return dismissed === token() } }
function dismiss() { dismissed = token(); try { localStorage.setItem(props.storageKey, dismissed) } catch {} }
watch([signature, date], () => { if (!reminders.value.length) visible.value = false; else if (!isDismissed()) visible.value = true }, { immediate: true })
watch(visible, value => { if (!value) dismiss() })
function edit(item) { pending.value = item; visible.value = false }
function closed() { if (pending.value) { emit('edit', pending.value); pending.value = null } }
function status(item) { const days = daysUntil(item.renewal, now.value); return days < 0 ? `已过期 ${-days} 天` : days === 0 ? '今天到期' : `剩余 ${days} 天` }
onMounted(() => { timer = setInterval(() => { now.value = new Date() }, 60000) })
onUnmounted(() => clearInterval(timer))
</script>
<template>
  <el-button v-if="reminders.length" :type="urgent?'danger':'warning'" plain @click="visible=true"><IconBell :size="16" :stroke="1.7" />{{ reminders.length }} 项需续费</el-button>
  <AppDialog v-model="visible" title="续费提醒" description="以下资源已过期，或将在 30 天内到期。" @closed="closed"><el-table :data="reminders" max-height="400"><el-table-column label="资源" min-width="170"><template #default="{row}"><div class="notice-name"><strong>{{row.name}}</strong><small>{{labels[row.type]}} · {{row.renewal}}</small></div></template></el-table-column><el-table-column label="状态" width="120"><template #default="{row}"><el-tag :type="daysUntil(row.renewal,now)<=7?'danger':'warning'" size="small">{{status(row)}}</el-tag></template></el-table-column><el-table-column width="70"><template #default="{row}"><el-button type="primary" link :aria-label="'查看 '+row.name" @click="edit(row)">查看</el-button></template></el-table-column></el-table><template #footer><span class="ep-footer-hint">续费后请更新到期日期</span><AppButton @click="visible=false">今天不再提醒</AppButton></template></AppDialog>
</template>
