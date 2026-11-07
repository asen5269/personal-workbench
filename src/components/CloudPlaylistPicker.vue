<script setup>
import {onBeforeUnmount,ref} from 'vue'
import {ElMessage,ElMessageBox,ElSkeleton} from 'element-plus'
import AppDialog from './AppDialog.vue'
import {netease,neteaseAction} from '../utils/netease-client.js'
const open=defineModel({default:false}),props=defineProps({track:Object}),emit=defineEmits(['added'])
const items=ref([]),page=ref(1),more=ref(false),busy=ref(false),saving=ref(false),error=ref('')
let controller,revision=0
async function load(next=1){controller?.abort();controller=new AbortController();const token=++revision;busy.value=true;error.value='';try{const data=await netease('browse?view=mine&offset='+((next-1)*20),{signal:controller.signal});if(token!==revision)return;items.value=data.items.filter(p=>String(p.creatorUid)===String(data.ownerUid));page.value=next;more.value=data.hasMore}catch(e){if(e.name!=='AbortError'&&token===revision)error.value=e.message}finally{if(token===revision)busy.value=false}}
function cancel(){++revision;controller?.abort();busy.value=false}
async function add(playlist){
  try{await ElMessageBox.confirm(`把「${props.track.title}」加入网易云歌单「${playlist.title}」？`,'加入云端歌单',{confirmButtonText:'加入',cancelButtonText:'取消'});saving.value=true;await neteaseAction('playlist-add',{id:playlist.id,trackId:props.track.providerId});ElMessage.success('已加入网易云歌单');open.value=false;emit('added')}catch(e){if(e instanceof Error)ElMessage.error(e.message)}finally{saving.value=false}
}
onBeforeUnmount(cancel)
</script>
<template><AppDialog v-model="open" title="加入网易云歌单" :width="440" @opened="load(1)" @close="cancel"><el-alert v-if="error" :title="error" type="error" :closable="false"/><ElSkeleton v-if="busy" :rows="4"/><el-empty v-else-if="!items.length&&!error" description="本页没有可编辑歌单，可翻页或先创建私密歌单"/><div v-else class="music-cloud-targets"><el-button v-for="p in items" :key="p.id" :disabled="saving" @click="add(p)">{{p.title}}</el-button></div><div class="online-pagination"><el-button :disabled="page===1||busy||saving" @click="load(page-1)">上一页</el-button><span>{{page}}</span><el-button :disabled="!more||busy||saving" @click="load(page+1)">下一页</el-button></div><template #footer><el-button :disabled="saving" @click="open=false">取消</el-button></template></AppDialog></template>
