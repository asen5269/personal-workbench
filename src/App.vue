<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElSubMenu } from 'element-plus'
import OverviewPanel from './pages/OverviewPanel.vue'
import TasksPage from './pages/TasksPage.vue'
import FileToolsPage from './pages/FileToolsPage.vue'
import TestVideoPage from './pages/TestVideoPage.vue'
import UniversalConvertPage from './pages/UniversalConvertPage.vue'
import ToolboxPage from './pages/ToolboxPage.vue'
import DailyNotes from './pages/DailyNotes.vue'
import LibraryPage from './pages/LibraryPage.vue'
import BookshelfPage from './pages/BookshelfPage.vue'
import DomainList from './pages/DomainList.vue'
import AppButton from './components/AppButton.vue'
import AppDialog from './components/AppDialog.vue'
import RenewalNotice from './components/RenewalNotice.vue'
import MediaParserPage from './pages/MediaParserPage.vue'
import WorkspaceHeader from './components/WorkspaceHeader.vue'
import MusicPage from './pages/MusicPage.vue'
import MusicMiniPlayer from './components/MusicMiniPlayer.vue'
import { initMusic } from './state/music.js'
import './css/music.css'
import { branding } from './state/branding.js'
import { daysUntil, renewalLevel } from './utils/renewal.js'
import './css/overview.css'
const route=useRoute(), router=useRouter()
const tab=computed({get:()=>route.name,set:name=>router.push({name})})
const items=ref([]), editing=ref(null), form=ref(null), formVisible=ref(false), formRef=ref(null), saving=ref(false), error=ref('')
const menuCollapsed=ref(false), sidebar=ref(null), content=ref(null)
async function toggleMenu(){
  const nodes=[sidebar.value,content.value], before=nodes.map(el=>el.getBoundingClientRect())
  menuCollapsed.value=!menuCollapsed.value
  await nextTick()
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return
  const style=getComputedStyle(document.documentElement)
  nodes.forEach((el,i)=>{const after=el.getBoundingClientRect();el.animate([{transform:`translateX(${before[i].x-after.x}px) scaleX(${before[i].width/after.width})`},{transform:'none'}],{duration:parseFloat(style.getPropertyValue('--duration')),easing:style.getPropertyValue('--ease').trim()})})
}
const tabs=[['overview','总览','M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'],['account','账号订阅','M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 20c0-4 3-6 8-6s8 2 8 6'],['server','服务器','M4 4h16v6H4z M4 14h16v6H4z M7 7h.01 M7 17h.01'],['domain','域名','M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c4 4 4 14 0 18 M12 3c-4 4-4 14 0 18'],['parse','自媒体解析','M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2']]
tabs.push(['music','音乐','M9 18V5l12-2v13 M9 8l12-2 M9 18a3 3 0 1 1-3-3c2 0 3 1 3 3 M21 16a3 3 0 1 1-3-3c2 0 3 1 3 3'])
tabs.push(['notes','每日笔记','M5 3h14v18H5z M9 8h6 M9 12h6 M9 16h4'])
tabs.push(['library','资料库','M3 7h18v13H3z M3 7V4h6l3 3 M8 12h8 M8 16h5'])
tabs.push(['bookshelf','书架','M4 3h6v18H4z M14 3h6v18h-6z'])
tabs.push(['image-tools','图片处理','M4 4h16v16H4z M4 16l5-5 4 4 3-3 4 4 M8 8h.01'],['file-tools','文件转换','M5 3h9l5 5v13H5z M14 3v6h5 M8 13h8 M8 17h5'])
tabs.push(['test-video','测试视频生成','M3 5h18v14H3z M10 9l5 3-5 3z'])
tabs.push(['food','今天吃什么？','M4 3v7h5V3 M6.5 10v11 M17 3v18 M17 3c-4 4-4 9 0 9'])
tabs.push(['tasks','待办任务','M9 5h12 M9 12h12 M9 19h12 M3 5l1 1 2-2 M3 12l1 1 2-2 M3 19l1 1 2-2'])
const labels={account:'账号订阅',server:'服务器',domain:'域名'}
const fields={account:[['name','平台名称'],['username','账号'],['password','密码'],['price','每月费用'],['renewal','下次续费日期'],['url','平台网址'],['notes','备注']],server:[['name','服务器名称'],['provider','服务商'],['host','IP / 主机地址'],['username','登录用户'],['password','密码'],['key','登录密钥'],['spec','配置信息'],['renewal','到期日期'],['notes','备注']],domain:[['name','域名'],['provider','注册商'],['host','解析配置'],['renewal','到期日期'],['notes','备注']]}
const filtered=computed(()=>items.value.filter(x=>x.type===tab.value))
const due=daysUntil
async function api(url,options){const r=await fetch(url,options); const data=await r.json(); if(!r.ok)throw Error(data.error||'操作失败'); return data}
async function load(){try{items.value=await api('/api/entries')}catch(e){error.value=e.message}}
function open(item){if(!item)return addResource(tab.value); const {id,...data}=item; editing.value=id; form.value={...data,price:data.price !== undefined && data.price !== '' ? Number(data.price) : undefined}; error.value=''; formVisible.value=true}
function addResource(type){editing.value=null; form.value={type}; error.value=''; formVisible.value=true}
async function save(){if(saving.value)return; const valid=await formRef.value.validate().catch(()=>false); if(!valid)return; saving.value=true; try{await api('/api/entries'+(editing.value?'/'+editing.value:''),{method:editing.value?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form.value)}); formVisible.value=false; await load(); ElMessage.success('已保存')}catch(e){error.value=e.message}finally{saving.value=false}}
async function remove(item){try{await ElMessageBox.confirm(`确定删除「${item.name}」？删除后无法恢复。`,'删除确认',{confirmButtonText:'删除',cancelButtonText:'取消',type:'warning',confirmButtonClass:'el-button--danger'}); await api('/api/entries/'+item.id,{method:'DELETE'}); await load(); ElMessage.success('已删除')}catch(e){if(e!=='cancel'&&e!=='close')error.value=e.message}}
onMounted(() => { load(); initMusic() })
</script>
<template>
  <div class="shell">
    <aside ref="sidebar" :class="{'is-collapsed':menuCollapsed}">
      <div class="sidebar-brand-row">
      <div class="brand"><span class="brand-mark"><img v-if="branding.logo" :src="branding.logo" alt=""/><svg v-else viewBox="0 0 24 24"><path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"/></svg></span><div><strong>{{branding.name}}</strong></div></div></div>
      <nav id="workspace-menu" class="workspace-nav"><el-menu :default-active="tab" :default-openeds="['archives','personal-space']" :collapse="menuCollapsed" :collapse-transition="false" @select="tab=$event;error=''">
        <template v-for="t in tabs" :key="t[0]">
          <ElSubMenu v-if="t[0]==='account'" index="archives" class="archives-menu"><template #title><svg class="nav-icon" viewBox="0 0 24 24"><path d="M3 7h18v14H3z M3 7V3h7l2 4 M9 12h6"/></svg><span>档案库</span></template><el-menu-item v-for="child in tabs.filter(x=>['account','server','domain'].includes(x[0]))" :key="child[0]" :index="child[0]" :aria-label="child[1]"><svg class="nav-icon" viewBox="0 0 24 24"><path :d="child[2]"/></svg><template #title><span>{{child[1]}}</span></template></el-menu-item></ElSubMenu>
          <ElSubMenu v-else-if="t[0]==='food'" index="toolbox" class="archives-menu"><template #title><svg class="nav-icon" viewBox="0 0 24 24"><path d="M4 7h16v14H4z M9 7V3h6v4 M4 12h16 M10 12v3h4v-3"/></svg><span>工具箱</span></template><el-menu-item v-for="child in tabs.filter(x=>['food','image-tools','file-tools','test-video'].includes(x[0]))" :key="child[0]" :index="child[0]"><svg class="nav-icon" viewBox="0 0 24 24"><path :d="child[2]"/></svg><template #title>{{child[1]}}</template></el-menu-item></ElSubMenu>
          <ElSubMenu v-else-if="t[0]==='music'" index="personal-space" class="archives-menu"><template #title><svg class="nav-icon" viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21v-2c0-4 3-6 8-6s8 2 8 6v2"/></svg><span>个人空间</span></template>
            <el-menu-item v-for="name in ['tasks','notes','music','bookshelf','library']" :key="name" :index="name" :aria-label="tabs.find(x=>x[0]===name)[1]"><svg class="nav-icon" viewBox="0 0 24 24"><path :d="tabs.find(x=>x[0]===name)[2]"/></svg><template #title><span>{{tabs.find(x=>x[0]===name)[1]}}</span></template></el-menu-item>
          </ElSubMenu>
          <el-menu-item v-else-if="!['tasks','server','domain','notes','bookshelf','library','image-tools','file-tools','test-video'].includes(t[0])" :index="t[0]" :aria-label="t[1]"><svg class="nav-icon" viewBox="0 0 24 24"><path :d="t[2]"/></svg><template #title><span>{{t[1]}}</span></template></el-menu-item>
        </template>
      </el-menu></nav>
      <div class="aside-bottom"><span class="status-dot"></span>本地工作空间<small>所有资料保存在这台设备</small></div>
    </aside>
    <div ref="content" class="workspace-content">
      <WorkspaceHeader :menu-collapsed="menuCollapsed" @toggle-menu="toggleMenu" />
    <main>
      <header v-if="tab !== 'overview' && !['tasks','music','notes','library','bookshelf','parse','domain','food','image-tools','file-tools','test-video'].includes(tab)"><h1>{{tabs.find(x=>x[0]===tab)?.[1]}}</h1><RenewalNotice :items="items" @edit="open" /></header>
      <el-alert v-if="error && !formVisible" :title="error" type="error" show-icon :closable="false" class="page-alert" />
      <ToolboxPage v-if="tab==='food'" :key="tab" :mode="tab"/><DailyNotes v-else-if="tab==='notes'" />
      <template v-else-if="tab==='overview'"><OverviewPanel :items="items" @add="addResource" @edit="open" @navigate="tab=$event" /></template>
      <TasksPage v-else-if="tab==='tasks'" />
      <MusicPage v-else-if="tab==='music'" />
      <MediaParserPage v-else-if="tab==='parse'" />
      <FileToolsPage v-else-if="tab==='image-tools'" />
      <TestVideoPage v-else-if="tab==='test-video'" />
      <UniversalConvertPage v-else-if="tab==='file-tools'" />
      <LibraryPage v-else-if="tab==='library'" />
      <BookshelfPage v-else-if="tab==='bookshelf'" />
      <DomainList v-else-if="tab==='domain'" :items="filtered" @add="addResource('domain')" @edit="open" @delete="remove" />
      <template v-else>
        <div class="section-head list-head"><h2>全部{{labels[tab]}} <el-tag size="small" type="info">{{filtered.length}}</el-tag></h2><AppButton @click="open()">添加{{labels[tab]}}</AppButton></div>
        <el-empty v-if="!filtered.length" :description="'还没有'+labels[tab]+'，从添加第一条开始。'"><AppButton @click="open()">添加{{labels[tab]}}</AppButton></el-empty>
        <div class="grid"><AppCard tag="article" v-for="item in filtered" :key="item.id" class="card item" :class="renewalLevel(item.renewal)"><div class="item-top"><div class="avatar">{{item.name.slice(0,1).toUpperCase()}}</div><el-tag v-if="item.renewal" :type="due(item.renewal)<=7?'danger':due(item.renewal)<=30?'warning':'success'" effect="light">{{due(item.renewal)<0?'已过期':due(item.renewal)===0?'今天到期':'剩余 '+due(item.renewal)+' 天'}}</el-tag></div><h3>{{item.name}}</h3><p>{{item.username || item.provider || item.host || '暂无补充信息'}}</p><div class="item-meta"><span v-if="item.price">¥{{item.price}} / 月</span><span v-if="item.renewal">{{item.renewal}}</span></div><div class="actions"><el-button size="small" @click="open(item)">查看 / 编辑</el-button><el-button size="small" type="danger" text @click="remove(item)">删除</el-button></div></AppCard></div>
      </template>
    </main>
    <MusicMiniPlayer />
    </div>
    <AppDialog :model-value="formVisible" :title="(editing?'编辑':'添加')+(labels[form?.type] || '')" :width="600" :show-close="!saving" :close-on-press-escape="!saving" @update:model-value="!saving && (formVisible=$event)" @closed="form=null">
      <el-form v-if="form" ref="formRef" :model="form" label-position="top" @submit.prevent="save">
        <el-form-item v-for="f in fields[form.type]" :key="f[0]" :label="f[1]" :prop="f[0]" :rules="f[0]==='name'?[{ required:true, whitespace:true, message:'请填写'+f[1],trigger:'blur' }]:[]">
          <el-date-picker v-if="f[0]==='renewal'" v-model="form[f[0]]" type="date" value-format="YYYY-MM-DD" format="YYYY-MM-DD" placeholder="选择到期日期" clearable />
          <el-input-number v-else-if="f[0]==='price'" v-model="form[f[0]]" :min="0" :precision="2" :step="1" controls-position="right" placeholder="每月费用" />
          <el-input v-else-if="['key','notes','spec'].includes(f[0])" v-model="form[f[0]]" type="textarea" :rows="f[0]==='key'?4:3" :placeholder="f[1]" />
          <el-input v-else v-model="form[f[0]]" :type="f[0]==='password'?'password':'text'" :show-password="f[0]==='password'" :placeholder="f[1]" autocomplete="off" />
        </el-form-item>
        <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
      </el-form>
      <template #footer><AppButton variant="secondary" :disabled="saving" @click="formVisible=false">取消</AppButton><AppButton :loading="saving" @click="save">保存</AppButton></template>
    </AppDialog>
  </div>
</template>




