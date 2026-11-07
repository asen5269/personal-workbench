<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import MusicLoadMore from './MusicLoadMore.vue'
import NeteaseLogin from './NeteaseLogin.vue'
import NeteaseExplorer from './NeteaseExplorer.vue'
import MusicTrackDetails from './MusicTrackDetails.vue'
import CloudPlaylistPicker from './CloudPlaylistPicker.vue'
import {neteaseAction} from '../utils/netease-client.js'
import { ElDropdown, ElDropdownMenu, ElDropdownItem, ElSkeleton, ElMessage, ElTabs, ElTabPane } from 'element-plus'
import { IconSearch, IconPlayerPlayFilled, IconMusic, IconPlus, IconExternalLink, IconRefresh } from '@tabler/icons-vue'
import { music, playOnlineTrack, collectOnlineTrack, formatTime, saveMusic } from '../state/music.js'
const tracks=ref([]), input=ref(''), query=ref(''), page=ref(1), hasMore=ref(false), loading=ref(false), error=ref(''), collecting=ref('')
const explorer=ref(null)
const accountMode=ref('anonymous'),view=ref('songs'),detailsOpen=ref(false),cloudTarget=ref(null),cloudPicker=ref(false)
const views=[['songs','歌曲搜索'],['recommend','精选'],['playlists','歌单'],['charts','榜单'],['artists','歌手'],['albums','专辑'],['daily','每日推荐'],['fm','私人 FM'],['mine','我的歌单'],['liked','云端喜欢'],['cloud','云盘'],['history','最近播放'],['mvs','MV'],['podcasts','播客'],['catalog','接口目录']]
let controller, requestId=0
const playable=computed(()=>tracks.value.filter(t=>t.playable))
const collected=id=>music.tracks.some(t=>t.id===id)
async function load(nextPage=1, nextQuery=query.value) {
  controller?.abort();controller=new AbortController()
  const token=++requestId
  loading.value=true;error.value=''
  try {
    const params=new URLSearchParams({q:nextQuery.trim(),offset:String((nextPage-1)*20)})
    const response=await fetch(`/api/music/netease/tracks?${params}`,{signal:controller.signal})
    const data=await response.json()
    if(!response.ok) throw Error(data.error || '网易云 加载失败')
    if(token!==requestId) return
    const previousCount=tracks.value.length
    accountMode.value=data.accountMode;tracks.value=nextPage>1?[...tracks.value,...data.tracks.filter(t=>!tracks.value.some(old=>old.id===t.id))]:data.tracks;hasMore.value=!!data.hasMore&&data.tracks.length>0&&(nextPage===1||tracks.value.length>previousCount);page.value=nextPage;query.value=nextQuery.trim()
  } catch(e) { if(e.name!=='AbortError'&&token===requestId) error.value=e.message }
  finally {if(token===requestId)loading.value=false}
}
function accountChanged(mode){if(accountMode.value!==mode){accountMode.value=mode;if(view.value==='songs')load(1)}}
async function onlineCommand(command,track){if(command==='cloud-add'){cloudTarget.value=track;cloudPicker.value=true;return}if(command==='cloud-like'){try{await neteaseAction('like',{id:track.providerId,like:true});ElMessage.success('已加入网易云喜欢')}catch(e){ElMessage.error(e.message)}return}collect(track,command==='collect'?'':command)}
function search(){ load(1,input.value) }
function play(track=playable.value[0]) { if(track?.playable)playOnlineTrack(track,playable.value) }
async function collect(track,playlistId) {
  collecting.value=track.id
  try {
    await collectOnlineTrack(track)
    if(playlistId){const playlist=music.playlists.find(p=>p.id===playlistId);if(playlist&&!playlist.tracks.includes(track.id)){playlist.tracks.push(track.id);await saveMusic()}}
    ElMessage.success(playlistId?'已加入歌单':'已加入音乐库')
  } catch(e){ElMessage.error(e.message)} finally {collecting.value=''}
}
onMounted(()=>load())
onBeforeUnmount(()=>{++requestId;controller?.abort()})
</script>
<template>
  <section class="music-library online-library" aria-label="网易云在线音乐">
    <div class="music-list-heading"><form class="online-search music-header-search" @submit.prevent="view='songs';search()"><el-input v-model="input" clearable maxlength="120" placeholder="搜索歌曲或艺人" aria-label="搜索 网易云歌曲"><template #prefix><IconSearch :size="17"/></template></el-input><el-button type="primary" native-type="submit" :loading="loading">搜索</el-button></form><div v-if="view==='songs'||explorer?.isTracks" class="music-header-play"><el-button type="primary" plain :disabled="view==='songs'?loading||!playable.length:!explorer?.canPlay" @click="view==='songs'?play():explorer?.play()"><IconPlayerPlayFilled :size="15"/>播放列表</el-button></div><div class="netease-header-actions"><NeteaseLogin @changed="accountChanged"/><el-button text circle aria-label="刷新当前列表" :disabled="loading" @click="view==='songs'?load(1):explorer?.refresh()"><IconRefresh :size="18"/></el-button></div></div>
    <ElTabs v-model="view" class="music-service-tabs"><ElTabPane v-for="item in views" :key="item[0]" :name="item[0]" :label="item[1]"/></ElTabs>

    
    <NeteaseExplorer ref="explorer" v-if="view!=='songs'" :key="view+accountMode" :view="view"/>
    <template v-else>

    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="music-error"><el-button link type="primary" @click="load(1)">重试</el-button></el-alert>
    <div class="online-results" :aria-busy="loading">
      <Transition name="music-reveal" mode="out-in">
        <ElSkeleton v-if="loading&&!tracks.length" :rows="6" class="online-skeleton"/>
        <el-table v-else-if="tracks.length" :data="tracks" row-key="id" class="music-table" :row-class-name="({row})=>row.id===music.current?'music-current-row':''" @row-dblclick="play">
          <el-table-column label="#" width="48" align="center"><template #default="{row,$index}"><el-button text circle :disabled="!row.playable" :aria-label="'播放 '+row.title" class="music-row-play" @click="play(row)"><IconPlayerPlayFilled v-if="row.id===music.current" :size="14"/><span v-else>{{$index+1}}</span></el-button></template></el-table-column>
          <el-table-column label="歌曲 / 艺人" min-width="230"><template #default="{row}"><el-button text class="music-track-info" :disabled="!row.playable" :aria-label="'播放 '+row.title" @click="play(row)"><span class="music-art" :style="{'--art-hue':row.title.length*31}"><img v-if="row.cover" :src="row.cover" alt="" loading="lazy" referrerpolicy="no-referrer" @error="$event.target.style.visibility='hidden'"/><IconMusic v-else :size="20"/></span><span class="music-track-copy"><strong>{{row.title}}</strong><small>{{row.artist}}{{row.playable?(row.accessLabel?' · '+row.accessLabel:''):' · '+row.unavailableReason}}</small></span></el-button></template></el-table-column>
          <el-table-column label="专辑" min-width="105" show-overflow-tooltip><template #default="{row}"><span class="music-album">{{row.album||'—'}}</span></template></el-table-column>
          <el-table-column label="时长" width="65"><template #default="{row}"><span class="music-track-time">{{formatTime(row.duration)}}</span></template></el-table-column>
          <el-table-column label="" width="130" align="right"><template #default="{row}"><div class="music-track-actions" @dblclick.stop><ElDropdown trigger="click" popper-class="music-popper" @command="onlineCommand($event,row)"><el-button text circle :loading="collecting===row.id" :disabled="!row.playable" :aria-label="'收藏或加入歌单 '+row.title"><IconPlus v-if="collecting!==row.id" :size="18"/></el-button><template #dropdown><ElDropdownMenu><ElDropdownItem command="cloud-like">网易云红心喜欢</ElDropdownItem><ElDropdownItem command="cloud-add">加入网易云歌单</ElDropdownItem><ElDropdownItem command="collect" divided :disabled="collected(row.id)">{{collected(row.id)?'已在音乐库':'收藏到音乐库'}}</ElDropdownItem><ElDropdownItem v-for="p in music.playlists" :key="p.id" :command="p.id" :disabled="p.tracks.includes(row.id)">加入 {{p.name}}{{p.tracks.includes(row.id)?'（已添加）':''}}</ElDropdownItem></ElDropdownMenu></template></ElDropdown><el-link :href="row.sourceUrl" target="_blank" rel="noopener noreferrer" underline="never" class="online-source-link" :aria-label="'在网易云查看 '+row.title"><IconExternalLink :size="17"/></el-link></div></template></el-table-column>
        </el-table>
        <el-empty v-else-if="!error" description="没有找到歌曲"/>
      </Transition>
    <MusicLoadMore :loading="loading" :more="hasMore" :error="error" @load="!loading&&load(tracks.length?page+1:1)"/>
    </div>
    </template>
    <MusicTrackDetails v-model="detailsOpen"/><CloudPlaylistPicker v-model="cloudPicker" :track="cloudTarget"/>
    <footer class="music-library-footer online-footer"><span>音乐来自 网易云 · 收藏仅保存歌曲信息，不下载音频</span><el-link href="https://music.163.com" target="_blank" rel="noopener noreferrer" underline="never">网易云<IconExternalLink :size="12"/></el-link></footer>
  </section>
</template>
