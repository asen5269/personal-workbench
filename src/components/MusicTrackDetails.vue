<script setup>
import {computed,ref,watch,onBeforeUnmount,nextTick} from 'vue'
import {ElDrawer,ElMessage,ElMessageBox,ElTabs,ElTabPane} from 'element-plus'
import {music,currentTrack,seek} from '../state/music.js'
import {netease,neteaseAction} from '../utils/netease-client.js'
import {parseLyrics,activeLyric} from '../utils/music-lyrics.js'
const open=defineModel({default:false}),tab=ref('lyrics'),lyrics=ref({original:'',translated:''}),comments=ref([]),page=ref(1),more=ref(false),busy=ref(false),error=ref(''),content=ref('')
let controller,revision=0
const lyricViewport=ref(null),following=ref(true)
let resumeTimer,scrollFrame
function centerLyric(){
  cancelAnimationFrame(scrollFrame)
  const viewport=lyricViewport.value,line=viewport?.querySelector('.active')
  if(!viewport||!line||!following.value)return
  const start=viewport.scrollTop,target=Math.max(0,Math.min(viewport.scrollHeight-viewport.clientHeight,start+line.getBoundingClientRect().top-viewport.getBoundingClientRect().top-(viewport.clientHeight-line.offsetHeight)/2))
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){viewport.scrollTop=target;return}
  const began=performance.now()
  function step(now){const progress=Math.min(1,(now-began)/300);viewport.scrollTop=start+(target-start)*(1-Math.pow(1-progress,3));if(progress<1)scrollFrame=requestAnimationFrame(step)}
  scrollFrame=requestAnimationFrame(step)
}
function resumeFollowing(){clearTimeout(resumeTimer);following.value=true;nextTick(centerLyric)}
function browseLyrics(){following.value=false;cancelAnimationFrame(scrollFrame);clearTimeout(resumeTimer);resumeTimer=setTimeout(resumeFollowing,4000)}
function seekLyric(time){seek(time);resumeFollowing()}
const lines=computed(()=>parseLyrics(lyrics.value.original)),active=computed(()=>activeLyric(lines.value,music.time)),translated=computed(()=>parseLyrics(lyrics.value.translated))
watch([active,open,tab,busy],async()=>{await nextTick();if(open.value&&tab.value==='lyrics'&&!busy.value)centerLyric()},{flush:'post'})
async function load(){
  controller?.abort();controller=new AbortController();const token=++revision,id=currentTrack.value?.providerId
  if(!id||!open.value)return
  busy.value=true;error.value=''
  try{
    if(tab.value==='lyrics') {const data=await netease('lyrics/'+id,{signal:controller.signal});if(token===revision)lyrics.value=data}
    else {const data=await netease('comments/'+id+'?offset='+((page.value-1)*20),{signal:controller.signal});if(token===revision){comments.value=data.items;more.value=data.hasMore}}
  }catch(e){if(e.name!=='AbortError'&&token===revision)error.value=e.message}finally{if(token===revision)busy.value=false}
}
async function send(){const track=currentTrack.value,text=content.value.trim();if(track?.provider!=='netease'||!text)return;const id=track.providerId;try{await ElMessageBox.confirm(text,`发布到「${track.title}」的评论区？`,{confirmButtonText:'发布',cancelButtonText:'取消'});await neteaseAction('comment',{id,content:text});if(currentTrack.value?.providerId===id){content.value='';load()}ElMessage.success('评论已发布')}catch(e){if(e instanceof Error)ElMessage.error(e.message)}}
async function like(comment){try{await neteaseAction('comment-like',{id:currentTrack.value.providerId,commentId:comment.id,like:!comment.liked});comment.likes+=comment.liked?-1:1;comment.liked=!comment.liked}catch(e){ElMessage.error(e.message)}}
watch(()=>currentTrack.value?.id,()=>{page.value=1;if(currentTrack.value?.provider!=='netease')open.value=false})
watch([open,()=>currentTrack.value?.id,tab,page],()=>{if(!open.value){++revision;controller?.abort();return}load()})
onBeforeUnmount(()=>{controller?.abort();clearTimeout(resumeTimer);cancelAnimationFrame(scrollFrame)})
</script>
<template>
  <ElDrawer v-model="open" :title="currentTrack?.title||'播放详情'" size="min(480px,100vw)" class="music-details-drawer" @opened="resumeFollowing" @closed="content=''">
    <div class="music-details"><p class="music-feature-hint">{{currentTrack?.artist}} · {{currentTrack?.album}}</p><el-tabs v-model="tab"><el-tab-pane label="歌词" name="lyrics"/><el-tab-pane label="评论" name="comments"/></el-tabs><el-alert v-if="error" :title="error" type="error" :closable="false"/><p v-if="busy" class="music-feature-hint">正在加载…</p><template v-else-if="tab==='lyrics'"><el-empty v-if="!lines.length" description="暂无同步歌词"/><div v-else class="music-lyrics-panel"><div class="music-lyrics-toolbar"><span>{{following ? '歌词随播放自动滚动' : '正在浏览歌词'}}</span><el-button text :disabled="following" @click="resumeFollowing">{{following ? '自动跟随' : '回到当前歌词'}}</el-button></div><div ref="lyricViewport" class="music-lyrics" tabindex="0" aria-label="同步歌词" @wheel.passive="browseLyrics" @touchstart.passive="browseLyrics" @pointerdown="browseLyrics" @keydown="browseLyrics"><button v-for="(line,index) in lines" :key="index" :class="{active:index===active}" :aria-current="index===active?'true':undefined" @click="seekLyric(line.time)">{{line.text}}<small v-if="translated.find(t=>Math.abs(t.time-line.time)<.1)">{{translated.find(t=>Math.abs(t.time-line.time)<.1).text}}</small></button></div></div></template><template v-else><el-input v-model="content" type="textarea" :rows="3" maxlength="1000" show-word-limit placeholder="写下你的评论，发布前需要确认"/><el-button type="primary" :disabled="!content.trim()" class="music-comment-send" @click="send">发布评论</el-button><el-empty v-if="!comments.length" description="暂无评论"/><article v-for="comment in comments" :key="comment.id" class="music-comment"><header><strong>{{comment.user}}</strong><span>{{new Date(comment.time).toLocaleDateString('zh-CN')}}</span></header><p>{{comment.content}}</p><blockquote v-for="(reply,i) in comment.replies" :key="i">{{reply.user}}：{{reply.content}}</blockquote><el-button text size="small" @click="like(comment)">{{comment.liked?'取消赞':'赞'}} · {{comment.likes}}</el-button></article><div class="online-pagination"><el-button :disabled="page===1||busy" @click="page--">上一页</el-button><span>{{page}}</span><el-button :disabled="!more||busy" @click="page++">下一页</el-button></div></template></div>
  </ElDrawer>
</template>
