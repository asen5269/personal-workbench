<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { tasksState, loadTasks, saveTask } from '../state/tasks.js'
import { localDay, sortTasks } from '../utils/tasks.js'
import TaskRow from '../components/TaskRow.vue'
import TaskEditor from '../components/TaskEditor.vue'
import '../css/tasks.css'
const today = ref(localDay()), view = ref('today'), search = ref(''), category = ref(''), title = ref(''), editor = ref(false), editing = ref(null)
let timer
onMounted(() => { loadTasks(); timer = setInterval(() => { today.value = localDay() }, 60000) })
onUnmounted(() => clearInterval(timer))
const active = computed(() => tasksState.items.filter(t => t.status !== 'done'))
const futureLimit = computed(() => { const date = new Date(`${today.value}T12:00:00`); date.setDate(date.getDate() + 7); return localDay(date) })
const matchView = (t, name) => name === 'done' ? t.status === 'done' : t.status !== 'done' && (name === 'all' || (name === 'today' && t.dueDate && t.dueDate <= today.value) || (name === 'upcoming' && t.dueDate > today.value && t.dueDate <= futureLimit.value) || (name === 'undated' && !t.dueDate))
const views = computed(() => [['today', '今天与逾期'], ['all', '全部待办'], ['upcoming', '未来 7 天'], ['undated', '未设日期'], ['done', '已完成']].map(([id, label]) => ({ id, label, count: tasksState.items.filter(t => matchView(t, id)).length })))
const categories = computed(() => [...new Set(tasksState.items.map(t => t.category).filter(Boolean))].sort())
const filtered = computed(() => {
  const list = tasksState.items.filter(t => matchView(t, view.value) && (!category.value || t.category === category.value) && `${t.title} ${t.notes} ${t.category} ${t.subtasks.map(s => s.title).join(' ')}`.toLowerCase().includes(search.value.trim().toLowerCase()))
  return view.value === 'done' ? list.sort((a, b) => b.completedAt - a.completedAt) : sortTasks(list)
})
const groups = computed(() => view.value !== 'today' ? [{ title: views.value.find(v => v.id === view.value).label, items: filtered.value }] : [{ title: '已逾期', items: filtered.value.filter(t => t.dueDate < today.value) }, { title: '今天', items: filtered.value.filter(t => t.dueDate === today.value) }].filter(g => g.items.length))
function edit(task = null) { editing.value = task; editor.value = true }
async function quickAdd() {
  if (!title.value.trim()) return
  try { await saveTask({ title: title.value, dueDate: view.value === 'today' ? today.value : null, category: category.value }); title.value = ''; ElMessage.success('任务已添加'); if (['done', 'upcoming'].includes(view.value)) view.value = 'all' }
  catch (error) { ElMessage.error(error.message) }
}
</script>
<template>
  <section class="tasks-page" aria-label="待办任务">
    <div class="tasks-workspace">
      <nav class="tasks-views" aria-label="任务视图"><el-button v-for="v in views" :key="v.id" text :class="{ 'is-selected': view === v.id }" :aria-pressed="view === v.id" @click="view = v.id"><span>{{ v.label }}</span><strong>{{ v.count }}</strong></el-button></nav>
      <div class="tasks-main">
        <div class="tasks-tools"><el-input v-model="search" clearable placeholder="搜索标题、备注或步骤" aria-label="搜索任务"/><el-select v-model="category" clearable placeholder="全部分类" aria-label="按分类筛选"><el-option v-for="c in categories" :key="c" :value="c" :label="c"/></el-select><el-button type="primary" @click="edit()">＋ 新建任务</el-button></div>
        <form class="tasks-quick-add" @submit.prevent="quickAdd"><el-input v-model="title" maxlength="200" :placeholder="view === 'today' ? '添加今天要完成的事…' : '添加一项待办…'" aria-label="快速添加任务" :disabled="tasksState.pending.has('new')"/><el-button native-type="submit" :loading="tasksState.pending.has('new')" :disabled="!title.trim() || !tasksState.loaded" type="primary" plain>添加</el-button></form>
        <div v-if="tasksState.error" class="tasks-feedback" role="alert"><el-alert :title="tasksState.error" type="error" :closable="false"/><el-button @click="loadTasks(true)">重新加载</el-button></div>
        <div v-else-if="tasksState.loading && !tasksState.loaded" class="tasks-empty" role="status">正在加载任务…</div>
        <template v-else-if="filtered.length"><section v-for="group in groups" :key="group.title" class="task-group"><h2>{{ group.title }} <span>{{ group.items.length }}</span></h2><TransitionGroup name="task-list" tag="div"><TaskRow v-for="task in group.items" :key="task.id" :task="task" :today="today" @edit="edit"/></TransitionGroup></section></template>
        <div v-else class="tasks-empty"><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="10" y="6" width="28" height="36" rx="5"/><path d="m17 24 5 5 10-12"/></svg><h2>{{ search || category ? '没有匹配的任务' : view === 'today' ? '今天没有到期或逾期任务' : view === 'done' ? '还没有已完成的任务' : '这里还没有任务' }}</h2><p>{{ search || category ? '试试其他关键词或分类。' : view === 'today' ? '可以添加今天的安排，或查看全部待办。' : '只填写标题，也可以开始。' }}</p><el-button v-if="view === 'today'" text type="primary" @click="view = 'all'">查看全部待办</el-button><el-button v-else-if="!search && !category" text type="primary" @click="edit()">新建任务</el-button></div>
        <div class="tasks-list-footer"><span>{{ filtered.length }} 项{{ view === 'done' ? '已完成' : '待办' }}</span><span>数据保存在本机</span></div>
      </div>
    </div>
    <TaskEditor v-model="editor" :task="editing"/>
  </section>
</template>

