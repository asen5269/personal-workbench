<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { ElMessage, ElDropdown, ElDropdownMenu, ElDropdownItem, ElProgress } from 'element-plus'
import { zipSync } from 'fflate'
import { IconMovie, IconVideo, IconPhoto, IconDownload, IconCopy, IconFolderDown, IconExternalLink, IconCircleCheck } from '@tabler/icons-vue'
import AppCard from './AppCard.vue'
import AppDialog from './AppDialog.vue'
import VideoPlayer from './VideoPlayer.vue'
import '../css/parse-result.css'
const props=defineProps({result:{type:Object,required:true}})
const downloading=ref(false), videoDownloading=ref(false), progressOpen=ref(false), progress=ref({}), downloadError=ref(''), elapsed=ref(0)
const controller=new AbortController()
onBeforeUnmount(()=>controller.abort())
async function taskApi(url,options={}){const response=await fetch(url,{...options,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});const data=await response.json();if(!response.ok)throw Error(data.error||'任务请求失败');return data}
async function downloadVideo(quality,index){
  if(videoDownloading.value)return
  videoDownloading.value=true
  try{
    let data=props.result
    if(quality==='original'||data.quality_report){
      progressOpen.value=true;downloadError.value='';progress.value={stage:'创建下载任务',bytes:0};elapsed.value=0
      const {id}=await taskApi('/api/download-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input:data.url,quality})})
      while(!controller.signal.aborted){
        const job=await taskApi('/api/download-jobs/'+id);progress.value=job;elapsed.value=Math.floor((Date.now()-job.started)/1000)
        if(job.status==='failed')throw Error(job.error)
        if(job.status==='done'){data=job.result;break}
        await new Promise(resolve=>setTimeout(resolve,1000))
      }
      if(controller.signal.aborted)return
    }
    const id=data.videos?.[index];if(!id)throw Error('未找到对应视频，请重新解析')
    const a=document.createElement('a');a.href='/api/media/'+id+'?download=video';a.download='video.mp4';document.body.append(a);a.click();a.remove()
    ElMessage.success('已开始下载')
  }catch(error){if(!controller.signal.aborted){downloadError.value=error.message;ElMessage.error(error.message)}}finally{videoDownloading.value=false}
}
async function copyLink(){try{await navigator.clipboard.writeText(props.result.url);ElMessage.success('作品链接已复制')}catch{ElMessage.error('复制失败，请从原作品页面复制')}}
async function downloadAll(){downloading.value=true;try{const files={};for(const [kind,ext] of [['videos','mp4'],['images','jpg']])for(const [i,id] of (props.result[kind]||[]).entries()){const r=await fetch('/api/media/'+id);if(!r.ok)throw Error();files[`${kind}-${i+1}.${ext}`]=new Uint8Array(await r.arrayBuffer())}const url=URL.createObjectURL(new Blob([zipSync(files,{level:0})],{type:'application/zip'}));const a=document.createElement('a');a.href=url;a.download='作品素材.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);ElMessage.success('素材已打包')}catch{ElMessage.error('下载失败，请重试')}finally{downloading.value=false}}
</script>
<template>
  <div class="parsed-result">
    <AppCard class="parsed-summary"><div class="parsed-summary-top"><span class="parsed-symbol"><IconMovie :size="21"/></span><div><h2>解析结果</h2><p>作品素材 · 已获取 {{result.videos?.length||0}} 个视频、{{result.images?.length||0}} 张图片<span v-if="result.quality_report?.selected"> · {{result.quality_report.selected.measured.width}} × {{result.quality_report.selected.measured.height}} · {{result.quality_report.partial?'本次探测最高可用':'最高可用画质'}}</span></p></div><el-tag class="parsed-success" effect="light" round><IconCircleCheck :size="13"/>解析成功</el-tag></div><div class="parsed-description"><h3>{{result.title||'未获取到作品标题'}}</h3><p v-if="result.content&&result.content!==result.title">{{result.content}}</p><div class="parsed-summary-bottom"><div><el-tag size="small">视频 {{result.videos?.length||0}}</el-tag><el-tag size="small">图片 {{result.images?.length||0}}</el-tag></div><el-link v-if="result.url" :href="result.url" target="_blank" rel="noreferrer" type="primary"><IconExternalLink :size="14"/>打开原作品</el-link></div></div></AppCard>
    <el-alert v-for="w in result.warnings" :key="w" :title="w" type="warning" :closable="false"/>
    <div class="parsed-columns" :class="{'images-only':!result.videos?.length}">
      <AppCard v-if="result.videos?.length" class="parsed-video-panel"><div class="parsed-panel-title"><h3><IconVideo :size="18"/>视频预览</h3><el-tag size="small">{{result.videos.length}} 个</el-tag></div><div v-for="(id,i) in result.videos" :key="id" class="parsed-video-item"><VideoPlayer :src="'/api/media/'+id"/><div class="parsed-video-footer"><span>视频素材 · MP4 {{result.videos.length>1?'· '+(i+1):''}}</span><ElDropdown trigger="click" :disabled="videoDownloading" @command="downloadVideo($event,i)"><el-button type="primary" :loading="videoDownloading"><IconDownload :size="16"/>{{videoDownloading?'准备下载…':'下载视频'}}</el-button><template #dropdown><ElDropdownMenu><ElDropdownItem command="standard">默认画质</ElDropdownItem><ElDropdownItem command="original">原画质（最高可用）</ElDropdownItem></ElDropdownMenu></template></ElDropdown></div></div></AppCard>
      <AppCard class="parsed-assets-panel"><div class="parsed-panel-title"><h3><IconPhoto :size="18"/>图片素材</h3><el-tag size="small">{{result.images?.length||0}} 张</el-tag></div><div class="parsed-image-grid"><div v-for="(id,i) in result.images" :key="id" class="parsed-image-item"><a :href="'/api/media/'+id" target="_blank" rel="noreferrer" :aria-label="'预览图片 '+(i+1)"><img :src="'/api/media/'+id" :alt="'作品图片 '+(i+1)"/></a><div class="parsed-image-footer"><span>{{result.images.length===1?'封面图片':'图片 '+(i+1)}}</span><el-button tag="a" size="small" :href="'/api/media/'+id+'?download=image'"><IconDownload :size="14"/>下载</el-button></div></div></div><p v-if="!result.images?.length" class="parsed-no-images">暂无图片素材</p><div class="parsed-asset-actions"><h4>素材操作</h4><el-button v-if="result.url" text @click="copyLink"><IconCopy :size="16"/>复制作品链接</el-button><el-button text :loading="downloading" :disabled="!result.videos?.length&&!result.images?.length" @click="downloadAll"><IconFolderDown :size="16"/>批量下载素材</el-button></div></AppCard>
    </div>
    <AppDialog v-model="progressOpen" title="准备视频下载" :width="480" :show-close="!videoDownloading" :close-on-press-escape="!videoDownloading"><div class="video-download-progress" role="status" aria-live="polite"><strong>{{downloadError?'准备失败':progress.stage}}</strong><ElProgress :percentage="progress.status==='done'?100:0" :indeterminate="videoDownloading" :show-text="false" :status="downloadError?'exception':progress.status==='done'?'success':undefined"/><p v-if="progress.candidate">画质候选 {{progress.candidate}} / {{progress.candidates}}</p><p>已下载 {{((progress.bytes||0)/1024/1024).toFixed(1)}} MB · 已用时 {{elapsed}} 秒</p><el-alert v-if="downloadError" :title="downloadError" type="error" :closable="false"/><p v-else-if="videoDownloading">正在下载并校验可用画质，请稍候。</p><template v-else><p v-if="progress.result?.quality_report?.selected">实测 {{progress.result.quality_report.selected.measured.width}} × {{progress.result.quality_report.selected.measured.height}} · {{(progress.result.quality_report.selected.measured.video_bit_rate/1000000).toFixed(2)}} Mbps · {{progress.result.quality_report.selected.measured.fps.toFixed(1)}} 帧/秒</p><el-alert v-if="progress.result?.quality_report?.fallback_reason" :title="progress.result.quality_report.fallback_reason" type="warning" :closable="false"/><p>文件已就绪，已交给浏览器下载。</p></template></div><template #footer><el-button :disabled="videoDownloading" @click="progressOpen=false">关闭</el-button></template></AppDialog>
  </div>
</template>
