<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { ElProgress } from 'element-plus'
import { IconUpload, IconFile, IconDownload, IconX, IconArrowUp, IconArrowDown, IconArrowsExchange } from '@tabler/icons-vue'
import AppDialog from '../components/AppDialog.vue'
import '../css/file-tools.css'

const routes=ref([]),loading=ref(true),loadError=ref(''),problem=ref(''),mode=ref('files'),files=ref([]),target=ref(''),busy=ref(false),picker=ref(null),dragging=ref(false),formatsOpen=ref(false),formatSearch=ref('')
let activeRequest,disposed=false,cancelled=false
const isMerge=computed(()=>mode.value==='merge')
const sources=computed(()=>[...new Set(routes.value.map(route=>route.source))].sort())
const availableRoutes=computed(()=>routes.value.filter(route=>route.available))
const availableSources=computed(()=>new Set(availableRoutes.value.map(route=>route.source)))
const accept=computed(()=>isMerge.value?'.jpg,.jpeg,.png,.webp,.avif,.tiff,.tif,.gif':sources.value.map(source=>'.'+source).join(','))
const targets=computed(()=>{
  const extensions=[...new Set(files.value.map(item=>item.source))]
  if(!extensions.length)return []
  return [...new Set(availableRoutes.value.filter(route=>route.source===extensions[0]).map(route=>route.target))].filter(target=>extensions.every(source=>availableRoutes.value.some(route=>route.source===source&&route.target===target))).sort()
})
const notes=computed(()=>[...new Set(files.value.map(item=>availableRoutes.value.find(route=>route.source===item.source&&route.target===target.value)?.note).filter(Boolean))])
const completed=computed(()=>files.value.filter(item=>item.url).length)
const formatGroups=computed(()=>[...new Set(routes.value.map(route=>route.category))].map(category=>({category,sources:[...new Set(routes.value.filter(route=>route.category===category).map(route=>route.source))].sort().filter(source=>source.includes(formatSearch.value.trim().toLowerCase()))})).filter(group=>group.sources.length))
const extension=name=>name.includes('.')?name.split('.').pop().toLowerCase():''
function size(value){return value<1024?`${value} B`:value<1024**2?`${(value/1024).toFixed(1)} KB`:`${(value/1024**2).toFixed(1)} MB`}
function resetResults(){problem.value='';files.value.forEach(item=>{if(item.url)URL.revokeObjectURL(item.url);item.url='';item.status='待转换';item.error='';item.progress=0})}
function clear(){resetResults();files.value=[]}
watch(mode,clear)
watch(target,resetResults)
watch(targets,options=>{if(!options.includes(target.value))target.value=options[0]||''})
async function load(){loading.value=true;loadError.value='';try{const response=await fetch('/api/file-tools/capabilities');if(!response.ok)throw Error('无法读取支持格式');const data=await response.json();if(!disposed)routes.value=data.routes}catch(error){if(!disposed)loadError.value=error.message}finally{if(!disposed)loading.value=false}}
function add(selected){
  if(busy.value)return
  const incoming=[...selected];if(!incoming.length)return
  const max=isMerge.value?20:10,limit=isMerge.value?20:200,totalLimit=isMerge.value?80:500
  const allowed=isMerge.value?['jpg','jpeg','png','webp','avif','tiff','tif','gif']:sources.value
  if(files.value.length+incoming.length>max){problem.value=`一次最多选择 ${max} 个文件`;return}
  if(incoming.some(file=>!file.size||file.size>limit*1024**2)){problem.value=`请选择非空文件，单文件最大 ${limit}MB`;return}
  if([...files.value.map(item=>item.file),...incoming].reduce((sum,file)=>sum+file.size,0)>totalLimit*1024**2){problem.value=`本批文件总大小最大 ${totalLimit}MB`;return}
  if(incoming.some(file=>!allowed.includes(extension(file.name)))){problem.value='包含暂不支持的文件格式，请查看支持格式';return}
  resetResults()
  files.value.push(...incoming.map(file=>({id:crypto.randomUUID(),file,source:extension(file.name),status:'待转换',progress:0,url:'',name:'',error:'',size:0})))
}
function choose(event){add(event.target.files);event.target.value=''}
function drop(event){dragging.value=false;add(event.dataTransfer.files)}
function remove(index){resetResults();files.value.splice(index,1)}
function move(index,direction){const next=index+direction;if(next<0||next>=files.value.length)return;resetResults();[files.value[index],files.value[next]]=[files.value[next],files.value[index]]}
function request(body,item,query){
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();activeRequest=xhr;xhr.open('POST','/api/file-tools/convert?mode='+query);xhr.responseType='blob';xhr.timeout=240000
    xhr.upload.onprogress=event=>{if(event.lengthComputable)item.progress=Math.min(99,Math.round(event.loaded/event.total*100))}
    xhr.upload.onload=()=>{item.status='正在转换'}
    xhr.onload=async()=>{if(xhr.status<200||xhr.status>=300){let message='转换失败';try{message=JSON.parse(await xhr.response.text()).error||message}catch{}reject(Error(message));return}resolve({blob:xhr.response,header:xhr.getResponseHeader('content-disposition')||''})}
    xhr.onerror=()=>reject(Error('连接中断，请重试'));xhr.ontimeout=()=>reject(Error('处理超时，请缩小文件后重试'));xhr.onabort=()=>reject(Error('已取消'));xhr.send(body)
  })
}
async function convert(){
  if(busy.value||!files.value.length||(!isMerge.value&&!target.value))return
  resetResults();busy.value=true;cancelled=false
  const queue=isMerge.value?[files.value[0]]:[...files.value]
  for(const item of queue){
    if(disposed||cancelled)break
    item.status='正在上传'
    const body=new FormData()
    if(!isMerge.value)body.append('target',target.value)
    const inputs=isMerge.value?files.value:[item];inputs.forEach(entry=>body.append('files',entry.file,entry.file.name))
    try{
      const result=await request(body,item,isMerge.value?'images-pdf':'universal')
      if(disposed)break
      item.name=decodeURIComponent(result.header.match(/filename\*=UTF-8''(.+)$/i)?.[1]||'converted');item.size=result.blob.size;item.url=URL.createObjectURL(result.blob);item.progress=100;item.status='已完成'
      if(isMerge.value)files.value.slice(1).forEach(entry=>{entry.status='已合并';entry.progress=100})
    }catch(error){if(!disposed){item.status=cancelled?'已取消':'转换失败';item.error=error.message}}
  }
  if(!disposed){if(cancelled)files.value.filter(item=>item.status==='待转换').forEach(item=>item.status='已取消');busy.value=false;activeRequest=null}
}
function cancel(){cancelled=true;activeRequest?.abort()}
onMounted(load)
onBeforeUnmount(()=>{disposed=true;cancel();clear()})
</script>

<template>
  <section class="file-tools-page universal-converter tools-studio">
    <header class="file-tools-heading"><IconArrowsExchange class="studio-heading-icon" :size="36"/><div><h1>文件转换</h1><p>文档、表格、演示文稿、图片、音视频、电子书、数据与字幕。</p></div><el-button :disabled="loading" @click="formatsOpen=true">支持格式</el-button></header>
    <div class="conversion-mode" role="group" aria-label="转换模式"><el-button :type="mode==='files'?'primary':'default'" :disabled="busy" :aria-pressed="mode==='files'" @click="mode='files'">格式互转</el-button><el-button :type="mode==='merge'?'primary':'default'" :disabled="busy" :aria-pressed="mode==='merge'" @click="mode='merge'">图片合并 PDF</el-button><span>本机处理 · 不上传第三方</span></div>
    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false"><el-button text @click="load">重新加载</el-button></el-alert>
    <Transition name="file-tools-result" mode="out-in"><div :key="mode" class="file-tools-layout">
      <section class="file-tools-input"><div class="file-tools-section-title"><h2>{{isMerge?'选择图片':'选择文件'}}</h2><el-button v-if="files.length" text :disabled="busy" @click="clear">清空</el-button></div>
        <input ref="picker" type="file" multiple :accept="accept" hidden @change="choose"/>
        <button class="file-tools-drop" :class="{'is-dragging':dragging}" :disabled="busy||loading||!!loadError" @click="picker.click()" @dragover.prevent="dragging=true" @dragleave.prevent="dragging=false" @drop.prevent="drop"><IconUpload :size="30"/><strong>{{loading?'正在读取支持格式…':'选择文件，或拖拽到这里'}}</strong><span>{{isMerge?'最多 20 张图片 · 单张最大 20MB':`支持 ${availableSources.size} 种输入格式 · 一批最多 10 个文件 · 单文件最大 200MB`}}</span></button>
        <ul v-if="files.length" class="file-tools-files"><li v-for="(item,index) in files" :key="item.id"><div class="file-tools-thumbnail"><IconFile :size="24"/></div><div class="file-tools-filename"><strong :title="item.file.name">{{item.file.name}}</strong><span>{{isMerge?`${index+1} / `:''}}{{item.source.toUpperCase()}} · {{size(item.file.size)}} · {{item.status}}</span><p v-if="item.error" class="conversion-file-error" role="alert">{{item.error}}</p><ElProgress v-if="['正在上传','正在转换','已完成','转换失败'].includes(item.status)" :percentage="item.progress" :show-text="false" :stroke-width="3" :status="item.error?'exception':item.url?'success':undefined"/><a v-if="item.url" class="conversion-inline-download" :href="item.url" :download="item.name"><IconDownload :size="14"/>{{item.name}} · {{size(item.size)}}</a></div><div class="file-tools-file-actions"><template v-if="isMerge"><el-button text :disabled="busy||index===0" :aria-label="'上移 '+item.file.name" @click="move(index,-1)"><IconArrowUp :size="16"/></el-button><el-button text :disabled="busy||index===files.length-1" :aria-label="'下移 '+item.file.name" @click="move(index,1)"><IconArrowDown :size="16"/></el-button></template><el-button text :disabled="busy" :aria-label="'移除 '+item.file.name" @click="remove(index)"><IconX :size="16"/></el-button></div></li></ul>
        <p class="file-tools-note">{{isMerge?'按列表顺序生成 PDF 页面，可用箭头调整。单次总大小最大 80MB。':'按文件格式自动匹配目标。混合格式批量转换时，仅显示共同支持的目标；本批总大小最大 500MB。'}}</p>
      </section>
      <section class="file-tools-options"><h2>输出设置</h2><el-form label-position="top" @submit.prevent="convert"><template v-if="!isMerge"><el-form-item label="源格式"><div class="conversion-source-tags"><el-tag v-for="source in [...new Set(files.map(item=>item.source))]" :key="source" type="info">{{source.toUpperCase()}}</el-tag><span v-if="!files.length">选择文件后自动识别</span></div></el-form-item><el-form-item label="目标格式"><el-select v-model="target" filterable :disabled="busy||!targets.length" placeholder="先选择文件" aria-label="目标格式"><el-option v-for="format in targets" :key="format" :value="format" :label="format.toUpperCase()"/></el-select></el-form-item><el-alert v-if="files.length&&!targets.length" title="这些文件没有共同可用的目标格式，请分批处理或查看支持格式。" type="warning" :closable="false" show-icon/><p v-for="note in notes" :key="note" class="file-tools-note">{{note}}</p></template><div v-else class="file-tools-format-icon"><IconArrowsExchange :size="40"/><p>多张图片 → 一份 PDF</p></div><el-alert v-if="problem" :title="problem" type="error" :closable="false" show-icon/><el-button class="file-tools-submit" native-type="submit" type="primary" :loading="busy" :disabled="!files.length||(!isMerge&&!target)||loading">{{busy?'正在处理…':completed?'重新转换':'开始转换'}}</el-button><el-button v-if="busy" class="conversion-cancel" @click="cancel">取消剩余任务</el-button><p v-if="completed" class="file-tools-note" role="status">已完成 {{completed}} 个输出，可在文件列表下载。</p><p class="file-tools-note">部分格式会丢失样式或重新编码。带附件、分页图片等多个输出会打包为 ZIP；加密文件不绕过密码或 DRM。</p></el-form></section>
    </div></Transition>
    <AppDialog v-model="formatsOpen" title="支持格式" :width="760"><div class="conversion-format-guide"><el-input v-model="formatSearch" placeholder="搜索源格式，如 docx、mp4" clearable aria-label="搜索源格式"/><p class="file-tools-note">选择源文件后，只列出本机已可用的目标。以下为各类输入与对应目标，灰色源格式暂不可用。</p><section v-for="group in formatGroups" :key="group.category"><h3>{{group.category}}</h3><div v-for="source in group.sources" :key="source" class="conversion-format-row"><strong :class="{'is-unavailable':!availableSources.has(source)}">{{source.toUpperCase()}}</strong><span>→</span><span>{{[...new Set(routes.filter(route=>route.source===source&&route.available).map(route=>route.target.toUpperCase()))].join(' / ')||'本机暂不可用'}}</span></div></section><p v-if="!formatGroups.length" class="file-tools-note">没有匹配的源格式</p></div></AppDialog>
  </section>
</template>
