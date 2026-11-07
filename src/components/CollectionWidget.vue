<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue'
import {RouterLink} from 'vue-router'
import {IconBook,IconFileText} from '@tabler/icons-vue'
import {listBooks} from '../utils/bookshelf-storage.js'
import '../css/collection-widget.css'
const props=defineProps({kind:{type:String,required:true}})
const books=props.kind==='bookshelf', title=books?'书架':'资料库', icon=books?IconBook:IconFileText
const items=ref([]), loading=ref(true), error=ref(false)
let request
async function load(){
  request?.abort(); const controller=new AbortController(); request=controller
  loading.value=true;error.value=false
  try{
    if(books){
      const rows=await listBooks();let marks={}
      try{marks=JSON.parse(localStorage.getItem('bookshelf-reading')||'{}')||{}}catch{}
      if(!controller.signal.aborted)items.value=rows.sort((a,b)=>(marks[b.id]?.time||0)-(marks[a.id]?.time||0)||b.created-a.created).slice(0,3).map(item=>({...item,name:item.title,detail:marks[item.id]?`已读 ${Math.max(0,Math.min(100,Number(marks[item.id].progress)||0))}%`:'未开始'}))
    }else{
      const response=await fetch('/api/library/recent',{signal:controller.signal});if(!response.ok)throw Error('读取失败')
      const data=await response.json();items.value=data.items.map(item=>({...item,detail:new Date(item.created).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})}))
    }
  }catch{if(!controller.signal.aborted)error.value=true}
  finally{if(!controller.signal.aborted)loading.value=false}
}
onMounted(load);onBeforeUnmount(()=>request?.abort())
</script>
<template>
  <AppCard class="collection-widget" :aria-label="title">
    <div class="collection-widget-heading"><h2><component :is="icon" :size="17" aria-hidden="true"/>{{title}}</h2><RouterLink :to="{name:kind}">查看全部 →</RouterLink></div>
    <p v-if="loading" class="collection-widget-empty" role="status">正在读取…</p>
    <div v-else-if="error" class="collection-widget-empty">暂时无法读取 <el-button text @click="load">重试</el-button></div>
    <div v-else-if="!items.length" class="collection-widget-empty"><span>{{books?'还没有导入书籍':'还没有上传资料'}}</span><RouterLink :to="{name:kind}">{{books?'前往书架':'打开资料库'}}</RouterLink></div>
    <ul v-else class="collection-widget-list"><li v-for="item in items" :key="item.id"><RouterLink :to="{name:kind,query:books?{book:item.id}:{folder:item.parent||undefined,file:item.id}}"><component :is="icon" :size="16" aria-hidden="true"/><span :title="item.name">{{item.name}}</span><small>{{item.detail}}</small></RouterLink></li></ul>
  </AppCard>
</template>
