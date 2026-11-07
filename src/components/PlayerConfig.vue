<script setup>
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
const defaults={deviceId:'',deviceName:'',autoPlay:false,autoPause:true,resumeOnly:true}
let saved={}
try{saved=JSON.parse(localStorage.getItem('workbench-player-config'))||{}}catch{}
const config=reactive({...defaults,...saved}),devices=ref([]),busy=ref(false),status=ref('尚未读取设备')
async function refresh(){
  busy.value=true
  try{
    if(!navigator.mediaDevices?.enumerateDevices)throw Error('当前环境不支持读取音频设备')
    devices.value=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audiooutput'&&!['default','communications'].includes(d.deviceId))
    status.value=devices.value.length?'已读取当前可见的音频输出设备':'暂无可见设备，请连接耳机后刷新；浏览器可能限制设备名称和列表'
  }catch(error){status.value=error.message}finally{busy.value=false}
}
function save(){
  if(config.autoPlay&&!config.deviceId){ElMessage.warning('请先选择耳机');return}
  config.deviceName=devices.value.find(d=>d.deviceId===config.deviceId)?.label||config.deviceName
  try{localStorage.setItem('workbench-player-config',JSON.stringify(config));ElMessage.success('播放器配置已保存');return true}catch{ElMessage.error('配置保存失败')}
}
defineExpose({save})
refresh()
</script>
<template>
  <el-form label-position="top" @submit.prevent="save">
    <el-form-item label="自动播放耳机"><div class="player-device-row"><el-select v-model="config.deviceId" placeholder="选择已连接的耳机" aria-label="自动播放耳机"><el-option v-if="config.deviceId&&!devices.some(d=>d.deviceId===config.deviceId)" :value="config.deviceId" :label="(config.deviceName||'已保存的耳机')+'（当前不可见）'"/><el-option v-for="(device,index) in devices" :key="device.deviceId" :value="device.deviceId" :label="device.label||'音频输出设备 '+(index+1)"/></el-select><el-button :loading="busy" @click="refresh">刷新设备</el-button></div><p class="config-hint" role="status">{{status}}</p></el-form-item>
    <div class="player-config-options"><el-checkbox v-model="config.autoPlay">耳机连接后自动播放</el-checkbox><el-checkbox v-model="config.autoPause">耳机断开后自动暂停</el-checkbox><el-checkbox v-model="config.resumeOnly" :disabled="!config.autoPlay">仅恢复因耳机断开而暂停的音乐</el-checkbox></div>
    <el-alert title="桌面端连接监听待接入" description="当前可保存配置、读取浏览器可见的音频设备。自动播放和暂停需在 Windows / macOS 桌面端接入系统音频监听后生效；彻底退出应用后不监听。" type="info" :closable="false" show-icon/>
  </el-form>
</template>
<style scoped>
.player-device-row{display:flex;width:100%;gap:12px}.player-device-row .el-select{flex:1;min-width:0}.player-config-options{display:flex;flex-direction:column;align-items:flex-start;gap:12px;margin-bottom:24px}.config-hint{font-size:12px;line-height:1.6;margin:8px 0 0}
</style>
