<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import WeatherCard from '../components/WeatherCard.vue'
import DateTimeCard from '../components/DateTimeCard.vue'
import BookmarkBar from '../components/BookmarkBar.vue'
import TasksWidget from '../components/TasksWidget.vue'
import CollectionWidget from '../components/CollectionWidget.vue'
import AppDialog from '../components/AppDialog.vue'
import { daysUntil } from '../utils/renewal.js'
import '../css/overview-fixed.css'
const props = defineProps({ items:{type:Array,required:true} })
const emit = defineEmits(['add','edit','navigate'])
const today = ref(new Date()), renewalsOpen = ref(false)
let timer
onMounted(() => { timer = setInterval(() => { today.value = new Date() },60000) })
onUnmounted(() => clearInterval(timer))
const categories = [
  { type: 'account', name: '账号订阅', unit: '个账号', empty: '记录平台账号、订阅费用与续费日期', action: '添加账号', color: 'purple' },
  { type: 'server', name: '服务器', unit: '台服务器', empty: '集中保存主机配置与登录信息', action: '添加服务器', color: 'amber' },
  { type: 'domain', name: '域名', unit: '个域名', empty: '整理注册商、解析配置与到期日期', action: '添加域名', color: 'blue' },
]
const labels = { account: '账号订阅', server: '服务器', domain: '域名' }
function remaining(date) {
  return daysUntil(date, today.value)
}
const renewals = computed(() => props.items.filter(item => remaining(item.renewal) !== null && remaining(item.renewal) <= 30).sort((a, b) => remaining(a.renewal) - remaining(b.renewal)))
const overdue = computed(() => renewals.value.filter(item => remaining(item.renewal) < 0).length)
const missing = computed(() => props.items.filter(item => remaining(item.renewal) === null).length)
const subscriptions = computed(() => props.items.filter(item => item.type === 'account'))
const priced = computed(() => subscriptions.value.filter(item => String(item.price ?? '').trim() !== '' && Number.isFinite(Number(item.price)) && Number(item.price) >= 0))
const total = computed(() => priced.value.reduce((sum, item) => sum + Number(item.price), 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
function status(item) { const days = remaining(item.renewal); return days < 0 ? `已过期 ${Math.abs(days)} 天` : days === 0 ? '今天到期' : `${days} 天后到期` }

</script>
<template>
  <div class="overview-panel overview-fixed">
    <div class="overview-top-row">
      <AppCard class="overview-widgets overview-fixed-weather"><WeatherCard/><DateTimeCard/></AppCard>
      <div class="overview-fixed-bookmarks"><BookmarkBar/></div>
    </div>
    <section class="overview-group overview-daily" aria-label="日常工作"><div class="overview-work-grid"><TasksWidget @navigate="emit('navigate',$event)"/><div class="overview-recent-stack"><CollectionWidget kind="bookshelf"/><CollectionWidget kind="library"/></div></div></section>
    <section class="overview-group" aria-label="资源管理"><div class="resource-summary"><AppCard v-for="category in categories" :key="category.type" class="resource-tile" :class="category.color">
        <div class="resource-title"><span class="resource-marker" aria-hidden="true"></span><h3>{{ category.name }}</h3><el-button link type="primary" class="overview-text-button" :aria-label="'查看全部' + category.name" @click="emit('navigate', category.type)">查看全部</el-button></div>
        <div class="resource-count"><strong>{{ items.filter(item => item.type === category.type).length }}</strong><span>{{ category.unit }}</span></div>
        <p>{{ items.some(item => item.type === category.type) ? `其中 ${items.filter(item => item.type === category.type && remaining(item.renewal) !== null && remaining(item.renewal) <= 30).length} 项需关注续费` : category.empty }}</p>
        <el-button type="primary" plain class="resource-add" @click="emit('add', category.type)"><span aria-hidden="true">＋</span>{{ category.action }}</el-button>
      </AppCard></div>
    <div class="overview-work-grid"><AppCard class="renewal-panel widget-renewal-content">
            <div class="widget-content-heading"><h2>续费提醒 <small>{{ renewals.length }}</small></h2><el-button text type="primary" @click="renewalsOpen = true">查看全部 →</el-button></div>
            <div v-if="renewals.length" class="widget-renewal-preview"><button v-for="item in renewals.slice(0,5)" :key="item.id" class="widget-renewal-row" @click="emit('edit',item)"><span><strong>{{ item.name }}</strong><small>{{ labels[item.type] }}</small></span><span :class="{'task-overdue':remaining(item.renewal) <= 0}">{{ status(item) }}</span></button></div>
            <div v-else class="widget-renewal-empty"><strong>{{ items.length ? '近期没有待续费资源' : '还没有资源' }}</strong><p>{{ missing ? missing + ' 项未设置到期日期' : '设置到期日期后可在这里提醒' }}</p></div>
            <el-button class="widget-renewal-action" plain @click="items.length ? emit('navigate',items.find(item => remaining(item.renewal) === null)?.type || 'account') : emit('add','account')">{{ items.length ? missing ? '补全到期日期' : '管理资源' : '添加账号' }}</el-button>
          </AppCard><div class="overview-recent-stack"><AppCard class="spending-panel" tone="soft"><span class="overview-kicker">每月订阅费用</span><div class="spending-total"><span>¥</span>{{ total }}</div><p>{{ priced.length }} / {{ subscriptions.length }} 个账号已填写费用</p><el-button link type="primary" class="overview-text-button" @click="emit('navigate', 'account')">管理订阅费用 <span aria-hidden="true">→</span></el-button></AppCard><AppCard class="record-panel"><h2>资料完整度</h2><div class="record-line"><span>已设置到期日期</span><strong>{{ items.length - missing }}<small> / {{ items.length }}</small></strong></div><div class="record-track" role="meter" aria-label="已设置到期日期的资源" :aria-valuenow="items.length - missing" aria-valuemin="0" :aria-valuemax="Math.max(items.length, 1)"><span :style="{ transform: `scaleX(${items.length ? (items.length - missing) / items.length : 0})` }"></span></div><p>{{ missing ? `${missing} 项资源尚未设置有效日期` : items.length ? '全部资源已设置有效日期' : '添加资源后可查看记录情况' }}</p></AppCard></div></div></section>
    <AppDialog v-model="renewalsOpen" title="续费提醒" :width="720"><el-table v-if="renewals.length" :data="renewals"><el-table-column prop="name" label="资源" min-width="150"/><el-table-column label="状态" width="130"><template #default="{row}">{{ status(row) }}</template></el-table-column><el-table-column width="80"><template #default="{row}"><el-button text @click="renewalsOpen = false; emit('edit',row)">查看</el-button></template></el-table-column></el-table><el-empty v-else description="近期没有待续费资源"/></AppDialog>
  </div>
</template>
