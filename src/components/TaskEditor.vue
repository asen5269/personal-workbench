<script setup>
import { ref, watch, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import AppDialog from './AppDialog.vue'
import { saveTask, deleteTask, tasksState } from '../state/tasks.js'
const props = defineProps({ modelValue: Boolean, task: Object })
const emit = defineEmits(['update:modelValue'])
const form = ref({}), error = ref('')
const busy = computed(() => tasksState.pending.has(props.task?.id || 'new'))
const categories = computed(() => [...new Set(['工作', '生活', '学习', ...tasksState.items.map(t => t.category).filter(Boolean)])])
watch(() => props.modelValue, open => { if (open) { form.value = props.task ? structuredClone({ ...props.task, subtasks: props.task.subtasks.map(s => ({ ...s })) }) : { title: '', notes: '', status: 'todo', priority: 0, dueDate: null, category: '', subtasks: [] }; error.value = '' } })
async function save() {
  if (!form.value.title?.trim()) { error.value = '请填写任务标题'; return }
  if (form.value.subtasks.some(s => !s.title.trim())) { error.value = '请填写子任务标题，或移除空项'; return }
  try { await saveTask(form.value, props.task?.id); emit('update:modelValue', false); ElMessage.success('任务已保存') }
  catch (e) { error.value = e.message }
}
async function remove() {
  try { await ElMessageBox.confirm('删除后无法恢复。', '删除这项任务？', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }); await deleteTask(props.task.id); emit('update:modelValue', false); ElMessage.success('任务已删除') }
  catch (e) { if (e instanceof Error) error.value = e.message }
}
</script>
<template>
  <AppDialog :model-value="modelValue" :title="task ? '任务详情' : '新建任务'" :width="620" :show-close="!busy" :close-on-press-escape="!busy" @update:model-value="!busy && emit('update:modelValue', $event)">
    <el-form class="task-editor" label-position="top" :model="form" @submit.prevent="save">
      <el-form-item label="任务标题" required><el-input v-model="form.title" maxlength="200" show-word-limit placeholder="需要完成什么？" :disabled="busy" /></el-form-item>
      <div class="task-form-grid"><el-form-item label="截止日期"><el-date-picker v-model="form.dueDate" type="date" value-format="YYYY-MM-DD" placeholder="不设置" clearable :disabled="busy" /></el-form-item><el-form-item label="优先级"><el-select v-model="form.priority" :disabled="busy"><el-option :value="0" label="普通"/><el-option :value="1" label="优先"/><el-option :value="2" label="紧急"/></el-select></el-form-item>
      <el-form-item label="状态"><el-select v-model="form.status" :disabled="busy"><el-option value="todo" label="待办"/><el-option value="doing" label="进行中"/><el-option value="done" label="已完成"/></el-select></el-form-item><el-form-item label="分类"><el-select v-model="form.category" filterable allow-create default-first-option clearable placeholder="选择或输入分类" :disabled="busy"><el-option v-for="c in categories" :key="c" :value="c" :label="c"/></el-select></el-form-item></div>
      <el-form-item label="备注"><el-input v-model="form.notes" type="textarea" :rows="3" maxlength="10000" placeholder="补充说明、链接或执行要点" :disabled="busy" /></el-form-item>
      <div class="task-steps-heading"><span>子任务 <small>{{ form.subtasks?.length || 0 }}/50</small></span><el-button text :disabled="busy || form.subtasks?.length >= 50" @click="form.subtasks.push({title:'',done:false})">＋ 添加步骤</el-button></div>
      <TransitionGroup name="task-list" tag="div" class="task-steps"><div v-for="(step, index) in form.subtasks" :key="index" class="task-step"><el-checkbox v-model="step.done" :aria-label="'完成子任务 ' + (index + 1)" :disabled="busy"/><el-input v-model="step.title" :aria-label="'子任务 ' + (index + 1)" maxlength="200" placeholder="步骤内容" :disabled="busy"/><el-button text type="danger" :aria-label="'移除子任务 ' + (index + 1)" :disabled="busy" @click="form.subtasks.splice(index, 1)">移除</el-button></div></TransitionGroup>
      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    </el-form>
    <template #footer><div class="task-editor-footer"><el-button v-if="task" text type="danger" :disabled="busy" @click="remove">删除任务</el-button><span/><el-button :disabled="busy" @click="emit('update:modelValue', false)">取消</el-button><el-button type="primary" :loading="busy" @click="save">保存任务</el-button></div></template>
  </AppDialog>
</template>
