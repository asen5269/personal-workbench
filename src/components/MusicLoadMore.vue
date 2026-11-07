<script setup>
import {ref,onMounted,onBeforeUnmount,watch,nextTick} from 'vue'
const props=defineProps({loading:Boolean,more:Boolean,error:String})
const emit=defineEmits(['load'])
const target=ref(null)
let observer,visible=false,armed=true,scroller,position
function load(){if(visible&&armed&&props.more&&!props.loading&&!props.error){armed=false;emit('load')}}
onMounted(()=>{observer=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);if(!visible)armed=true;load()},{rootMargin:'0px 0px 120px 0px'});observer.observe(target.value)})
watch(()=>props.loading,async value=>{
  if(value){
    scroller=target.value?.parentElement
    while(scroller&&!/(auto|scroll)/.test(getComputedStyle(scroller).overflowY))scroller=scroller.parentElement
    position=scroller?.scrollTop
  }else{
    await nextTick()
    if(scroller&&position!==undefined)scroller.scrollTop=position
    load()
  }
},{flush:'sync'})
onBeforeUnmount(()=>observer?.disconnect())
</script>
<template><div ref="target" class="music-load-more" role="status"><span v-if="loading">正在加载…</span><el-button v-else-if="error" text @click="emit('load')">加载失败，点击重试</el-button><span v-else>{{more?'向下滚动加载更多':'已显示全部内容'}}</span></div></template>
