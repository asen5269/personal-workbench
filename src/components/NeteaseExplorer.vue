<script setup>
import {computed,ref,watch,onBeforeUnmount} from 'vue'
import {ElMessage,ElMessageBox,ElSkeleton,ElDropdown,ElDropdownItem,ElDropdownMenu} from 'element-plus'
import MusicLoadMore from './MusicLoadMore.vue'
import AppDialog from './AppDialog.vue'
import NeteaseCatalog from './NeteaseCatalog.vue'
import CloudPlaylistPicker from './CloudPlaylistPicker.vue'
import {netease,neteaseAction} from '../utils/netease-client.js'
import {music,playOnlineTrack,collectOnlineTrack,formatTime,pauseMusic} from '../state/music.js'
import {IconArrowLeft,IconPlayerPlayFilled,IconMusic,IconPlus,IconHeart,IconDots,IconSearch} from '@tabler/icons-vue'
const props=defineProps({view:{type:String,required:true}})
const items=ref([]),kind=ref('collections'),page=ref(1),more=ref(false),busy=ref(false),error=ref(''),collection=ref(null),keyword=ref(''),ownerUid=ref(''),target=ref(null),addOpen=ref(false),videoOpen=ref(false),videoUrl=ref('')
let controller,revision=0
const titles={recommend:'为你精选',playlists:'发现歌单',charts:'排行榜',artists:'热门歌手',albums:'新碟上架',daily:'每日推荐',fm:'私人 FM',mine:'我的网易云歌单',liked:'云端喜欢',cloud:'网易云音乐云盘',history:'云端最近播放',mvs:'MV',podcasts:'播客电台'}
const displayed=computed(()=>collection.value?.tracks||items.value),isTracks=computed(()=>!!collection.value||kind.value==='tracks'),own=computed(()=>collection.value?.kind==='playlist'&&String(collection.value.creatorUid)===String(ownerUid.value)&&!!ownerUid.value)
defineExpose({play,refresh:()=>load(1),isTracks,canPlay:computed(()=>!busy.value&&displayed.value.some(t=>t.playable)),count:computed(()=>displayed.value.length)})
async function load(next=1){
  if(props.view==='catalog')return
  const previousCount=displayed.value.length
  controller?.abort();controller=new AbortController();const token=++revision;busy.value=true;error.value=''
  try{
    if(collection.value){const c=collection.value;const data=await netease(`collection/${c.kind}/${c.id}?offset=${(next-1)*20}`,{signal:controller.signal});if(token!==revision)return;collection.value=next>1?{...data,tracks:[...c.tracks,...data.tracks.filter(t=>!c.tracks.some(old=>old.id===t.id))]}:data;more.value=!!data.hasMore&&data.tracks.length>0&&(next===1||collection.value.tracks.length>previousCount)}
    else{const data=await netease(`browse?view=${props.view}&offset=${(next-1)*20}&q=${encodeURIComponent(keyword.value)}`,{signal:controller.signal});if(token!==revision)return;items.value=next>1?[...items.value,...data.items.filter(t=>!items.value.some(old=>old.id===t.id&&old.kind===t.kind))]:data.items;kind.value=data.kind;more.value=!!data.hasMore&&data.items.length>0&&(next===1||items.value.length>previousCount);if(data.ownerUid)ownerUid.value=String(data.ownerUid)}
    page.value=next
  }catch(e){if(e.name!=='AbortError'&&token===revision)error.value=e.message}finally{if(token===revision)busy.value=false}
}
async function open(item){
  if(item.kind==='mv'){
    try{const data=await netease('mv/'+item.id);videoUrl.value=data.url;videoOpen.value=true}catch(e){ElMessage.error(e.message)}return
  }
  collection.value={...item,tracks:[]};load(1)
}
function back(){collection.value=null;load(1)}
function play(track=displayed.value.find(t=>t.playable)){if(track?.playable)playOnlineTrack(track,displayed.value.filter(t=>t.playable))}
async function collect(track){try{await collectOnlineTrack(track);ElMessage.success('已收藏到工作台曲库')}catch(e){ElMessage.error(e.message)}}
async function action(type,params,confirmation){
  try{if(confirmation)await ElMessageBox.confirm(confirmation,'确认网易云账号操作',{confirmButtonText:'确认',cancelButtonText:'取消'});await neteaseAction(type,params);ElMessage.success('已同步到网易云');await load(1)}catch(e){if(e instanceof Error)ElMessage.error(e.message)}
}
async function createPlaylist(){
  try{const {value}=await ElMessageBox.prompt('歌单将以私密形式创建在你的网易云账号中','新建云端歌单',{inputValidator:v=>!!v?.trim()&&v.trim().length<=40||'请输入 1–40 字',confirmButtonText:'创建',cancelButtonText:'取消'});await neteaseAction('create-playlist',{name:value.trim(),private:true});ElMessage.success('私密歌单已创建');await load(1)}catch(e){if(e instanceof Error)ElMessage.error(e.message)}
}
async function rename(){try{const {value}=await ElMessageBox.prompt('修改网易云歌单名称','重命名歌单',{inputValue:collection.value.title,inputValidator:v=>!!v?.trim()&&v.length<=40||'请输入 1–40 字',confirmButtonText:'保存',cancelButtonText:'取消'});await neteaseAction('rename-playlist',{id:collection.value.id,name:value.trim()});load(1)}catch(e){if(e instanceof Error)ElMessage.error(e.message)}}
async function removePlaylist(){try{await ElMessageBox.confirm(`删除网易云歌单「${collection.value.title}」？这会修改你的云端账号。`,'删除云端歌单',{confirmButtonText:'删除',cancelButtonText:'取消',type:'warning'});await neteaseAction('delete-playlist',{id:collection.value.id});collection.value=null;await load(1)}catch(e){if(e instanceof Error)ElMessage.error(e.message)}}
function add(track){target.value=track;addOpen.value=true}
function command(value,track){if(value==='collect')collect(track);if(value==='add')add(track);if(value==='like')action('like',{id:track.providerId,like:props.view!=='liked'},props.view==='liked'?'从网易云喜欢列表移除这首歌？':undefined);if(value==='remove')action('playlist-remove',{id:collection.value.id,trackId:track.providerId},'从此网易云歌单移除这首歌？')}
watch(()=>props.view,()=>{collection.value=null;items.value=[];keyword.value='';ownerUid.value='';load(1)},{immediate:true})
onBeforeUnmount(()=>{++revision;controller?.abort()})
</script>
<template>
  <NeteaseCatalog v-if="view==='catalog'"/>
  <section v-else class="music-explorer">
    <div class="music-explorer-head"><el-button v-if="collection" text circle aria-label="返回分类" @click="back"><IconArrowLeft :size="18"/></el-button><div class="music-explorer-tools"><el-button v-if="view==='mine'&&!collection" type="primary" size="small" @click="createPlaylist"><IconPlus :size="15"/>新建云端歌单</el-button><el-button v-if="collection?.kind==='playlist'&&!own" size="small" @click="action('subscribe',{id:collection.id,subscribe:!collection.subscribed},collection.subscribed?'取消收藏这个网易云歌单？':undefined)">{{collection.subscribed?'取消云端收藏':'收藏到网易云'}}</el-button><ElDropdown v-if="own" trigger="click" @command="$event==='rename'?rename():removePlaylist()"><el-button text circle aria-label="云端歌单操作"><IconDots :size="20"/></el-button><template #dropdown><ElDropdownMenu><ElDropdownItem command="rename">重命名</ElDropdownItem><ElDropdownItem command="delete" divided>删除云端歌单</ElDropdownItem></ElDropdownMenu></template></ElDropdown></div></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" class="music-error"/><ElSkeleton v-if="busy&&!displayed.length" :rows="5" class="online-skeleton"/>
    <template v-else-if="displayed.length||!error">
      <template v-if="isTracks"><el-table :data="displayed" class="music-table" row-key="id" @row-dblclick="play"><el-table-column label="歌曲 / 艺人" min-width="240"><template #default="{row}"><el-button text class="music-track-info" :disabled="!row.playable" @click="play(row)"><span class="music-art" :style="{'--art-hue':row.title.length*31}"><img v-if="row.cover" :src="row.cover" alt="" loading="lazy"/><IconMusic v-else :size="20"/></span><span class="music-track-copy"><strong>{{row.title}}</strong><small>{{row.artist}}</small></span></el-button></template></el-table-column><el-table-column label="专辑" min-width="120" show-overflow-tooltip prop="album"/><el-table-column label="时长" width="70"><template #default="{row}">{{formatTime(row.duration)}}</template></el-table-column><el-table-column width="76"><template #default="{row}"><ElDropdown trigger="click" @command="command($event,row)"><el-button text circle :aria-label="row.title+' 的账号操作'"><IconDots :size="20"/></el-button><template #dropdown><ElDropdownMenu><ElDropdownItem command="collect">收藏到工作台</ElDropdownItem><ElDropdownItem command="like">{{view==='liked'?'取消云端喜欢':'网易云红心喜欢'}}</ElDropdownItem><ElDropdownItem command="add">加入网易云歌单</ElDropdownItem><ElDropdownItem v-if="own" command="remove" divided>从网易云歌单移除</ElDropdownItem></ElDropdownMenu></template></ElDropdown></template></el-table-column></el-table><el-empty v-if="!displayed.length" description="暂无歌曲"/></template>
      <div v-else-if="items.length" class="music-collection-grid"><button v-for="item in items" :key="item.kind+item.id" class="music-collection-card" @click="open(item)"><span class="music-collection-cover"><img v-if="item.cover" :src="item.cover" alt="" loading="lazy"/><IconMusic v-else :size="34"/></span><strong>{{item.title}}</strong><small>{{item.subtitle|| (item.count?item.count+' 首':'点击浏览')}}</small></button></div><el-empty v-else description="暂无内容"/>
    </template>
    <MusicLoadMore v-if="view!=='fm'" :loading="busy" :more="more" :error="error" @load="!busy&&load(displayed.length?page+1:1)"/>
    <CloudPlaylistPicker v-model="addOpen" :track="target"/>
    <AppDialog v-model="videoOpen" title="网易云 MV" :width="850"><video v-if="videoOpen" class="music-mv-player" :src="videoUrl" controls playsinline preload="metadata" @play="pauseMusic" @error="ElMessage.error('此 MV 暂时无法播放，请稍后重试')"/></AppDialog>
  </section>
</template>
