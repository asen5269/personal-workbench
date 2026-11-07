<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import {useRouter} from 'vue-router'
import MusicTrackDetails from './MusicTrackDetails.vue'
import { ElPopover, ElTooltip, ElDropdown, ElDropdownMenu, ElDropdownItem, ElSelect, ElOption } from 'element-plus'
import { music, currentTrack, togglePlay, step, seek, setVolume, muteMusic, stopMusic, formatTime, playTrack, likeTrack, findMusicTrack, saveMusic, setMusicQuality } from '../state/music.js'
import { IconPlayerPlayFilled, IconPlayerPauseFilled, IconPlayerSkipBack, IconPlayerSkipForward, IconVolume, IconVolumeOff, IconX, IconList, IconPlayerStop, IconMusic, IconHeart, IconRepeat, IconRepeatOnce, IconArrowsShuffle, IconArrowRight } from '@tabler/icons-vue'
const modes=[{id:'order',label:'顺序播放',icon:IconArrowRight},{id:'list',label:'列表循环',icon:IconRepeat},{id:'one',label:'单曲循环',icon:IconRepeatOnce},{id:'shuffle',label:'随机播放',icon:IconArrowsShuffle}]
const activeMode=computed(()=>modes.find(mode=>mode.id===music.mode)||modes[1])
function changeMode(value){music.mode=value;saveMusic()}
const detailsOpen=ref(false)
const expanded = ref(false), dragging = ref(false), position = ref(0)
const queue = computed(() => (music.queue.length ? music.queue : music.tracks.map(t => t.id)).map(findMusicTrack).filter(Boolean))
const sliderTime = computed(() => dragging.value ? position.value : Math.min(music.time,music.duration || 0))
function preview(value) { dragging.value=true;position.value=Number(value) }
function commit(value) { seek(value);dragging.value=false }
const router=useRouter()
const floating=ref({side:'right',ratio:.5}),floatingDrag=ref(false),floatingOffset=ref({x:0,y:0}),viewport=ref({width:innerWidth,height:innerHeight})
let pointer,ignoreClick=false
const floatingStyle=computed(()=>({left:'0',right:'auto',top:'0',transform:`translate3d(${floatingDrag.value?floatingOffset.value.x:floating.value.side==='left'?0:viewport.value.width-36}px,${floatingDrag.value?floatingOffset.value.y:Math.max(0,(viewport.value.height-96)*floating.value.ratio)}px,0)`}))
function resizeFloating(){viewport.value={width:innerWidth,height:innerHeight}}
onMounted(()=>{try{const saved=JSON.parse(localStorage.getItem('music-floating-position'));if(saved&&['left','right'].includes(saved.side)&&Number.isFinite(saved.ratio))floating.value={side:saved.side,ratio:Math.max(0,Math.min(1,saved.ratio))}}catch{}window.addEventListener('resize',resizeFloating)})
onBeforeUnmount(()=>window.removeEventListener('resize',resizeFloating))
function startFloating(event){
  if(event.button!==0)return
  const rect=event.currentTarget.getBoundingClientRect()
  pointer={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,width:rect.width,height:rect.height}
  ignoreClick=false
  event.currentTarget.setPointerCapture(event.pointerId)
}
function moveFloating(event){
  if(!pointer||pointer.id!==event.pointerId)return
  if(!floatingDrag.value&&Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)<5)return
  floatingDrag.value=true;ignoreClick=true
  floatingOffset.value={x:Math.max(0,Math.min(innerWidth-pointer.width,pointer.left+event.clientX-pointer.x)),y:Math.max(0,Math.min(innerHeight-pointer.height,pointer.top+event.clientY-pointer.y))}
}
function endFloating(event){
  if(!pointer||pointer.id!==event.pointerId)return
  if(floatingDrag.value){floating.value={side:floatingOffset.value.x+pointer.width/2<innerWidth/2?'left':'right',ratio:floatingOffset.value.y/Math.max(1,innerHeight-pointer.height)};try{localStorage.setItem('music-floating-position',JSON.stringify(floating.value))}catch{}}
  floatingDrag.value=false;pointer=null
}
function openFloating(event){if(ignoreClick){event.preventDefault();ignoreClick=false;return}if(currentTrack.value)music.mini=true;else router.push('/music')}
</script>
<template>
  <Transition name="music-reveal">
    <section v-if="currentTrack && music.mini" class="music-dock" aria-label="音乐播放控制">
      <div class="music-dock-main">
        <el-button text class="music-dock-track" aria-label="打开音乐页面" @click="$router.push('/music')"><span class="music-art" :style="{'--art-hue':currentTrack.title.length*31}"><img v-if="currentTrack.cover" :src="currentTrack.cover" alt=""/><IconMusic v-else :size="20"/></span><span class="music-track-copy"><strong>{{currentTrack.title}}</strong><small>{{currentTrack.artist}}</small></span></el-button>
        <ElTooltip :content="currentTrack.liked?'取消喜欢':'喜欢'" placement="top"><el-button text circle class="music-dock-like" :aria-label="currentTrack.liked?'取消喜欢当前歌曲':'喜欢当前歌曲'" :aria-pressed="!!currentTrack.liked" @click="likeTrack(currentTrack)"><IconHeart :size="18" :fill="currentTrack.liked?'currentColor':'none'"/></el-button></ElTooltip>
        <div class="music-transport"><el-button text circle aria-label="上一首" @click="step(-1)"><IconPlayerSkipBack :size="19"/></el-button><el-button type="primary" circle class="music-play" :aria-label="music.playing?'暂停':'播放'" @click="togglePlay"><component :is="music.playing?IconPlayerPauseFilled:IconPlayerPlayFilled" :size="20"/></el-button><el-button text circle aria-label="下一首" @click="step(1)"><IconPlayerSkipForward :size="19"/></el-button><ElTooltip content="停止播放" placement="top"><el-button text circle class="music-stop" aria-label="停止" @click="stopMusic"><IconPlayerStop :size="17"/></el-button></ElTooltip></div>
        <ElDropdown trigger="click" placement="top" popper-class="music-popper" @command="changeMode"><el-button text circle :aria-label="'播放模式：'+activeMode.label"><component :is="activeMode.icon" :size="18"/></el-button><template #dropdown><ElDropdownMenu><ElDropdownItem v-for="mode in modes" :key="mode.id" :command="mode.id" :class="{'music-mode-selected':music.mode===mode.id}"><component :is="mode.icon" :size="16"/><span>{{mode.label}}</span><span v-if="music.mode===mode.id" aria-label="当前模式">✓</span></ElDropdownItem></ElDropdownMenu></template></ElDropdown>
        <div class="music-seek"><span>{{formatTime(sliderTime)}}</span><el-slider :model-value="sliderTime" :min="0" :max="music.duration||1" :step=".1" :disabled="!music.duration" :format-tooltip="formatTime" aria-label="播放进度" @input="preview" @change="commit"/><span>{{formatTime(music.duration)}}</span></div>
        <ElSelect v-if="currentTrack.provider==='netease'" :model-value="music.quality" class="music-dock-quality" size="small" aria-label="播放音质" placement="top" popper-class="music-popper" @change="setMusicQuality"><ElOption label="标准音质" value="standard"/><ElOption label="极高音质" value="exhigh"/><ElOption label="无损音质" value="lossless"/><ElOption label="Hi-Res" value="hires"/></ElSelect>
        <ElPopover trigger="hover" placement="top" :width="56" :show-after="120" :hide-after="200" popper-class="music-volume-popper music-popper"><template #reference><el-button text circle class="music-volume-button" :aria-label="music.muted?'取消静音，调节音量':'静音，调节音量'" @click="muteMusic"><component :is="music.muted||!music.volume?IconVolumeOff:IconVolume" :size="19"/></el-button></template><div class="music-volume-vertical"><span>{{Math.round((music.muted?0:music.volume)*100)}}%</span><el-slider vertical height="112px" :model-value="music.muted?0:music.volume" :min="0" :max="1" :step=".01" :format-tooltip="value=>Math.round(value*100)+'%'" aria-label="音量" @input="setVolume"/></div></ElPopover>
        <ElTooltip v-if="currentTrack.provider==='netease'" content="歌词与评论" placement="top" :show-after="150"><el-button text circle aria-label="歌词与评论" @click="detailsOpen=true"><IconMusic :size="18"/></el-button></ElTooltip>
        <ElPopover v-model:visible="expanded" trigger="click" placement="top-end" :width="320" popper-class="music-queue-popper music-popper" :teleported="true"><template #reference><el-button text circle aria-label="当前播放列表" :aria-expanded="expanded"><IconList :size="20"/></el-button></template><div class="music-queue"><div class="music-queue-head"><strong>当前播放列表 <small>{{queue.length}} 首</small></strong><el-button text circle aria-label="关闭播放列表" @click="expanded=false"><IconX :size="17"/></el-button></div><div class="music-queue-list"><el-button v-for="track in queue" :key="track.id" text :class="{selected:track.id===music.current}" @click="playTrack(track.id)"><span>{{track.title}}</span><small>{{formatTime(track.duration)}}</small></el-button></div></div></ElPopover>
        <ElTooltip content="收起，继续播放" placement="top"><el-button text circle aria-label="收起迷你播放器，继续播放" @click="music.mini=false"><IconX :size="17"/></el-button></ElTooltip>
      </div>
    </section>
  </Transition>
  <Teleport to="body">
  <Transition name="music-reveal">
    <el-button v-if="!currentTrack||!music.mini" class="music-floating-toggle" :class="{'is-dragging':floatingDrag,'is-left':floating.side==='left'}" :style="floatingStyle" @pointerdown="startFloating" @pointermove="moveFloating" @pointerup="endFloating" @pointercancel="endFloating" @lostpointercapture="endFloating" :aria-label="currentTrack?'展开音乐播放器':'打开音乐页面'" :aria-expanded="false" :title="currentTrack?.title||'音乐播放器'" @click="openFloating"><IconMusic :size="20"/><span>播放器</span></el-button>
  </Transition>
  </Teleport>
  <MusicTrackDetails v-model="detailsOpen"/>
</template>
