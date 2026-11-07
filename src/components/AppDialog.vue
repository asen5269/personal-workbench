<script setup>
defineProps({ modelValue: Boolean, title: { type: String, required: true }, description: String, width: { type: [String, Number], default: 560 } })
defineEmits(['update:modelValue','closed'])
</script>
<style>
.el-dialog .el-dialog__headerbtn{border-radius:50%;background:var(--theme-soft);color:var(--theme-accent);display:grid;place-items:center;transition:transform var(--duration) var(--ease),opacity var(--duration) var(--ease)}
.el-dialog .el-dialog__headerbtn .el-dialog__close{color:inherit;font-size:17px}
.el-dialog .el-dialog__headerbtn:active{transform:scale(.9)}
.el-dialog .el-dialog__headerbtn:focus-visible{outline:2px solid var(--theme-accent);outline-offset:3px}
@media(hover:hover){.el-dialog .el-dialog__headerbtn:hover{opacity:.72;transform:rotate(90deg)}}
@media(prefers-reduced-motion:reduce){.el-dialog .el-dialog__headerbtn{transition:none}.el-dialog .el-dialog__headerbtn:hover,.el-dialog .el-dialog__headerbtn:active{transform:none}}
</style>
<template><el-dialog :model-value="modelValue" :title="title" :width="width" align-center append-to-body destroy-on-close :close-on-click-modal="false" @update:model-value="$emit('update:modelValue',$event)" @closed="$emit('closed')"><p v-if="description" class="ep-dialog-description">{{ description }}</p><slot /><template v-if="$slots.footer" #footer><slot name="footer" /></template></el-dialog></template>
