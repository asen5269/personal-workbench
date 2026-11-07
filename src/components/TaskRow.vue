<script setup>
import { ElMessage } from 'element-plus'
import { tasksState, saveTask } from '../state/tasks.js'
import { taskDue, priorityLabels } from '../utils/tasks.js'
defineProps({ task: Object, today: String, compact: Boolean })
defineEmits(['edit'])
async function toggle(task) {
  try { await saveTask({ status: task.status === 'done' ? 'todo' : 'done' }, task.id); ElMessage.success(task.status === 'done' ? '已恢复待办' : '任务已完成') }
  catch (error) { ElMessage.error(error.message) }
}
</script>
<template>
  <div class="task-row" :class="{ 'is-done': task.status === 'done', 'is-compact': compact }">
    <el-checkbox :model-value="task.status === 'done'" :disabled="tasksState.pending.has(task.id)" :aria-label="(task.status === 'done' ? '恢复待办：' : '完成任务：') + task.title" @change="toggle(task)" />
    <button type="button" class="task-row-content" :aria-label="'编辑任务：' + task.title" @click="$emit('edit', task)">
      <span class="task-title">{{ task.title }}</span>
      <span class="task-meta"><span :class="{ 'task-overdue': task.status !== 'done' && task.dueDate && task.dueDate < today }">{{ taskDue(task, today) }}</span><span v-if="task.category">{{ task.category }}</span><span v-if="task.subtasks.length">步骤 {{ task.subtasks.filter(s => s.done).length }}/{{ task.subtasks.length }}</span><span v-if="task.status === 'doing'">进行中</span></span>
    </button>
    <span v-if="task.priority" class="task-priority" :class="'level-' + task.priority">{{ priorityLabels[task.priority] }}</span>
  </div>
</template>
