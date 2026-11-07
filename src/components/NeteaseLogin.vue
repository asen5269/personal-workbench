<script setup>
import {onMounted,onBeforeUnmount,ref} from 'vue'
import {ElMessage} from 'element-plus'
import AppDialog from './AppDialog.vue'
import {IconQrcode,IconRefresh,IconUser,IconCircleCheck} from '@tabler/icons-vue'
import {resetOnlinePlayback} from '../state/music.js'
const emit=defineEmits(['changed'])
const open=ref(false),busy=ref(false),loggedIn=ref(false),nickname=ref(''),image=ref(''),message=ref(''),error=ref(''),state=ref('idle'),statusError=ref(false)
let sessionId='',timer,controller,generation=0,disposed=false
async function api(path,method='GET',body,signal){const response=await fetch('/api/music/netease/auth/'+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal});const data=await response.json();if(!response.ok)throw Error(data.error||'登录操作失败');return data}
async function status(){try{const data=await api('status');if(disposed)return;loggedIn.value=data.loggedIn;nickname.value=data.profile?.nickname||'';statusError.value=false;emit('changed',data.loggedIn?'configured':'anonymous')}catch{if(!disposed)statusError.value=true}}
function cancel(){generation++;clearTimeout(timer);controller?.abort();const old=sessionId;sessionId='';if(old)api('qr/'+encodeURIComponent(old),'DELETE').catch(()=>{})}
function close(){cancel();image.value='';state.value='idle';busy.value=false}
async function create(){
  cancel();const token=generation
  busy.value=true;image.value='';error.value='';state.value='creating';message.value='正在生成登录二维码…';controller=new AbortController()
  try{const data=await api('qr','POST',{},controller.signal);if(token!==generation||!open.value){api('qr/'+encodeURIComponent(data.sessionId),'DELETE').catch(()=>{});return}sessionId=data.sessionId;image.value=data.image;state.value='waiting';message.value='使用网易云音乐 App 扫码，并在手机上确认';schedule(token)}catch(e){if(e.name!=='AbortError'&&token===generation){error.value=e.message;state.value='error'}}finally{if(token===generation)busy.value=false}
}
function schedule(token){clearTimeout(timer);timer=setTimeout(()=>poll(token),3000)}
async function poll(token){
  if(token!==generation||!open.value||!sessionId)return
  try{
    const data=await api('check','POST',{sessionId},controller.signal)
    if(token!==generation||!open.value)return
    message.value=data.message
    if(data.code===803){sessionId='';state.value='success';loggedIn.value=true;nickname.value=data.profile?.nickname||'网易云用户';statusError.value=false;resetOnlinePlayback();emit('changed','configured');ElMessage.success('网易云登录成功');return}
    if(data.code===800){state.value='expired';sessionId='';return}
    state.value=data.code===802?'confirm':'waiting';schedule(token)
  }catch(e){if(e.name!=='AbortError'&&token===generation){error.value=e.message;state.value='error'}}
}
async function logout(){busy.value=true;try{await api('logout','POST',{});cancel();loggedIn.value=false;nickname.value='';statusError.value=false;resetOnlinePlayback();emit('changed','anonymous');ElMessage.success('已退出工作台中的网易云账号')}catch(e){ElMessage.error(e.message)}finally{busy.value=false}}
onMounted(status)
onBeforeUnmount(()=>{disposed=true;cancel()})
</script>
<template>
  <div class="netease-account"><span v-if="loggedIn" class="netease-account-name"><IconUser :size="14"/>{{nickname||'已登录'}}</span><el-button v-if="loggedIn" text size="small" :loading="busy" @click="logout">退出登录</el-button><el-button v-else size="small" :loading="busy" @click="open=true"><IconQrcode :size="16"/>{{statusError?'重新扫码登录':'扫码登录'}}</el-button></div>
  <AppDialog v-model="open" title="登录网易云音乐" :width="380" @opened="create" @close="close">
    <div class="netease-login" aria-live="polite">
      <div class="netease-qr-frame">
        <Transition name="music-reveal" mode="out-in"><div v-if="state==='success'" class="netease-login-success"><IconCircleCheck :size="58"/><strong>登录成功</strong><span>{{nickname}}</span></div><img v-else-if="image&&!['expired','error'].includes(state)" :src="image" alt="网易云音乐登录二维码"/><div v-else class="netease-qr-placeholder"><IconQrcode :size="60"/><span>{{busy?'正在生成二维码…':state==='expired'?'二维码已过期':'请刷新二维码'}}</span></div></Transition>
      </div>
      <p>{{message}}</p><el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
      <el-button v-if="['expired','error'].includes(state)" :loading="busy" @click="create"><IconRefresh :size="16"/>刷新二维码</el-button>
      <small>请在网易云音乐 App 中确认授权。关闭窗口即停止轮询；工作台服务重启后需重新扫码。</small>
    </div>
    <template #footer><el-button @click="open=false">{{state==='success'?'完成':'取消'}}</el-button></template>
  </AppDialog>
</template>
