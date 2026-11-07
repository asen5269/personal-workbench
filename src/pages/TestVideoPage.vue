<script setup>
import {computed,ref,watch,onBeforeUnmount,nextTick} from 'vue'
import {ElProgress} from 'element-plus'
import {IconUpload,IconVideo,IconDownload,IconPhoto,IconAdjustmentsHorizontal,IconClock,IconBadgeHd,IconAspectRatio,IconCrop,IconPlayerPlay,IconDeviceDesktop,IconInfoCircle} from '@tabler/icons-vue'
import {videoDimensions,drawVideoImage,supportedVideoFormats,generateTestVideo} from '../utils/test-video.js'
import '../css/file-tools.css'
import '../css/test-video.css'

const picker=ref(null),canvas=ref(null),image=ref(null),filename=ref(''),seconds=ref(5),resolution=ref(720),ratio=ref('16:9'),fit=ref('contain'),format=ref('mp4')
const formats=ref([]),checking=ref(false),loading=ref(false),busy=ref(false),progress=ref(0),error=ref(''),status=ref(''),result=ref(null)
const dimensions=computed(()=>videoDimensions(resolution.value,ratio.value))
const locked=computed(()=>busy.value||loading.value)
let controller,probe=0,selection=0,disposed=false
function clearResult(){if(result.value)URL.revokeObjectURL(result.value.url);result.value=null}
watch(dimensions,async({width,height})=>{
  const id=++probe;checking.value=true;error.value='';formats.value=[]
  try {const supported=await supportedVideoFormats(width,height);if(id!==probe||disposed)return;formats.value=supported;if(!supported.some(item=>item.format===format.value))format.value=supported[0]?.format||''}
  catch {if(id===probe)error.value='无法检测视频编码能力，请更新浏览器后重试。'}
  finally {if(id===probe)checking.value=false}
},{immediate:true})
watch([image,dimensions,fit],async()=>{await nextTick();if(canvas.value&&image.value)drawVideoImage(canvas.value,image.value,fit.value)},{flush:'post'})
watch([seconds,resolution,ratio,fit,format],clearResult)
async function select(file){
  if(!file||locked.value)return
  const id=++selection;loading.value=true;error.value='';clearResult()
  const url=URL.createObjectURL(file),img=new Image()
  try {img.src=url;await img.decode();if(disposed||id!==selection)return;image.value=img;filename.value=file.name}
  catch {if(id===selection)error.value='图片无法读取，请选择浏览器支持的图片。'}
  finally {URL.revokeObjectURL(url);if(id===selection)loading.value=false;if(picker.value)picker.value.value=''}
}
async function generate(){
  if(!image.value||busy.value||checking.value)return
  const selected=formats.value.find(item=>item.format===format.value);if(!selected)return
  clearResult();error.value='';status.value='';busy.value=true;progress.value=0;controller=new AbortController()
  try {
    const {width,height}=dimensions.value
    const blob=await generateTestVideo({image:image.value,width,height,seconds:seconds.value,fit:fit.value,...selected,signal:controller.signal,onProgress:value=>progress.value=value})
    if(disposed)return
    result.value={url:URL.createObjectURL(blob),name:`${filename.value.replace(/\.[^.]+$/,'')}-${width}x${height}-${seconds.value}s.${format.value}`,size:(blob.size/1024/1024).toFixed(2)};progress.value=100
  } catch(e){if(!disposed){if(e.name==='AbortError')status.value='已取消生成';else error.value='生成失败：当前浏览器或设备无法完成此设置，请降低分辨率或更换格式。'}}
  finally {busy.value=false}
}
onBeforeUnmount(()=>{disposed=true;selection++;probe++;controller?.abort();clearResult()})
</script>

<template>
  <section class="file-tools-page test-video-page">
    <div class="file-tools-heading"><img class="video-heading-art" src="/test-video/clapper.png" alt="" /><div><h1>测试视频生成</h1><p>一张图片，生成指定时长的静态视频。全部在浏览器完成。</p></div><IconVideo :size="32" /></div>
    <div class="file-tools-layout">
      <div class="file-tools-input">
        <div class="video-panel-title"><h2><IconPhoto :size="26" />上传图片</h2><span>支持 PNG、JPEG、WebP、SVG</span></div>
        <input ref="picker" type="file" accept="image/*" hidden aria-label="选择图片" @change="select($event.target.files[0])" />
        <button class="file-tools-drop video-image-picker" :disabled="locked" @click="picker.click()" @dragover.prevent @drop.prevent="select($event.dataTransfer.files[0])">
          <template v-if="!image"><img class="video-upload-art" src="/test-video/upload.png" alt="" /><strong>{{loading?'正在读取图片…':'点击或拖拽上传一张图片'}}</strong><span>PNG、JPEG、WebP、SVG 等浏览器支持的图片</span><span class="video-upload-action"><IconUpload :size="20" />选择图片</span></template>
          <template v-else><canvas ref="canvas" :width="dimensions.width" :height="dimensions.height" /><span>{{filename}} · 点击更换</span></template>
        </button>
        <p class="file-tools-note video-upload-note"><IconInfoCircle :size="21" />静态画面 · 无声音 · 30 帧/秒。完整显示时，空白区域填充黑色。</p>
      </div>
      <div class="file-tools-options">
        <h2><IconAdjustmentsHorizontal :size="27" />视频设置</h2>
        <label><span class="video-setting-label"><IconClock :size="23" />视频时长</span><ElSelect v-model="seconds" aria-label="视频时长" :disabled="locked"><ElOption v-for="value in [1,3,5,10,15,30,60]" :key="value" :value="value" :label="`${value} 秒`" /></ElSelect></label>
        <label><span class="video-setting-label"><IconBadgeHd :size="23" />输出分辨率</span><ElSelect v-model="resolution" aria-label="输出分辨率" :disabled="locked"><ElOption v-for="value in [360,480,720,1080,2160]" :key="value" :value="value" :label="`${value===2160?'4K':value+'p'}（短边 ${value} 像素）`" /></ElSelect></label>
        <label><span class="video-setting-label"><IconAspectRatio :size="23" />宽高比例</span><ElSelect v-model="ratio" aria-label="宽高比例" :disabled="locked"><ElOption v-for="value in ['16:9','9:16','1:1','4:3','3:4']" :key="value" :value="value" :label="value" /></ElSelect></label>
        <label><span class="video-setting-label"><IconCrop :size="23" />画面适配</span><ElSelect v-model="fit" aria-label="画面适配" :disabled="locked"><ElOption value="contain" label="完整显示（保留整张图片）" /><ElOption value="cover" label="填满画面（居中裁剪）" /></ElSelect></label>
        <label><span class="video-setting-label"><IconPlayerPlay :size="23" />输出格式</span><ElSelect v-model="format" aria-label="输出格式" :disabled="locked||checking||!formats.length"><ElOption v-for="item in formats" :key="item.format" :value="item.format" :label="item.format.toUpperCase()" /></ElSelect></label>
        <div class="video-summary"><IconDeviceDesktop :size="24" /><div><strong>{{dimensions.width}} × {{dimensions.height}} 像素 · {{seconds}} 秒</strong>
        <p v-if="checking" role="status">正在检测浏览器支持的格式…</p>
        <p v-else-if="!formats.length" role="status">当前浏览器不支持此分辨率的视频编码，请降低分辨率或使用新版 Chrome / Edge。</p>
        <p v-else class="file-tools-note">仅显示当前浏览器支持的格式；图片不会上传。</p>
        </div></div><ElButton type="primary" class="file-tools-submit" :disabled="!image||locked||checking||!formats.length" @click="generate"><IconPlayerPlay :size="24" />生成视频</ElButton>
        <div v-if="busy" class="video-progress" role="status" aria-live="polite"><ElProgress :percentage="progress" /><span>正在生成… {{progress}}%</span><ElButton @click="controller.abort()">取消</ElButton></div>
        <p v-if="status" class="file-tools-note" role="status">{{status}}</p>
        <p v-if="error" class="video-error" role="alert">{{error}}</p>
      </div>
    </div>
    <Transition name="file-tools-result"><div v-if="result" class="file-tools-output video-result"><h2>视频已生成</h2><video :src="result.url" controls playsinline preload="metadata" aria-label="生成的视频预览" /><div><span>{{result.name}} · {{result.size}} MB</span><a :href="result.url" :download="result.name"><IconDownload :size="18" />下载视频</a></div></div></Transition>
  </section>
</template>
