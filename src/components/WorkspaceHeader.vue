<script setup>
import { ref, reactive } from 'vue'
import { ElMessage, ElTooltip } from 'element-plus'
import AppDialog from './AppDialog.vue'
import PlayerConfig from './PlayerConfig.vue'
const playerConfig=ref(null)
function savePlayer(){if(playerConfig.value?.save())settingsOpen.value=false}
import { branding } from '../state/branding.js'
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-vue'
defineProps({menuCollapsed:Boolean})
defineEmits(['toggle-menu'])

const themes = [
  { id:'mono', name:'黑白之间', note:'纯黑背景 · 白色文字', color:'#ffffff', soft:'#000000', bg:'#000000', ink:'#ffffff', icon:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0v18M12 3a9 9 0 0 1 0 18Z' },
  { id:'red', name:'胭脂暖白', note:'深胭脂红 · 温润克制', color:'#b4233b', soft:'#f8e5e7', bg:'#faf6f4', ink:'#431c24', icon:'m12 3 8 7-8 11L4 10l8-7ZM4 10h16M8 6l4 15 4-15' },
  { id:'green', name:'薄荷庭院', note:'清新浅绿 · 专注日常', color:'#618a6c', soft:'#e2ece4', bg:'#f0f3f2', ink:'#293d32', icon:'M12 21V11m0 5C4 16 3 10 3 5c6 0 9 3 9 8 0-7 4-10 9-10 0 7-2 12-9 13' },
  { id:'pink', name:'草莓奶霜', note:'软萌粉色 · 一点甜意', color:'#b85f83', soft:'#f8e3ec', bg:'#fcf3f7', ink:'#563747', icon:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z' },
  { id:'blue', name:'晴空来信', note:'澄澈蓝色 · 安静有序', color:'#527fae', soft:'#dfebf8', bg:'#f1f5fb', ink:'#2c4058', icon:'M7 18h11a4 4 0 0 0 .5-8A6 6 0 0 0 7 8a5 5 0 0 0 0 10Z' },
  { id:'orange', name:'落日橘光', note:'温暖橙色 · 活力满格', color:'#b87535', soft:'#fae9d7', bg:'#fcf6ee', ink:'#55412f', icon:'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0' },
]
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
const selected = ref(read('workbench-theme','green'))
const themeOpen = ref(false), settingsOpen = ref(false)
const config = reactive({ baseUrl:'', apiKey:'' })
const settingsTab=ref('basic'), basic=reactive({name:'',logo:''}), basicError=ref(''), logoInput=ref(null)
const settingsDirection=ref('forward')
function selectSettings(value){if(value===settingsTab.value)return;settingsDirection.value=['basic','api','player'].indexOf(value)>['basic','api','player'].indexOf(settingsTab.value)?'forward':'back';settingsTab.value=value}
function uploadLogo(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;basicError.value='';if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024){basicError.value='请选择 2MB 以内的 PNG、JPG 或 WebP 图片';return}const reader=new FileReader();reader.onload=()=>{basic.logo=String(reader.result)};reader.onerror=()=>{basicError.value='图片读取失败'};reader.readAsDataURL(file)}
function saveBasic(){const name=basic.name.trim();if(!name){basicError.value='请填写工作台名称';return}try{localStorage.setItem('workbench-branding',JSON.stringify({name,logo:basic.logo}));Object.assign(branding,{name,logo:basic.logo});settingsOpen.value=false;ElMessage.success('基础配置已保存')}catch{basicError.value='保存失败，浏览器存储空间可能不足'}}
const configError = ref('')
function applyTheme(id) {
  const t = themes.find(t=>t.id===id) || themes.find(t=>t.id==='green')
  selected.value=t.id
  document.documentElement.dataset.theme=t.id
  const values = { '--theme-accent':t.color, '--theme-soft':t.soft, '--theme-bg':t.bg, '--theme-ink':t.ink,
    '--el-color-primary':t.color, '--el-color-primary-dark-2':t.ink, '--el-text-color-primary':t.ink,
    '--overview-ink':t.ink, '--overview-accent':t.color, '--overview-button':t.soft }
  for (const [key,value] of Object.entries(values)) document.documentElement.style.setProperty(key,value)
  for (const n of [3,5,7,8,9]) document.documentElement.style.setProperty(`--el-color-primary-light-${n}`,`color-mix(in srgb, ${t.color}, white ${n*10}%)`)
}
applyTheme(selected.value)
function choose(id) { try { localStorage.setItem('workbench-theme',JSON.stringify(id)); applyTheme(id) } catch { ElMessage.error('无法保存主题，请检查浏览器存储权限') } }
function openSettings() { Object.assign(config,{baseUrl:'',apiKey:''},read('workbench-openai',{})); Object.assign(basic,branding);settingsTab.value='basic';basicError.value='';configError.value=''; settingsOpen.value=true }
function saveConfig() {
  configError.value=''
  const baseUrl=config.baseUrl.trim().replace(/\/+$/,'')
  try { const url=new URL(baseUrl); if(!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error() }
  catch { configError.value='请输入有效的 HTTP / HTTPS 接口地址，不含查询参数或账号密码'; return }
  if(!config.apiKey.trim()) { configError.value='请填写 API Key'; return }
  try { localStorage.setItem('workbench-openai',JSON.stringify({baseUrl,apiKey:config.apiKey.trim()})); settingsOpen.value=false; ElMessage.success('接口配置已保存') }
  catch { configError.value='保存失败，请检查浏览器存储权限' }
}
</script>

<template>
  <div class="workspace-header" aria-label="工作台工具栏">
    <div class="header-leading"><ElTooltip :content="menuCollapsed?'展开菜单':'收起菜单'" placement="bottom" :show-after="200"><button class="header-icon-button menu-toggle-icon" :aria-label="menuCollapsed?'展开菜单':'收起菜单'" :aria-expanded="!menuCollapsed" aria-controls="workspace-menu" @click="$emit('toggle-menu')"><component :is="menuCollapsed?IconLayoutSidebarLeftExpand:IconLayoutSidebarLeftCollapse" :size="19"/></button></ElTooltip><span class="header-caption"><span class="header-spark">✦</span> 给日常一点灵感</span></div>
    <div class="workspace-header-actions">
      <ElTooltip content="切换主题" placement="bottom" :show-after="200" :disabled="themeOpen"><button class="header-icon-button" aria-label="切换主题" @click="themeOpen=true"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="themes.find(t=>t.id===selected).icon" /></svg></button></ElTooltip>
      <ElTooltip content="设置" placement="bottom" :show-after="200" :disabled="settingsOpen"><button class="header-icon-button" aria-label="设置" @click="openSettings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></svg></button></ElTooltip>
    </div>
  </div>
  <AppDialog v-model="themeOpen" title="让工作台，成为你的颜色" description="六套配色，即点即换。下次打开依然保留。" :width="620">
    <div class="theme-options" role="group" aria-label="主题配色">
      <AppCard tag="button" v-for="t in themes" :key="t.id" class="theme-option" :class="{selected:selected===t.id}" :aria-pressed="selected===t.id" :style="{'--preview-accent':t.color,'--preview-soft':t.soft,'--preview-bg':t.bg}" @click="choose(t.id)">
        <div class="theme-preview" aria-hidden="true"><div class="preview-sidebar"><svg viewBox="0 0 24 24"><path :d="t.icon"/></svg><i/><i/><i/></div><div class="preview-content"><span/><div><i/><i/><i/></div><b/></div><span class="theme-check" v-if="selected===t.id">✓</span></div>
        <div class="theme-option-label"><strong>{{t.name}}</strong><span class="theme-swatches" aria-hidden="true"><i :style="{background:t.color}"/><i :style="{background:t.soft}"/><i :style="{background:t.bg}"/></span></div><small>{{t.note}}</small><span class="theme-selection">{{selected===t.id?'正在使用':'选择此主题'}}</span>
      </AppCard>
    </div>
    <template #footer><el-button type="primary" @click="themeOpen=false">完成</el-button></template>
  </AppDialog>
  <AppDialog v-model="settingsOpen" title="设置" :width="620">
    <div class="settings-layout"><nav class="settings-menu" aria-label="设置分类"><el-menu :default-active="settingsTab" @select="selectSettings"><el-menu-item index="basic">基础配置</el-menu-item><el-menu-item index="api">API 配置</el-menu-item><el-menu-item index="player">播放器配置</el-menu-item></el-menu></nav>
    <Transition :name="'settings-'+settingsDirection" mode="out-in"><section :key="settingsTab" class="settings-content">
    <el-form v-if="settingsTab==='basic'" label-position="top" @submit.prevent="saveBasic">
      <el-form-item label="工作台 Logo"><div class="settings-logo-row"><div class="settings-logo-preview"><img v-if="basic.logo" :src="basic.logo" alt="Logo 预览"/><span v-else>{{basic.name.trim().slice(0,1)||'工'}}</span></div><div><el-button @click="logoInput.click()">上传图片</el-button><el-button v-if="basic.logo" text @click="basic.logo=''">恢复默认</el-button><p class="config-hint">PNG、JPG、WebP，最大 2MB</p></div><input ref="logoInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="uploadLogo"/></div></el-form-item>
      <el-form-item label="工作台名称"><el-input v-model="basic.name" maxlength="16" show-word-limit placeholder="输入工作台名称"/></el-form-item><el-alert v-if="basicError" :title="basicError" type="error" :closable="false" show-icon/>
    </el-form>
    <PlayerConfig v-else-if="settingsTab==='player'" ref="playerConfig"/><el-form v-else label-position="top" @submit.prevent="saveConfig">
      
      <el-form-item label="接口地址（Base URL）"><el-input v-model="config.baseUrl" placeholder="https://your-provider.com/v1" autocomplete="off"/><p class="config-hint">填写服务商提供的基础地址，通常以 /v1 结尾。</p></el-form-item>
      <el-form-item label="API Key"><el-input v-model="config.apiKey" type="password" show-password placeholder="输入你的 API Key" autocomplete="new-password"/></el-form-item>
      <p class="config-storage-note">配置仅保存在当前浏览器；API Key 未加密，请在可信设备上使用。此处仅保存配置，不发起接口请求。</p>
      <el-alert v-if="configError" :title="configError" type="error" :closable="false" show-icon/>
    </el-form>
    </section></Transition></div>
    <template #footer><el-button @click="settingsOpen=false">取消</el-button><el-button type="primary" @click="settingsTab==='basic'?saveBasic():settingsTab==='player'?savePlayer():saveConfig()">保存配置</el-button></template>
  </AppDialog>
</template>
