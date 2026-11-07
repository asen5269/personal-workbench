<script setup>
defineProps({ variant: { type: String, default: 'primary' }, type: { type: String, default: 'button' } })
</script>
<template><el-button :native-type="type" :type="variant === 'secondary' ? '' : variant" :text="variant === 'danger'"><slot /></el-button></template>
