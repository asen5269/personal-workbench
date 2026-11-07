<script setup>
defineProps({ modelValue: { type: Number, required: true }, options: { type: Array, required: true }, label: { type: String, required: true } })
defineEmits(['update:modelValue','visible-change'])
</script>
<template><el-select class="player-speed-select" :model-value="modelValue" :aria-label="label" :teleported="false" placement="top-end" popper-class="player-speed-options" size="small" @update:model-value="$emit('update:modelValue',$event)" @visible-change="$emit('visible-change',$event)"><el-option v-for="option in options" :key="option" :label="option+'倍'" :value="option" /></el-select></template>
