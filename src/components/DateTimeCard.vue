<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
const now = ref(new Date())
let timer
onMounted(() => { timer = setInterval(() => { now.value = new Date() }, 1000) })
onUnmounted(() => clearInterval(timer))
const date = computed(() => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(now.value))
const time = computed(() => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now.value))
const seconds = computed(()=>String(now.value.getSeconds()).padStart(2,'0'))
</script>
<template><section class="digital-clock" aria-label="本地日期和时间"><span class="clock-date">{{ date }}</span><time :datetime="now.toISOString()"><span class="clock-tile">{{time.slice(0,2)}}</span><span class="clock-colon">:</span><span class="clock-tile">{{time.slice(3,5)}}</span><span class="clock-seconds">{{seconds}}</span></time></section></template>
