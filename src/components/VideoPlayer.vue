<script setup>
import { ref, onUnmounted } from 'vue'
import SelectBox from './SelectBox.vue'
import { IconPlayerPlay, IconPlayerPause, IconVolume, IconVolumeOff, IconMaximize } from '@tabler/icons-vue'
defineProps({ src: { type: String, required: true } })
const video=ref(null),container=ref(null),playing=ref(false),current=ref(0),duration=ref(0),muted=ref(false),error=ref(false),controlsVisible=ref(true),speed=ref(1),menuOpen=ref(false)
let hideTimer
function showControls(){controlsVisible.value=true;clearTimeout(hideTimer);if(playing.value)hideTimer=setTimeout(()=>{if(!menuOpen.value&&!container.value?.matches(':hover')&&!container.value?.querySelector(':focus-visible'))controlsVisible.value=false},2500)}
function onPlay(){playing.value=true;showControls()}
function onPause(){playing.value=false;clearTimeout(hideTimer);controlsVisible.value=true}
function hideControls(event){clearTimeout(hideTimer);if(event?.relatedTarget instanceof Element && (container.value?.contains(event.relatedTarget)||event.relatedTarget.closest('.player-speed-options')))return;if(menuOpen.value||container.value?.querySelector(':focus-visible'))return;controlsVisible.value=false}
function speedMenuChanged(open){menuOpen.value=open;clearTimeout(hideTimer);if(open)controlsVisible.value=true;else controlsVisible.value=!!container.value?.matches(':hover')||!!container.value?.querySelector(':focus-visible')}
onUnmounted(()=>clearTimeout(hideTimer))
const format=value=>{const n=Number.isFinite(value)?Math.floor(value):0;return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`}
async function toggle(){if(video.value.paused){try{await video.value.play()}catch{error.value=true}}else video.value.pause()}
function seek(value){current.value=value;video.value.currentTime=value}
function toggleMute(){video.value.muted=!video.value.muted;muted.value=video.value.muted}
function setSpeed(value){speed.value=value;video.value.playbackRate=value}
function fullscreen(){if(document.fullscreenElement)document.exitFullscreen();else container.value.requestFullscreen?.()}
</script>
<template>
  <div ref="container" class="custom-player" :class="{'controls-hidden':!controlsVisible}" @pointerenter="showControls" @pointerleave="hideControls" @pointermove="showControls" @pointerdown="showControls" @focusin="showControls" @focusout="hideControls">
    <video ref="video" :src="src" playsinline preload="metadata" @click="toggle" @play="onPlay" @pause="onPause" @timeupdate="current=$event.target.currentTime" @loadedmetadata="duration=$event.target.duration" @error="error=true"></video>
    <el-alert v-if="error" class="player-error" title="视频加载失败，请重新解析后重试" type="error" :closable="false" />
    <div class="player-controls"><el-button text class="player-button" :aria-label="playing?'暂停':'播放'" @click="toggle"><component :is="playing?IconPlayerPause:IconPlayerPlay" :size="18" :stroke="1.7" /></el-button><span class="player-time">{{format(current)}}</span><el-slider class="player-slider" :model-value="current" :min="0" :max="duration||1" :step="0.1" :disabled="!duration" :show-tooltip="false" aria-label="播放进度" @input="seek" /><span class="player-time">{{format(duration)}}</span><SelectBox :model-value="speed" :options="[0.5,0.75,1,1.25,1.5,2]" label="播放速度" @update:model-value="setSpeed" @visible-change="speedMenuChanged" /><el-button text class="player-button" :aria-label="muted?'取消静音':'静音'" @click="toggleMute"><component :is="muted?IconVolumeOff:IconVolume" :size="18" :stroke="1.7" /></el-button><el-button text class="player-button" aria-label="切换全屏" @click="fullscreen"><IconMaximize :size="18" :stroke="1.7" /></el-button></div>
  </div>
</template>
<style src="../css/player-theme.css"></style>
