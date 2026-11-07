<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { IconUpload, IconPhoto, IconDownload, IconX } from '@tabler/icons-vue'
import { createImageArchive } from '../utils/image-batch.js'
import '../css/file-tools.css'

const files=ref([]),picker=ref(null),dragging=ref(false),busy=ref(false),packing=ref(false),error=ref(''),archive=ref(null)
const format=ref('webp'),quality=ref(80),scale=ref(1),processed=ref(0),queueSize=ref(0)
const working=computed(()=>busy.value||packing.value)
const scaleOptions=[{value:0.25,label:'缩小 4 倍（25%）'},{value:0.5,label:'缩小 2 倍（50%）'},{value:1,label:'原尺寸（100%）'},{value:1.5,label:'放大 1.5 倍（150%）'},{value:2,label:'放大 2 倍（200%）'},{value:3,label:'放大 3 倍（300%）'},{value:4,label:'放大 4 倍（400%）'}]
const formatOptions=[{value:'webp',label:'WebP'},{value:'jpg',label:'JPG（.jpg）'},{value:'jpeg',label:'JPEG（.jpeg）'},{value:'png',label:'PNG'},{value:'avif',label:'AVIF'},{value:'svg',label:'SVG（高精度）'},{value:'ico',label:'ICO（多尺寸图标）'}]
const accept='.jpg,.jpeg,.png,.webp,.avif,.gif,.tif,.tiff,.svg,.ico'
const results=computed(()=>files.value.map(item=>item.result).filter(Boolean))
const failed=computed(()=>files.value.filter(item=>item.status==='处理失败').length)
const unprocessed=computed(()=>files.value.filter(item=>!item.result))
const result=computed(()=>files.value.length===1?files.value[0].result:null)
const total=computed(()=>files.value.reduce((sum,item)=>sum+item.file.size,0))
const estimatedDimensions=computed(()=>{
  if(format.value==='ico')return 'ICO 包含 16、32、48、64、128、256 像素图层，等比例居中，空白处透明。'
  if(files.value.length>1)return `已选 ${files.value.length} 张图片，按各自原尺寸等比缩放。`
  return files.value.length?dimensions(files.value[0]):'选择图片后显示预计尺寸'
})
let controller,disposed=false,cancelled=false
function bytes(value){return value<1024?`${value} B`:value<1024**2?`${(value/1024).toFixed(1)} KB`:`${(value/1024**2).toFixed(1)} MB`}
function dimensions(item){if(!item.width||!item.height)return '处理完成后显示实际尺寸';return `原图 ${item.width} × ${item.height} → 预计 ${Math.max(1,Math.round(item.width*scale.value))} × ${Math.max(1,Math.round(item.height*scale.value))}`}
function clearArchive(){if(archive.value)URL.revokeObjectURL(archive.value);archive.value=null}
function resetItem(item){if(item.result)URL.revokeObjectURL(item.result.url);item.result=null;item.status='待处理';item.error=''}
function clearResults(){clearArchive();error.value='';files.value.forEach(resetItem);processed.value=0;queueSize.value=0}
function clearFiles(){clearResults();files.value.forEach(item=>URL.revokeObjectURL(item.preview));files.value=[]}
watch([format,quality,scale],clearResults)
watch(format,value=>{if(value==='ico')scale.value=1})
function select(selected){
  if(working.value)return
  const incoming=[...selected];if(!incoming.length)return
  error.value=''
  if(files.value.length+incoming.length>20){error.value='一次最多处理 20 张图片';return}
  if(incoming.some(file=>!file.size||file.size>20*1024**2)){error.value='请选择非空且不超过 20MB 的图片';return}
  if(total.value+incoming.reduce((sum,file)=>sum+file.size,0)>200*1024**2){error.value='本批图片总大小最大 200MB';return}
  if(incoming.some(file=>!accept.split(',').some(extension=>file.name.toLowerCase().endsWith(extension)))){error.value='包含不支持的图片格式';return}
  clearArchive()
  files.value.push(...incoming.map(file=>({id:crypto.randomUUID(),file,preview:URL.createObjectURL(file),previewFailed:false,width:0,height:0,status:'待处理',error:'',result:null})))
}
function choose(event){select(event.target.files);event.target.value=''}
function drop(event){dragging.value=false;select(event.dataTransfer.files)}
function remove(index){if(working.value)return;const item=files.value.splice(index,1)[0];URL.revokeObjectURL(item.preview);resetItem(item);clearArchive();error.value=''}
async function convert(onlyUnprocessed=false){
  if(working.value||!files.value.length)return
  const queue=onlyUnprocessed?[...unprocessed.value]:[...files.value]
  if(!queue.length)return
  clearArchive();error.value='';busy.value=true;cancelled=false;processed.value=0;queueSize.value=queue.length
  queue.forEach(resetItem)
  for(const item of queue){
    if(disposed||cancelled)break
    item.status='处理中';controller=new AbortController()
    try{
      const body=new FormData();body.append('format',format.value);body.append('quality',String(quality.value));body.append('scale',String(format.value==='ico'?1:scale.value));body.append('files',item.file,item.file.name)
      const response=await fetch('/api/file-tools/convert?mode=image',{method:'POST',body,signal:controller.signal})
      if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||'处理失败，请重试')}
      const blob=await response.blob();if(disposed)break
      const header=response.headers.get('content-disposition')||'',name=decodeURIComponent(header.match(/filename\*=UTF-8''(.+)$/i)?.[1]||`image.${format.value}`)
      item.result={blob,name,url:URL.createObjectURL(blob),size:blob.size,width:response.headers.get('x-image-width'),height:response.headers.get('x-image-height')};item.status='已完成'
    }catch(exception){if(!disposed){item.status=cancelled?'已取消':'处理失败';item.error=cancelled?'':exception.message}}
    finally{if(!disposed)processed.value++}
  }
  if(!disposed){if(cancelled)queue.filter(item=>item.status==='待处理').forEach(item=>item.status='已取消');busy.value=false;controller=null}
}
function cancel(){cancelled=true;controller?.abort()}
async function downloadZip(){
  if(working.value||!results.value.length)return
  packing.value=true;error.value=''
  try{
    if(!archive.value){const blob=await createImageArchive(results.value);if(disposed)return;archive.value=URL.createObjectURL(blob)}
    const link=document.createElement('a');link.href=archive.value;link.download='图片处理结果.zip';link.click()
  }catch(exception){if(!disposed)error.value=exception.message}
  finally{if(!disposed)packing.value=false}
}
onBeforeUnmount(()=>{disposed=true;cancel();clearFiles()})
</script>

<template>
  <section class="file-tools-page image-batch-page tools-studio">
    <header class="file-tools-heading"><IconPhoto class="studio-heading-icon" :size="36"/><div><h1>图片处理</h1><p>批量转换格式、压缩与缩放，也支持 SVG 矢量描摹和 ICO 图标。</p></div><span class="file-tools-local">本机处理</span></header>
    <div class="file-tools-layout">
      <section class="file-tools-input"><div class="file-tools-section-title"><h2>选择图片 <small v-if="files.length">{{files.length}} / 20</small></h2><el-button v-if="files.length" text :disabled="working" @click="clearFiles">清空</el-button></div>
        <input ref="picker" type="file" :accept="accept" multiple hidden @change="choose"/>
        <button type="button" class="file-tools-drop" :class="{'is-dragging':dragging}" :disabled="working" @click="picker.click()" @dragover.prevent="dragging=true" @dragleave.prevent="dragging=false" @drop.prevent="drop"><IconUpload :size="30"/><strong>{{files.length?'继续添加图片':'点击选择，或拖拽多张图片到这里'}}</strong><span>JPG / JPEG / PNG / WebP / AVIF / SVG / ICO / GIF / TIFF</span><span>最多 20 张 · 单张最大 20MB · 本批最大 200MB</span></button>
        <ul v-if="files.length" class="file-tools-files image-batch-files"><li v-for="(item,index) in files" :key="item.id"><div class="file-tools-thumbnail"><img v-if="!item.previewFailed" :src="item.preview" alt="" @load="item.width=$event.target.naturalWidth;item.height=$event.target.naturalHeight" @error="item.previewFailed=true"/><IconPhoto v-else :size="24"/></div><div class="file-tools-filename"><strong :title="item.file.name">{{item.file.name}}</strong><span>{{bytes(item.file.size)}} · {{item.status}}</span><span v-if="!item.result&&item.width&&format!=='ico'" class="image-batch-dimensions">{{dimensions(item)}}</span><p v-if="item.error" class="conversion-file-error" role="alert">{{item.error}}</p><a v-if="item.result" class="conversion-inline-download" :href="item.result.url" :download="item.result.name"><IconDownload :size="14"/>{{item.result.name}} · {{bytes(item.result.size)}} · {{item.result.width}} × {{item.result.height}}</a></div><div class="file-tools-file-actions"><el-button text :disabled="working" :aria-label="'移除 '+item.file.name" @click="remove(index)"><IconX :size="16"/></el-button></div></li></ul>
        <Transition name="file-tools-result"><div v-if="files.length" class="image-batch-summary" aria-live="polite"><span>{{busy?`正在处理 ${Math.min(processed+1,queueSize)} / ${queueSize} 张`:`已完成 ${results.length} / ${files.length} 张${failed?' · 失败 '+failed+' 张':''}`}}</span><el-button v-if="results.length" :loading="packing" :disabled="busy" @click="downloadZip"><IconDownload :size="15"/>{{packing?'正在打包':'打包下载（'+results.length+'）'}}</el-button><el-button v-if="!working&&results.length&&unprocessed.length" text @click="convert(true)">重试未完成</el-button></div></Transition>
        <p class="file-tools-note">统一应用右侧设置，每张独立处理；失败不影响其他图片。动图仅处理第一帧，输出不保留 EXIF 等原始元数据。</p>
      </section>
      <section class="file-tools-options"><h2>统一输出设置</h2><el-form label-position="top" @submit.prevent="convert()">
        <el-form-item label="输出格式"><el-select v-model="format" :disabled="working" aria-label="输出格式"><el-option v-for="option in formatOptions" :key="option.value" :label="option.label" :value="option.value"/></el-select></el-form-item>
        <el-form-item label="图片质量"><el-slider v-model="quality" :min="1" :max="100" :disabled="working||['png','svg','ico'].includes(format)" aria-label="图片质量"/><p class="file-tools-note">{{format==='svg'?'SVG 使用高精度描摹，保留更多颜色和细线；处理更慢、文件更大。原生 SVG 保留矢量结构。':format==='ico'?'ICO 使用固定图标尺寸，不使用质量和缩放设置。':format==='png'?'PNG 为无损输出，不使用质量滑块。':`当前 ${quality}，数值越低通常文件越小。`}}</p></el-form-item>
        <el-form-item label="缩放比例"><el-select v-model="scale" :disabled="working||format==='ico'" aria-label="缩放比例"><el-option v-for="option in scaleOptions" :key="option.value" :value="option.value" :label="option.label"/></el-select></el-form-item>
        <Transition name="file-tools-result" mode="out-in"><p :key="estimatedDimensions" class="file-tools-note" role="status">{{estimatedDimensions}}</p></Transition>
        <p class="file-tools-note">按宽高等比缩放；放大不会增加原图细节。JPG / JPEG 透明区域填白色，处理后文件不一定更小。</p>
        <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
        <el-button class="file-tools-submit" type="primary" :loading="busy" :disabled="!files.length||packing" native-type="submit">{{busy?`正在处理 ${processed} / ${queueSize}`:results.length?'重新处理全部':'处理全部（'+files.length+' 张）'}}</el-button>
        <el-button v-if="busy" class="conversion-cancel" @click="cancel">停止处理</el-button>
      </el-form></section>
    </div>
    <Transition name="file-tools-result"><section v-if="result" class="file-tools-output" aria-live="polite"><img :src="result.url" alt="处理后图片"/><div><h2>处理完成</h2><p>{{result.name}}</p><span>{{bytes(total)}} → {{bytes(result.size)}} · {{result.width}} × {{result.height}} px</span></div><a :href="result.url" :download="result.name"><IconDownload :size="18"/>下载图片</a></section></Transition>
  </section>
</template>
