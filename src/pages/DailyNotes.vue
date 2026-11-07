<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ElDropdown, ElDropdownMenu, ElDropdownItem, ElTooltip, ElMessage, ElMessageBox, ElLoading } from 'element-plus'
import { IconSearch, IconPlus, IconLayoutGrid, IconList, IconBriefcase, IconBulb, IconBook, IconHome, IconFolder, IconDots, IconPinFilled, IconCode, IconPalette, IconPlane, IconHeart, IconCoin, IconChecklist } from '@tabler/icons-vue'
import AppCard from '../components/AppCard.vue'
import NoteEditor from '../components/NoteEditor.vue'
import AppDialog from '../components/AppDialog.vue'
import '../css/notes.css'
import { notesMarkdown, notesWord, notesExcel, noteTime } from '../utils/note-export.js'
const vLoading=ElLoading.directive
const defaultCategories=[{name:'工作',icon:IconBriefcase},{name:'创意',icon:IconBulb},{name:'学习',icon:IconBook},{name:'生活',icon:IconHome}]
function categoryIcon(name){return defaultCategories.find(c=>c.name===name)?.icon||[/技术|编程|开发|代码|AI|科技/i.test(name)?IconCode:/设计|绘画|美术/.test(name)?IconPalette:/旅行|旅游|出行/.test(name)?IconPlane:/健康|运动/.test(name)?IconHeart:/财务|理财|账单/.test(name)?IconCoin:/计划|目标|待办/.test(name)?IconChecklist:IconFolder][0]}
const customCategories=ref([]), categoryInput=ref('')
try{customCategories.value=JSON.parse(localStorage.getItem('workbench-note-categories'))||[]}catch{}
const categories=computed(()=>[...defaultCategories,...[...new Set([...customCategories.value,...serverCategories.value])].filter(name=>name&&!defaultCategories.some(c=>c.name===name)).map(name=>({name,icon:categoryIcon(name)}))])
function addCategory(){const name=categoryInput.value.trim();if(!name)return;if(name==='全部'){ElMessage.error('“全部”为保留名称');return}if(categories.value.some(c=>c.name===name)){draft.value.category=name;categoryInput.value='';return}try{const next=[...customCategories.value,name];localStorage.setItem('workbench-note-categories',JSON.stringify(next));customCategories.value=next;draft.value.category=name;categoryInput.value=''}catch{ElMessage.error('分类保存失败')}}
const covers=['mountains','cat','interior','ocean','mountain','city']
const imageInput=ref(null), imageLoading=ref(false), bodyImageLoading=ref(false)
function coverUrl(note){return note.coverImage||'/notes/'+note.cover+'.png'}
function uploadCover(event){
  const file=event.target.files?.[0];event.target.value='';if(!file)return
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024){ElMessage.error('请选择 2MB 以内的 JPG、PNG 或 WebP 图片');return}
  imageLoading.value=true
  const current=draft.value,reader=new FileReader()
  reader.onload=()=>{if(draft.value===current)draft.value.coverImage=String(reader.result);imageLoading.value=false}
  reader.onerror=()=>{ElMessage.error('图片读取失败，请重试');imageLoading.value=false}
  reader.readAsDataURL(file)
}
const notes=ref([]), query=ref(''), category=ref('全部'), list=ref(false), opened=ref(false), draft=ref({}), saving=ref(false), problem=ref('')
const serverCategories=ref([]), total=ref(0), count=ref(0), loading=ref(true), ready=ref(false), editingExisting=ref(false)
async function api(url,options){const response=await fetch(url,options);const data=await response.json();if(!response.ok)throw Error(data.error||'操作失败');return data}
function params(){const q=new URLSearchParams({page:String(page.value),size:String(pageSize.value),query:query.value.trim()});if(category.value!=='全部')q.set('category',category.value);if(dateRange.value){q.set('start',String(new Date(dateRange.value[0]+'T00:00:00').getTime()));const end=new Date(dateRange.value[1]+'T00:00:00');end.setDate(end.getDate()+1);q.set('end',String(end.getTime()))}return q}
const loadSentinel=ref(null)
let observer, request=0, searchTimer
async function load(append=false){
  if(append&&(loading.value||notes.value.length>=total.value))return
  if(!append){page.value=1;notes.value=[]}
  const current=++request;loading.value=true;problem.value=''
  const q=params();q.set('page',String(append?page.value+1:1))
  try{const data=await api('/api/notes?'+q);if(current!==request)return
    notes.value=append?[...new Map([...notes.value,...data.items].map(n=>[n.id,n])).values()]:data.items
    total.value=data.total;count.value=data.count;serverCategories.value=data.categories;page.value=data.page
  }catch(error){if(current===request)problem.value=error.message}
  finally{if(current===request){loading.value=false;await nextTick();if(loadSentinel.value&&observer){observer.unobserve(loadSentinel.value);observer.observe(loadSentinel.value)}}}
}

onMounted(async()=>{try{if(!localStorage.getItem('workbench-notes-sqlite-migrated')){const old=JSON.parse(localStorage.getItem('workbench-daily-notes')||'[]');for(const note of old)await api('/api/notes/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify([note])});localStorage.setItem('workbench-notes-sqlite-migrated','1')}ready.value=true;observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)&&!problem.value&&!loading.value)load(true)},{rootMargin:'160px'});if(loadSentinel.value)observer.observe(loadSentinel.value);await load()}catch(error){problem.value='笔记迁移失败：'+error.message;loading.value=false}})
onBeforeUnmount(()=>{clearTimeout(searchTimer);observer?.disconnect();request++})
const notesGrid=ref(null)
async function toggleView(){
  const cards=[...(notesGrid.value?.querySelectorAll(':scope > .note-card')||[])]
  cards.forEach(card=>card.getAnimations().forEach(animation=>animation.finish()))
  const before=cards.map(card=>card.getBoundingClientRect())
  list.value=!list.value
  await nextTick()
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return
  const style=getComputedStyle(notesGrid.value)
  cards.forEach((card,i)=>{
    const after=card.getBoundingClientRect()
    card.animate([{transform:`translate(${before[i].x-after.x}px,${before[i].y-after.y}px) scale(${before[i].width/after.width},${before[i].height/after.height})`},{transform:'none'}],{duration:parseFloat(style.getPropertyValue('--duration')),easing:style.getPropertyValue('--ease').trim()})
  })
}
const today=new Date(), monthAgo=new Date(today)
monthAgo.setDate(1)
monthAgo.setMonth(monthAgo.getMonth()-1)
monthAgo.setDate(Math.min(today.getDate(),new Date(today.getFullYear(),today.getMonth(),0).getDate()))
const dateRange=ref([localDate(monthAgo),localDate(today)]), page=ref(1), pageSize=ref(10)
function localDate(value){if(value==null)return '';const d=new Date(value);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
const pageNotes=computed(()=>notes.value)
watch([category,dateRange,pageSize],()=>{page.value=1;if(ready.value)load()})
watch(query,()=>{clearTimeout(searchTimer);request++;loading.value=true;searchTimer=setTimeout(()=>{page.value=1;if(ready.value)load()},250)})

const exporting=ref(false)
async function exportNotes(selected,format='md'){
  if(exporting.value)return
  exporting.value=true
  try{
    if(!selected){selected=[];const q=params();q.set('size','50');q.set('full','1');let next=1;while(true){q.set('page',String(next));const data=await api('/api/notes?'+q);selected.push(...data.items);if(data.page*50>=data.total)break;next++}}
    else selected=await Promise.all(selected.map(n=>api('/api/notes/'+encodeURIComponent(n.id))))
    const blob=format==='xlsx'?await notesExcel(selected):format==='docx'?await notesWord(selected):new Blob([notesMarkdown(selected)],{type:'text/markdown;charset=utf-8'})
    const url=URL.createObjectURL(blob), link=document.createElement('a')
    link.href=url;link.download=(selected.length===1?selected[0].title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,80):'每日笔记-'+localDate(Date.now()))+'.'+format
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
    ElMessage.success('已导出 '+selected.length+' 篇笔记')
  }catch{ElMessage.error('导出失败，请检查正文图片是否可访问后重试')}finally{exporting.value=false}
}
async function edit(note){try{draft.value=note?await api('/api/notes/'+encodeURIComponent(note.id)):{id:crypto.randomUUID(),title:'',content:'',category:category.value==='全部'?'工作':category.value,cover:'mountains',pinned:false};editingExisting.value=!!note;categoryInput.value='';problem.value='';opened.value=true}catch(error){ElMessage.error(error.message)}}
async function save(){if(saving.value)return;if(!draft.value.title.trim()){problem.value='请填写笔记标题';return}saving.value=true;try{await api('/api/notes/'+encodeURIComponent(draft.value.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft.value)});opened.value=false;await load();ElMessage.success('笔记已保存')}catch(error){problem.value=error.message}finally{saving.value=false}}
async function action(command,n){if(command==='excel')return exportNotes([n],'xlsx');if(command==='word')return exportNotes([n],'docx');if(command==='export')return exportNotes([n]);if(command==='edit')return edit(n);try{if(command==='pin'){const note=await api('/api/notes/'+encodeURIComponent(n.id));await api('/api/notes/'+encodeURIComponent(n.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...note,pinned:!note.pinned})})}if(command==='delete'){await ElMessageBox.confirm(`删除「${n.title}」？`,'删除笔记',{confirmButtonText:'删除',cancelButtonText:'取消',type:'warning'});await api('/api/notes/'+encodeURIComponent(n.id),{method:'DELETE'})}await load()}catch(error){if(error!=='cancel'&&error!=='close')ElMessage.error(error.message)}}

</script>
<template>
  <section class="notes-page" aria-label="每日笔记">
    <div class="notes-heading"><div><h1>全部笔记</h1><p>共 {{count}} 篇笔记</p></div><div class="notes-tools"><ElDropdown trigger="click" :disabled="exporting||!total" @command="exportNotes(null,$event)"><el-button :loading="exporting" :disabled="!total">导出笔记</el-button><template #dropdown><ElDropdownMenu><ElDropdownItem command="docx">Word（含图片）</ElDropdownItem><ElDropdownItem command="xlsx">Excel（含图片）</ElDropdownItem><ElDropdownItem command="md">Markdown（无图片）</ElDropdownItem></ElDropdownMenu></template></ElDropdown><el-button type="primary" @click="edit()"><IconPlus :size="19"/>新建笔记</el-button></div></div>
    <div class="notes-filterbar"><div class="notes-filters" role="group" aria-label="笔记分类"><button :class="{selected:category==='全部'}" :aria-pressed="category==='全部'" @click="category='全部'">全部</button><button v-for="c in categories" :key="c.name" :class="{selected:category===c.name}" :aria-pressed="category===c.name" @click="category=c.name"><component :is="c.icon" :size="20"/>{{c.name}}</button></div><div class="notes-search-tools"><el-date-picker class="notes-date-picker" v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" aria-label="按创建时间筛选" clearable /><el-input v-model="query" placeholder="搜索笔记…" clearable aria-label="搜索笔记"><template #prefix><IconSearch :size="19"/></template></el-input><ElTooltip :content="list?'网格视图':'列表视图'"><button class="notes-view" :aria-label="list?'网格视图':'列表视图'" @click="toggleView"><component :is="list?IconLayoutGrid:IconList" :size="20"/></button></ElTooltip></div></div>
    <el-alert v-if="problem&&!opened" :title="problem" type="error" :closable="false" show-icon/><div v-loading="loading&&!notes.length" ref="notesGrid" class="notes-grid" :class="{'notes-list':list}"><AppCard v-for="n in pageNotes" :key="n.id" tag="article" class="note-card"><div class="note-cover"><button class="note-cover-open" :aria-label="'打开笔记 '+n.title" @click="edit(n)"><img :src="coverUrl(n)" loading="lazy" decoding="async" alt=""/></button><ElTooltip v-if="n.pinned" content="取消置顶"><button class="note-pin" :aria-label="'取消置顶 '+n.title" @click="action('pin',n)"><IconPinFilled :size="18"/></button></ElTooltip></div><div class="note-body"><button class="note-open" @click="edit(n)"><h2>{{n.title}}</h2><p>{{n.content}}</p></button><footer><span><component :is="categoryIcon(n.category)" :size="17"/>{{n.category}}<span class="note-times"><time>创建 {{noteTime(n.created)}}</time></span></span><ElDropdown trigger="click" @command="action($event,n)"><button class="note-more" :aria-label="'笔记操作 '+n.title"><IconDots :size="22"/></button><template #dropdown><ElDropdownMenu><ElDropdownItem command="edit">编辑</ElDropdownItem><ElDropdownItem command="excel" :disabled="exporting">导出 Excel</ElDropdownItem><ElDropdownItem command="word" :disabled="exporting">导出 Word</ElDropdownItem><ElDropdownItem command="export" :disabled="exporting">导出 MD</ElDropdownItem><ElDropdownItem command="pin">{{n.pinned?'取消置顶':'置顶'}}</ElDropdownItem><ElDropdownItem command="delete" divided>删除</ElDropdownItem></ElDropdownMenu></template></ElDropdown></footer></div></AppCard></div>
    <el-empty v-if="!loading&&!problem&&!total" :description="query||dateRange||category!=='全部'?'没有找到匹配的笔记':'还没有笔记'"><el-button type="primary" @click="edit()">新建笔记</el-button></el-empty>
    <div ref="loadSentinel" class="notes-load-state" role="status" aria-live="polite"><span v-if="loading">加载中…</span><el-button v-else-if="problem&&ready" @click="load(notes.length>0)">重新加载</el-button><span v-else-if="total&&notes.length>=total">已显示全部 {{total}} 篇笔记</span><span v-else-if="total">继续向下滚动加载</span></div>
  </section>
  <AppDialog v-model="opened" :title="editingExisting?'编辑笔记':'新建笔记'" :width="660"><el-form label-position="top" @submit.prevent="save"><el-form-item label="标题"><el-input v-model="draft.title" maxlength="80" placeholder="给笔记起个名字"/></el-form-item><el-form-item label="分类"><div class="note-category-editor"><div class="note-category-input"><el-input v-model="categoryInput" maxlength="16" placeholder="输入分类名称，回车添加" aria-label="新增分类" @keydown.enter.prevent="addCategory"/><el-button :disabled="!categoryInput.trim()" @click="addCategory">添加</el-button></div><div class="note-category-tags" role="group" aria-label="选择分类"><button v-for="c in categories" :key="c.name" type="button" :aria-pressed="draft.category===c.name" @click="draft.category=c.name"><el-tag :type="draft.category===c.name?'primary':'info'" :effect="draft.category===c.name?'dark':'light'"><component :is="categoryIcon(c.name)" :size="15"/>{{c.name}}</el-tag></button></div></div></el-form-item><el-form-item label="封面"><div class="note-custom-cover"><img v-if="draft.coverImage" :src="draft.coverImage" alt="自定义封面预览"/><div class="note-upload-actions"><el-button :loading="imageLoading" @click="imageInput.click()">{{draft.coverImage?'更换图片':'上传图片'}}</el-button><el-button v-if="draft.coverImage" text @click="draft.coverImage=''">移除图片</el-button><span>JPG、PNG、WebP，最大 2MB</span></div><input ref="imageInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="uploadCover"/></div><div class="note-cover-choices"><button v-for="cover in covers" :key="cover" :aria-label="'选择封面 '+cover" :aria-pressed="!draft.coverImage && draft.cover===cover" :class="{selected:!draft.coverImage && draft.cover===cover}" @click="draft.cover=cover;draft.coverImage=''" type="button"><img :src="'/notes/'+cover+'.png'" alt=""/></button></div></el-form-item><el-form-item label="正文"><NoteEditor v-if="opened" :key="draft.id" v-model="draft.contentHtml" v-model:text="draft.content" @busy="value=>bodyImageLoading=value"/></el-form-item><el-alert v-if="problem" :title="problem" type="error" :closable="false"/></el-form><template #footer><el-button @click="opened=false">取消</el-button><el-button type="primary" :loading="saving" :disabled="imageLoading||bodyImageLoading" @click="save">保存笔记</el-button></template></AppDialog>
</template>
