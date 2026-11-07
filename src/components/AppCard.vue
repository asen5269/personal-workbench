<script setup>
defineProps({ tag:{type:String,default:'section'}, tone:{type:String,default:'default'}, padding:{type:String,default:'normal'} })
</script>
<template><component :is="tag" class="app-card" :class="['app-card--'+tone,'app-card--'+padding]"><slot/></component></template>
