<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import NeteaseLibrary from '../components/NeteaseLibrary.vue'
import { ElMessage, ElMessageBox, ElDropdown, ElDropdownMenu, ElDropdownItem, ElSwitch, ElTooltip } from 'element-plus'
import { IconPlus, IconFolderPlus, IconPlayerPlayFilled, IconPlayerPauseFilled, IconHeart, IconMusic, IconSearch, IconDots, IconDisc, IconHistory, IconArrowUpRight, IconHeadphones, IconSettings, IconWorld } from '@tabler/icons-vue'
import { music, currentTrack, playTrack, togglePlay, importMusic, cancelImport, removeTrack, likeTrack, saveMusic, formatTime } from '../state/music.js'
const filter = ref('netease'), search = ref(''), sort = ref('added')
const playlist = computed(() => music.playlists.find(p => p.id === filter.value))
const tracks = computed(() => {
  let result = music.tracks.filter(t => (filter.value !== 'liked' || t.liked) && (filter.value !== 'recent' || t.lastPlayed) && (!playlist.value || playlist.value.tracks.includes(t.id)) && `${t.title} ${t.artist} ${t.album || ''}`.toLowerCase().includes(search.value.trim().toLowerCase()))
  if (filter.value === 'recent') result = result.toSorted((a,b) => b.lastPlayed-a.lastPlayed)
  else if (sort.value === 'title') result = result.toSorted((a,b) => a.title.localeCompare(b.title, 'zh-CN'))
  else if (sort.value === 'artist') result = result.toSorted((a,b) => a.artist.localeCompare(b.artist, 'zh-CN'))
  return result
})
const title = computed(() => playlist.value?.name || ({all:'全部音乐',recent:'最近播放',liked:'我喜欢的'}[filter.value]))
const totalTime = computed(() => { const minutes = Math.round(music.tracks.reduce((sum,t) => sum + t.duration,0)/60); return minutes >= 60 ? `${Math.floor(minutes/60)} 小时 ${minutes%60} 分钟` : `${minutes} 分钟` })
const libraryItems = computed(() => [
  {id:'netease',name:'在线音乐',icon:IconWorld,count:null},
  {id:'all',name:'全部音乐',icon:IconDisc,count:music.tracks.length},
  {id:'recent',name:'最近播放',icon:IconHistory,count:music.tracks.filter(t=>t.lastPlayed).length},
  {id:'liked',name:'我喜欢的',icon:IconHeart,count:music.tracks.filter(t=>t.liked).length},
])
async function editPlaylist(existing) {
  try {
    const { value } = await ElMessageBox.prompt('给歌单起个名字', existing ? '重命名歌单' : '新建歌单', { inputValue: existing?.name || '', inputValidator: value => !!value?.trim() && value.trim().length <= 40 || '请输入 1–40 字歌单名称', confirmButtonText:'保存', cancelButtonText:'取消' })
    if (existing) existing.name = value.trim()
    else { const p = { id:crypto.randomUUID(), name:value.trim(), tracks:[] }; music.playlists.push(p); filter.value=p.id }
    await saveMusic()
  } catch {}
}
async function deletePlaylist() {
  try { await ElMessageBox.confirm('仅删除歌单，保留所有歌曲。','删除歌单',{confirmButtonText:'删除',cancelButtonText:'取消'}); music.playlists=music.playlists.filter(p=>p.id!==filter.value);filter.value='all';await saveMusic() } catch {}
}
async function trackAction(command, track) {
  if(command==='source') return window.open(track.sourceUrl,'_blank','noopener,noreferrer')
  if(command==='locate') return importMusic(false,track.id)
  if(command==='remove-from-playlist') { playlist.value.tracks=playlist.value.tracks.filter(x=>x!==track.id);return saveMusic() }
  if(command==='remove') {
    try { await ElMessageBox.confirm(`从曲库移除「${track.title}」？不会删除源文件。`,'移除歌曲',{confirmButtonText:'移除',cancelButtonText:'取消'});await removeTrack(track.id) } catch {}
    return
  }
  const target = music.playlists.find(p=>p.id===command)
  if(target && !target.tracks.includes(track.id)){target.tracks.push(track.id);await saveMusic();ElMessage.success(`已加入「${target.name}」`)}
}
function playList(track = tracks.value[0]) { if(track) playTrack(track.id,tracks.value.map(t=>t.id)) }
const rowClass = ({row}) => row.id === music.current ? 'music-current-row' : ''
function handlePlaybackKey(event) {
  if(event.code!=='Space'||event.repeat||event.isComposing||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey)return
  if(event.target instanceof Element&&event.target.closest('input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="slider"],[role="combobox"],[role="textbox"]'))return
  if(document.querySelector('.el-overlay:not([style*="display: none"])'))return
  event.preventDefault()
  togglePlay()
}
onMounted(()=>window.addEventListener('keydown',handlePlaybackKey))
onBeforeUnmount(()=>window.removeEventListener('keydown',handlePlaybackKey))
</script>

<template>
  <section class="music-page">

    <section class="music-hero" aria-label="当前音乐">
      <div class="music-hero-art" :class="{'has-cover':currentTrack?.cover}"><img v-if="currentTrack?.cover" :src="currentTrack.cover" alt="当前歌曲封面"/><div v-else class="music-record" aria-hidden="true"><div class="music-record-label"><IconMusic :size="27"/></div></div></div>
      <div class="music-hero-copy"><span class="music-eyebrow"><span class="music-live-dot" :class="{'is-playing':music.playing}"></span>{{music.loading?'正在加载音频…':currentTrack ? music.playing?'正在播放':'已暂停' : '尚未播放'}}</span><h2>{{currentTrack?.title || '选择歌曲开始播放'}}</h2><p>{{currentTrack ? [currentTrack.artist,currentTrack.preview?'试听 · '+currentTrack.album:(currentTrack.album || (currentTrack.provider==='netease'?'网易云在线':''))].filter(Boolean).join(' · ') : '从在线音乐选择歌曲，或导入本地音频'}}</p><div class="music-hero-actions"><el-button type="primary" round :disabled="!music.tracks.length" @click="currentTrack?togglePlay():playList()"><component :is="music.playing?IconPlayerPauseFilled:IconPlayerPlayFilled" :size="17"/>{{music.playing?'暂停播放':currentTrack?'继续播放':'开始播放'}}</el-button><el-button v-if="currentTrack" text :aria-label="currentTrack.liked?'取消喜欢当前歌曲':'喜欢当前歌曲'" :aria-pressed="currentTrack.liked" @click="likeTrack(currentTrack)"><IconHeart :size="19" :fill="currentTrack.liked?'currentColor':'none'"/></el-button><el-button v-if="currentTrack&&!music.mini" text @click="music.mini=true">展开播放器<IconArrowUpRight :size="17"/></el-button></div></div>
      <div class="music-collection-summary"><IconHeadphones :size="23"/><strong>{{music.tracks.length}}<small>首收藏</small></strong><span>{{totalTime}}</span></div>
    </section>
    <el-alert v-if="music.busy||music.progress" class="music-import-status" :type="music.busy?'info':'success'" :closable="!music.busy" show-icon @close="music.progress=''"><template #title>{{music.progress || '等待选择音乐…'}}</template><el-button v-if="music.busy" link type="primary" @click="cancelImport">取消导入</el-button></el-alert>
    <div class="music-library-layout">
      <AppCard tag="aside" class="music-library-nav" aria-label="音乐分类">

        <p class="music-nav-label">资料库</p><el-menu :default-active="filter" class="music-local-menu" @select="filter=$event"><el-menu-item v-for="item in libraryItems" :key="item.id" :index="item.id"><component :is="item.icon" :size="18"/><span>{{item.name}}</span><small v-if="item.count!==null">{{item.count}}</small></el-menu-item></el-menu>
        <div class="music-playlist-heading"><p class="music-nav-label">我的歌单</p><ElTooltip content="新建歌单" placement="top"><el-button text circle aria-label="新建歌单" @click="editPlaylist()"><IconPlus :size="17"/></el-button></ElTooltip></div>
        <el-menu :default-active="filter" class="music-local-menu music-playlist-menu" @select="filter=$event"><el-menu-item v-for="p in music.playlists" :key="p.id" :index="p.id"><span class="music-playlist-icon"><IconMusic :size="16"/></span><span class="music-playlist-name">{{p.name}}</span><small>{{p.tracks.length}}</small></el-menu-item></el-menu>
        <div v-if="!music.playlists.length" class="music-nav-empty"><p>暂无歌单</p><el-button link type="primary" @click="editPlaylist()">新建歌单<IconPlus :size="14"/></el-button></div>
        <div class="music-preferences"><IconSettings :size="16"/><span>记住播放进度</span><ElSwitch v-model="music.remember" size="small" aria-label="记住播放进度" @change="saveMusic"/></div>
        <div class="music-import-actions music-sidebar-import"><el-button :disabled="music.busy" @click="importMusic(true)"><IconFolderPlus :size="17"/>导入文件夹</el-button><el-button type="primary" :loading="music.busy" @click="importMusic()"><IconPlus v-if="!music.busy" :size="17"/>导入音乐</el-button></div>
      </AppCard>
      <NeteaseLibrary v-if="filter==='netease'"/>
      <section v-else class="music-library" :aria-label="title">
        <div class="music-list-heading"><div class="music-list-title"><h2>{{title}}</h2><el-tag effect="plain" type="info" round>{{tracks.length}} 首</el-tag><ElDropdown v-if="playlist" trigger="click" popper-class="music-popper" @command="$event==='rename'?editPlaylist(playlist):deletePlaylist()"><el-button text circle aria-label="歌单操作"><IconDots :size="20"/></el-button><template #dropdown><ElDropdownMenu><ElDropdownItem command="rename">重命名歌单</ElDropdownItem><ElDropdownItem command="delete" divided>删除歌单</ElDropdownItem></ElDropdownMenu></template></ElDropdown></div><el-input v-model="search" class="music-search" clearable placeholder="搜索歌曲、艺人、专辑" aria-label="搜索音乐"><template #prefix><IconSearch :size="17"/></template></el-input></div>
        <div class="music-list-toolbar"><el-button type="primary" plain :disabled="!tracks.length" @click="playList()"><IconPlayerPlayFilled :size="15"/>播放全部</el-button><div class="music-list-options"><el-select v-model="sort" aria-label="歌曲排序" class="music-sort" size="small" popper-class="music-popper"><el-option label="导入顺序" value="added"/><el-option label="歌曲名称" value="title"/><el-option label="艺人名称" value="artist"/></el-select></div></div>
        <el-table v-if="tracks.length" :data="tracks" row-key="id" :row-class-name="rowClass" class="music-table" @row-dblclick="playList">
          <el-table-column label="#" width="52" align="center"><template #default="{row,$index}"><el-button text circle :aria-label="'播放 '+row.title" class="music-row-play" @click="playList(row)"><IconPlayerPlayFilled v-if="music.current===row.id" :size="14"/><span v-else>{{$index+1}}</span></el-button></template></el-table-column>
          <el-table-column label="歌曲" min-width="210"><template #default="{row}"><el-button text class="music-track-info" :aria-label="'播放 '+row.title" @click="playList(row)"><span class="music-art" :style="{'--art-hue':row.title.length*31}"><img v-if="row.cover" :src="row.cover" alt=""/><IconMusic v-else :size="20"/></span><span class="music-track-copy"><strong>{{row.title}}</strong><small>{{row.artist}}</small></span></el-button></template></el-table-column>
          <el-table-column label="专辑" min-width="130" class-name="music-album-column" show-overflow-tooltip><template #default="{row}"><span class="music-album">{{row.album||'—'}}</span></template></el-table-column>
          <el-table-column label="时长" width="75"><template #default="{row}"><span class="music-track-time">{{formatTime(row.duration)}}</span></template></el-table-column>
          <el-table-column label="" width="92" align="right"><template #default="{row}"><div class="music-track-actions"><ElTooltip :content="row.liked?'取消喜欢':'喜欢'" placement="top"><el-button text circle :aria-label="row.liked?'取消喜欢 '+row.title:'喜欢 '+row.title" :aria-pressed="!!row.liked" :class="{'is-liked':row.liked}" @click.stop="likeTrack(row)"><IconHeart :size="18" :fill="row.liked?'currentColor':'none'"/></el-button></ElTooltip><ElDropdown trigger="click" popper-class="music-popper" @command="trackAction($event,row)"><el-button text circle :aria-label="row.title+' 的更多操作'"><IconDots :size="19"/></el-button><template #dropdown><ElDropdownMenu><ElDropdownItem v-for="p in music.playlists" :key="p.id" :command="p.id" :disabled="p.tracks.includes(row.id)">加入 {{p.name}}{{p.tracks.includes(row.id)?'（已添加）':''}}</ElDropdownItem><ElDropdownItem v-if="!music.playlists.length" disabled>新建歌单后可添加歌曲</ElDropdownItem><ElDropdownItem v-if="row.provider==='netease'" command="source" divided>在网易云查看</ElDropdownItem><ElDropdownItem v-else command="locate" divided>重新定位文件</ElDropdownItem><ElDropdownItem v-if="playlist" command="remove-from-playlist">从歌单移除</ElDropdownItem><ElDropdownItem command="remove" divided>从曲库移除</ElDropdownItem></ElDropdownMenu></template></ElDropdown></div></template></el-table-column>
        </el-table>
        <el-empty v-else class="music-empty" :description="search?'没有匹配的歌曲':playlist?'歌单暂无歌曲':filter==='liked'?'暂无喜欢的歌曲':filter==='recent'?'播放记录将出现在这里':'音乐库暂无歌曲'"><template #image><div class="music-empty-art"><IconMusic :size="38"/></div></template><p>{{search?'尝试其他歌曲名或艺人':playlist?'通过歌曲菜单加入此歌单':'导入本地音乐或收藏在线歌曲'}}</p><el-button v-if="!music.tracks.length" type="primary" :loading="music.busy" @click="importMusic()"><IconPlus :size="16"/>导入第一首音乐</el-button><el-button v-else-if="search" @click="search=''">清空搜索</el-button><el-button v-else-if="filter!=='all'" @click="filter='all'">浏览全部音乐</el-button></el-empty>
        <footer class="music-library-footer"><span><IconHeadphones :size="14"/>{{music.tracks.length}} 首音乐 · {{totalTime}}</span><ElTooltip content="曲库与歌单保存在当前浏览器；在线歌曲仅保存信息，播放需要联网。本地文件优先引用授权文件；不支持授权的浏览器会保存副本。" placement="top" :show-after="150"><el-button link size="small" aria-label="查看音乐存储说明">存储说明</el-button></ElTooltip></footer>
      </section>
    </div>
  </section>
</template>
