<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { ElMessage, ElProgress, ElDropdown, ElDropdownMenu, ElDropdownItem } from 'element-plus'
import { IconFolder, IconFolderPlus, IconUpload, IconFileText, IconFileSpreadsheet, IconPresentation, IconPhoto, IconMovie, IconMusic, IconFile, IconDownload, IconSearch, IconChevronRight, IconArrowLeft } from '@tabler/icons-vue'
import AppDialog from '../components/AppDialog.vue'
import {useRoute} from 'vue-router'
const route=useRoute()
import {IconLayoutGrid,IconListDetails,IconColumns3} from '@tabler/icons-vue'
import '../css/library.css'
import '../css/library-views.css'
import {sortLibraryItems} from '../utils/library-sort.js'
import {IconSortAscending,IconSortDescending,IconCheck,IconChevronDown} from '@tabler/icons-vue'

const items = ref([]), crumbs = ref([]), parent = ref(''), search = ref(''), loading = ref(true), error = ref('')
const picker = ref(null), folderOpen = ref(false), folderName = ref(''), folderError = ref(''), saving = ref(false)
const uploads = ref([]), uploading = ref(false), dragDepth = ref(0), preview = ref(null), previewText = ref(''), previewError = ref(''), previewLoading = ref(false)
const views=[{id:'grid',label:'图标视图',icon:IconLayoutGrid},{id:'list',label:'列表视图',icon:IconListDetails},{id:'columns',label:'分栏视图',icon:IconColumns3}]
const storedView=localStorage.getItem('library-view')
const view=ref(views.some(item=>item.id===storedView)?storedView:'grid'),columns=ref([]),columnsLoading=ref(false),columnsError=ref(''),selected=ref(null),columnPane=ref(null)
let columnsId=0
watch(view,value=>{localStorage.setItem('library-view',value);selected.value=null})
const viewIndex=computed(()=>views.findIndex(item=>item.id===view.value))
const sortOptions=[{value:'name',label:'名称'},{value:'created',label:'添加时间'},{value:'size',label:'文件大小'},{value:'type',label:'文件类型'}]
const savedSort=localStorage.getItem('library-sort')
const sortBy=ref(sortOptions.some(item=>item.value===savedSort)?savedSort:'name'),sortDirection=ref(localStorage.getItem('library-sort-direction')==='desc'?'desc':'asc'),foldersFirst=ref(localStorage.getItem('library-folders-first')!=='false')
watch([sortBy,sortDirection,foldersFirst],()=>{localStorage.setItem('library-sort',sortBy.value);localStorage.setItem('library-sort-direction',sortDirection.value);localStorage.setItem('library-folders-first',String(foldersFirst.value))})
const sorted=value=>sortLibraryItems(value,sortBy.value,sortDirection.value,foldersFirst.value)
const sortedColumns=computed(()=>columns.value.map(column=>({...column,items:sorted(column.items)})))
function selectSort(command){
  if(command.startsWith('by:'))sortBy.value=command.slice(3)
  else if(command==='folders')foldersFirst.value=!foldersFirst.value
  else sortDirection.value=command
}
const date=value=>new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))
watch([view,loading],async()=>{
  const id=++columnsId
  if(view.value!=='columns'||loading.value)return
  columnsLoading.value=true;columnsError.value=''
  try {
    const path=[{id:'',name:'全部资料'},...crumbs.value]
    const data=await Promise.all(path.map(async(folder,index)=>({ ...folder,items:index===path.length-1?items.value:(await api(`/api/library?parent=${encodeURIComponent(folder.id)}`)).items,active:path[index+1]?.id})))
    if(id!==columnsId||disposed)return
    columns.value=data;await nextTick();columnPane.value?.scrollTo({left:columnPane.value.scrollWidth,behavior:'instant'})
  }catch(e){if(id===columnsId)columnsError.value=e.message}
  finally{if(id===columnsId)columnsLoading.value=false}
})
async function selectColumn(item){selected.value=item;if(item.kind==='folder')navigate(item.id);else{await nextTick();columnPane.value?.scrollTo({left:columnPane.value.scrollWidth,behavior:'instant'})}}
let activeUpload, disposed = false, loadId = 0, previewId = 0
const visible = computed(() => sorted(items.value.filter(item => item.name.toLowerCase().includes(search.value.toLowerCase()))))
const folderCount = computed(() => items.value.filter(item => item.kind === 'folder').length)
const totalSize = computed(() => items.value.reduce((sum,item) => sum + item.size,0))
const busy = computed(() => uploading.value || loading.value)
function size(value) { if (value < 1024) return `${value} B`; const units = ['KB','MB','GB']; let n = value / 1024, i = 0; while (n >= 1024 && i < 2) { n /= 1024; i++ } return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}` }
function kind(item) {
  if (item.kind === 'folder') return 'folder'
  const ext = item.name.split('.').pop().toLowerCase()
  if (['txt','md'].includes(ext)) return 'text'
  if (['doc','docx','pdf','rtf'].includes(ext)) return 'document'
  if (['xls','xlsx','csv'].includes(ext)) return 'sheet'
  if (['ppt','pptx'].includes(ext)) return 'slides'
  if (['jpg','jpeg','png','gif','webp','avif'].includes(ext)) return 'image'
  if (['mp4','webm'].includes(ext)) return 'video'
  if (['mp3','wav','ogg','m4a','flac'].includes(ext)) return 'audio'
  return 'file'
}
const icons = { folder:IconFolder, text:IconFileText, document:IconFileText, sheet:IconFileSpreadsheet, slides:IconPresentation, image:IconPhoto, video:IconMovie, audio:IconMusic, file:IconFile }
const typeNames = { folder:'文件夹', text:'文本', document:'文档', sheet:'表格', slides:'演示文稿', image:'图片', video:'视频', audio:'音频', file:'文件' }
const contentUrl = item => `/api/library/${item.id}/content`
const revealingFile=ref('')
async function revealLocal(item){
  if(revealingFile.value)return
  revealingFile.value=item.id
  try{await api(`/api/library/${item.id}/reveal`,{method:'POST',headers:{'X-Workbench-Action':'reveal-library-file'}});ElMessage.success('已在资源管理器中定位文件')}
  catch(e){ElMessage.error(e.message)}finally{revealingFile.value=''}
}
async function api(url, options) { const r = await fetch(url,options); const data = await r.json(); if (!r.ok) throw Error(data.error || '操作失败'); return data }
async function load() {
  const id = ++loadId
  loading.value = true; error.value = ''
  try { const data = await api(`/api/library?parent=${encodeURIComponent(parent.value)}`); if (id === loadId && !disposed) { items.value = data.items; crumbs.value = data.crumbs } }
  catch (e) { if (id === loadId && !disposed) error.value = e.message }
  finally { if (id === loadId && !disposed) loading.value = false }
}
function navigate(id) { if (busy.value) return; selected.value=null;parent.value = id; search.value = ''; items.value = []; load() }
async function createFolder() {
  if (saving.value) return
  if (!folderName.value.trim()) { folderError.value = '请输入文件夹名称'; return }
  saving.value = true; folderError.value = ''
  try { await api('/api/library/folders',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({parent:parent.value,name:folderName.value}) }); folderOpen.value = false; await load(); ElMessage.success('文件夹已创建') }
  catch (e) { folderError.value = e.message } finally { saving.value = false }
}
function uploadFile(file, entry, destination) {
  return new Promise((resolve,reject) => {
    const xhr = new XMLHttpRequest(); activeUpload = xhr
    xhr.open('POST',`/api/library/files?parent=${encodeURIComponent(destination)}&name=${encodeURIComponent(file.name)}`)
    xhr.setRequestHeader('Content-Type','application/octet-stream')
    xhr.upload.onprogress = event => { if (event.lengthComputable) entry.progress = Math.min(99,Math.round(event.loaded / event.total * 100)) }
    xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else { let message = '上传失败'; try { message = JSON.parse(xhr.responseText).error || message } catch {} reject(Error(message)) } }
    xhr.onerror = () => reject(Error('网络中断，请重试'))
    xhr.onabort = () => reject(Error('上传已取消'))
    xhr.send(file)
  })
}
async function upload(files) {
  if (busy.value || !files.length) return
  uploading.value = true
  const destination = parent.value
  uploads.value = files.map(file => ({ name:file.name, progress:0, status:'等待上传', failed:false }))
  for (let i = 0; i < files.length; i++) {
    if (disposed) break
    const entry = uploads.value[i]
    try {
      if (files[i].size > 2 * 1024 ** 3) throw Error('单个文件最大 2GB')
      entry.status = '上传中'; await uploadFile(files[i],entry,destination); entry.progress = 100; entry.status = '已上传'
    } catch (e) { entry.failed = true; entry.status = e.message }
  }
  activeUpload = null; uploading.value = false
  if (!disposed) await load()
}
function choose(event) { const files = [...event.target.files]; event.target.value = ''; upload(files) }
function drop(event) { dragDepth.value = 0; upload([...event.dataTransfer.files]) }
async function open(item) {
  if (item.kind === 'folder') return navigate(item.id)
  const id = ++previewId
  preview.value = item; previewText.value = ''; previewError.value = ''; previewLoading.value = false
  if (kind(item) !== 'text') return
  if (item.size > 2 * 1024 ** 2) { previewError.value = '文本超过 2MB，请下载查看'; return }
  previewLoading.value = true
  try { const r = await fetch(contentUrl(item) + '?preview=1'); if (!r.ok) throw Error('文件读取失败'); const text = await r.text(); if (id === previewId && preview.value?.id === item.id) previewText.value = text }
  catch (e) { if (id === previewId) previewError.value = e.message }
  finally { if (id === previewId) previewLoading.value = false }
}
onMounted(async()=>{parent.value=typeof route.query.folder==='string'?route.query.folder:'';await load();const item=items.value.find(item=>item.id===route.query.file);if(!disposed&&item)await open(item)})
onBeforeUnmount(() => { disposed = true; activeUpload?.abort(); previewId++; loadId++;columnsId++ })
</script>

<template>
  <section class="library-page" @dragenter.prevent="dragDepth++" @dragover.prevent @dragleave.prevent="dragDepth=Math.max(0,dragDepth-1)" @drop.prevent="drop">
    <header class="library-heading"><div><h1>资料库</h1><p>文档、灵感与素材，收在一处。</p></div><div class="library-actions"><el-button :disabled="busy" @click="folderName='';folderError='';folderOpen=true"><IconFolderPlus :size="17"/>新建文件夹</el-button><el-button type="primary" :disabled="busy" @click="picker.click()"><IconUpload :size="17"/>{{uploading?'正在上传':'上传文件'}}</el-button></div></header>
    <input ref="picker" type="file" multiple hidden @change="choose"/>
    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false"><el-button text @click="load">重新加载</el-button></el-alert>
    <Transition name="library-fade"><section v-if="uploads.length" class="library-uploads" aria-label="上传进度" aria-live="polite"><div class="library-upload-title"><strong>{{uploading?'正在保存文件':'上传记录'}}</strong><el-button v-if="!uploading" text @click="uploads=[]">收起</el-button></div><div v-for="(entry,index) in uploads" :key="index" class="library-upload"><span :title="entry.name">{{entry.name}}</span><ElProgress :percentage="entry.progress" :status="entry.failed?'exception':entry.progress===100?'success':undefined" :stroke-width="5"/><small :class="{'is-error':entry.failed}">{{entry.status}}</small></div></section></Transition>
    <div class="library-surface" :aria-busy="loading">
      <div class="library-toolbar">
        <nav aria-label="文件夹路径" class="library-breadcrumb">
          <el-button text :disabled="busy || !parent" aria-label="返回上级文件夹" @click="navigate(crumbs.length>1?crumbs[crumbs.length-2].id:'')"><IconArrowLeft :size="18"/></el-button>
          <button :disabled="busy" :aria-current="!parent?'page':undefined" @click="navigate('')">全部资料</button>
          <template v-for="crumb in crumbs" :key="crumb.id"><IconChevronRight :size="14"/><button :disabled="busy" :aria-current="parent===crumb.id?'page':undefined" @click="navigate(crumb.id)">{{crumb.name}}</button></template>
        </nav>
        <div class="library-toolbar-end">
          <el-input v-model="search" placeholder="搜索当前文件夹" clearable aria-label="搜索当前文件夹"><template #prefix><IconSearch :size="17"/></template></el-input>
          <div class="library-view-switch" role="group" aria-label="资料库布局" :style="{'--view-index':viewIndex}"><span class="library-view-indicator" aria-hidden="true"/><button v-for="option in views" :key="option.id" type="button" :aria-label="option.label" :title="option.label" :aria-pressed="view===option.id" @click="view=option.id"><component :is="option.icon" :size="18" :stroke-width="1.6"/></button></div>
          <ElDropdown trigger="click" placement="bottom-end" @command="selectSort">
            <el-button class="library-sort-trigger" :aria-label="`排序：${sortOptions.find(item=>item.value===sortBy).label}，${sortDirection==='asc'?'升序':'降序'}`"><component :is="sortDirection==='asc'?IconSortAscending:IconSortDescending" :size="17"/><span>{{sortOptions.find(item=>item.value===sortBy).label}}</span><IconChevronDown :size="13"/></el-button>
            <template #dropdown><ElDropdownMenu class="library-sort-menu">
              <ElDropdownItem v-for="option in sortOptions" :key="option.value" :command="'by:'+option.value"><span class="library-sort-mark"><IconCheck v-if="sortBy===option.value" :size="15"/></span>{{option.label}}</ElDropdownItem>
              <ElDropdownItem command="asc" divided><span class="library-sort-mark"><IconCheck v-if="sortDirection==='asc'" :size="15"/></span>升序</ElDropdownItem>
              <ElDropdownItem command="desc"><span class="library-sort-mark"><IconCheck v-if="sortDirection==='desc'" :size="15"/></span>降序</ElDropdownItem>
              <ElDropdownItem command="folders" divided><span class="library-sort-mark"><IconCheck v-if="foldersFirst" :size="15"/></span>文件夹优先</ElDropdownItem>
            </ElDropdownMenu></template>
          </ElDropdown>
        </div>
      </div>
      <div class="library-caption"><span>{{search?`找到 ${visible.length} 项`:`${folderCount} 个文件夹 · ${items.length-folderCount} 个文件`}}</span><span>当前文件夹共 {{size(totalSize)}}</span></div>
      <div v-if="loading" class="library-empty" role="status">正在读取资料…</div>
      <div v-else-if="!visible.length&&view!=='columns'" class="library-empty"><IconFolder :size="54"/><h2>{{search?'未找到匹配资料':'给资料安个家'}}</h2><p>{{search?'试试其他文件名。':'创建文件夹，或将文件拖到这里上传。'}}</p><el-button v-if="!search" :disabled="uploading" @click="picker.click()">选择文件</el-button></div>
      <Transition v-else name="library-view" mode="out-in"><div :key="view" class="library-view-content">
      <TransitionGroup v-if="view==='grid'" tag="ul" name="library-sort" class="library-grid" aria-label="资料列表">
        <li v-for="item in visible" :key="item.id" class="library-card">
          <button class="library-card-open" :disabled="busy" :aria-label="(item.kind==='folder'?'打开文件夹 ':'预览 ')+item.name" @click="open(item)">
            <span class="library-card-art" :class="'kind-'+kind(item)"><component :is="icons[kind(item)]" :size="48" :stroke-width="1.4"/><span>{{typeNames[kind(item)]}}</span></span>
            <span class="library-card-name" :title="item.name">{{item.name}}</span>
          </button>
        </li>
      </TransitionGroup>
      <div v-else-if="view==='list'" class="library-list-wrap"><table class="library-list"><thead><tr><th scope="col">名称</th><th scope="col">添加日期</th><th scope="col">大小</th><th scope="col">种类</th></tr></thead><TransitionGroup tag="tbody" name="library-sort"><tr v-for="item in visible" :key="item.id"><td><button :disabled="busy" class="library-list-open" :aria-label="(item.kind==='folder'?'打开文件夹 ':'预览 ')+item.name" @click="open(item)"><span class="library-file-icon" :class="'kind-'+kind(item)"><component :is="icons[kind(item)]" :size="22" :stroke-width="1.5"/></span><span :title="item.name">{{item.name}}</span><IconChevronRight v-if="item.kind==='folder'" :size="14"/></button></td><td>{{date(item.created)}}</td><td>{{item.kind==='folder'?'—':size(item.size)}}</td><td>{{typeNames[kind(item)]}}</td></tr></TransitionGroup></table></div>
      <div v-else ref="columnPane" class="library-columns" aria-label="文件夹分栏">
        <p v-if="columnsError" class="library-column-status" role="alert">{{columnsError}}</p>
        <p v-else-if="columnsLoading" class="library-column-status" role="status">正在读取文件夹…</p>
        <template v-else><section v-for="(column,index) in sortedColumns" :key="column.id" class="library-column" :aria-label="column.name"><h2>{{column.name}}</h2><TransitionGroup tag="ul" name="library-sort"><li v-for="item in column.items.filter(item=>index<columns.length-1||item.name.toLowerCase().includes(search.toLowerCase()))" :key="item.id"><button :disabled="busy" :class="{'is-selected':column.active===item.id||selected?.id===item.id}" :aria-pressed="column.active===item.id||selected?.id===item.id" :aria-label="(item.kind==='folder'?'打开文件夹 ':'选择 ')+item.name" @click="selectColumn(item)" @dblclick="item.kind!=='folder'&&open(item)"><span class="library-file-icon" :class="'kind-'+kind(item)"><component :is="icons[kind(item)]" :size="20" :stroke-width="1.5"/></span><span :title="item.name">{{item.name}}</span><IconChevronRight v-if="item.kind==='folder'" :size="14"/></button></li></TransitionGroup><p v-if="!column.items.length" class="library-column-empty">空文件夹</p></section><aside v-if="selected&&selected.kind!=='folder'" class="library-column-preview" aria-label="所选文件"><img v-if="kind(selected)==='image'" :src="contentUrl(selected)+'?preview=1'" :alt="selected.name"/><component v-else :is="icons[kind(selected)]" :size="64" :stroke-width="1"/><strong>{{selected.name}}</strong><span>{{typeNames[kind(selected)]}} · {{size(selected.size)}}</span><el-button type="primary" :loading="revealingFile===selected.id" :disabled="!!revealingFile" @click="revealLocal(selected)">打开所在文件夹</el-button><el-button @click="open(selected)">预览文件</el-button><a :href="contentUrl(selected)">下载文件</a></aside><aside v-else class="library-column-hint"><IconColumns3 :size="36" :stroke-width="1"/><span>选择文件查看详情</span></aside></template>
      </div>
      </div></Transition>
      <footer class="library-footnote">支持任意文件类型 · 单个文件最大 2GB · 保存在本机</footer>
    </div>
    <Transition name="library-fade"><div v-if="dragDepth && !busy" class="library-drop-overlay"><IconUpload :size="40"/><strong>松开，上传到当前文件夹</strong></div></Transition>
    <AppDialog v-model="folderOpen" title="新建文件夹" :width="440" :close-on-press-escape="!saving" :show-close="!saving"><el-form label-position="top" @submit.prevent="createFolder"><el-form-item label="文件夹名称" :error="folderError"><el-input v-model="folderName" autofocus maxlength="240" placeholder="例如：学习资料" :disabled="saving"/></el-form-item></el-form><template #footer><el-button :disabled="saving" @click="folderOpen=false">取消</el-button><el-button type="primary" :loading="saving" @click="createFolder">创建</el-button></template></AppDialog>
    <AppDialog :model-value="!!preview" :title="preview?.name || '文件预览'" :width="860" @update:model-value="preview=null;previewId++">
      <div v-if="preview" class="library-preview"><p v-if="previewLoading" role="status">正在读取…</p><el-alert v-else-if="previewError" :title="previewError" type="info" :closable="false"/><pre v-else-if="kind(preview)==='text'">{{previewText}}</pre><img v-else-if="kind(preview)==='image'" :src="contentUrl(preview)+'?preview=1'" :alt="preview.name" @error="previewError='图片无法预览，请下载查看'"/><video v-else-if="kind(preview)==='video'" :src="contentUrl(preview)+'?preview=1'" controls preload="metadata" @error="previewError='浏览器无法播放此视频，请下载查看'"/><audio v-else-if="kind(preview)==='audio'" :src="contentUrl(preview)+'?preview=1'" controls preload="metadata" @error="previewError='浏览器无法播放此音频，请下载查看'"/><div v-else class="library-preview-unavailable"><component :is="icons[kind(preview)]" :size="48"/><p>此类文件请下载后打开</p><small>{{size(preview.size)}}</small></div></div>
      <template #footer><div v-if="preview" class="library-preview-actions"><el-button type="primary" :loading="revealingFile===preview.id" :disabled="!!revealingFile&&revealingFile!==preview.id" @click="revealLocal(preview)">打开所在文件夹</el-button><a class="library-download-link" :href="contentUrl(preview)"><IconDownload :size="17"/>下载文件</a></div></template>
    </AppDialog>
  </section>
</template>




