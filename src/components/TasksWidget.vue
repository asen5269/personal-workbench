<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { tasksState, loadTasks } from '../state/tasks.js'
import { localDay, sortTasks } from '../utils/tasks.js'
import TaskRow from './TaskRow.vue'
import TaskEditor from './TaskEditor.vue'
import '../css/tasks.css'
defineEmits(['navigate'])
const props = defineProps({ limit:{type:Number,default:4} })
const today = ref(localDay()), editor = ref(false), editing = ref(null)
let timer
onMounted(() => { loadTasks(); timer = setInterval(() => { today.value = localDay() }, 60000) })
onUnmounted(() => clearInterval(timer))
const active = computed(() => tasksState.items.filter(t => t.status !== 'done'))
const overdue = computed(() => active.value.filter(t => t.dueDate && t.dueDate < today.value).length)
const dueToday = computed(() => active.value.filter(t => t.dueDate === today.value).length)
const visible = computed(() => sortTasks(active.value).slice(0, props.limit))
function edit(task = null) { editing.value = task; editor.value = true }
</script>
<template>
  <AppCard class="tasks-widget">
    <div class="tasks-widget-heading"><div><h2>待办任务 <span>{{ active.length }}</span></h2><p><template v-if="overdue">{{ overdue }} 项逾期 · </template>今天 {{ dueToday }} 项到期</p></div><div class="tasks-widget-actions"><el-button plain :disabled="!tasksState.loaded" @click="edit()" aria-label="添加待办">＋<span class="task-widget-add-label"> 添加待办</span></el-button><el-button text type="primary" @click="$emit('navigate', 'tasks')">查看全部 →</el-button></div></div>
    <div v-if="tasksState.error" class="tasks-feedback" role="alert"><span>{{ tasksState.error }}</span><el-button text @click="loadTasks(true)">重试</el-button></div>
    <div v-else-if="tasksState.loading && !tasksState.loaded" class="tasks-widget-empty" role="status">正在加载任务…</div>
    <TransitionGroup v-else-if="visible.length" name="task-list" tag="div"><TaskRow v-for="task in visible" :key="task.id" :task="task" :today="today" compact @edit="edit"/></TransitionGroup>
    <div v-else-if="!active.length" class="tasks-widget-empty"><strong>{{ tasksState.items.length ? '待办已全部完成' : '还没有待办任务' }}</strong><p>记录下一件要做的事。</p></div>
    <TaskEditor v-model="editor" :task="editing"/>
  </AppCard>
</template>

