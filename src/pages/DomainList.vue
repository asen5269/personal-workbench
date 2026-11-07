<script setup>
import { computed, ref } from 'vue'
import { ElTooltip, ElMessage } from 'element-plus'
import { IconPlus, IconTrash, IconSearch, IconCopy } from '@tabler/icons-vue'
import AppButton from '../components/AppButton.vue'
import { daysUntil, renewalLevel } from '../utils/renewal.js'
import '../css/domains.css'
const props=defineProps({items:{type:Array,required:true}})
const emit=defineEmits(['add','edit','delete'])
const search=ref(''),filter=ref('all')
const needsRenewal=item=>{const days=daysUntil(item.renewal);return days!==null&&days<=30}
const pending=computed(()=>props.items.filter(needsRenewal).length)
const missing=computed(()=>props.items.filter(item=>daysUntil(item.renewal)===null).length)
const domains=computed(()=>props.items.filter(item=>(filter.value==='all'||filter.value==='due'&&needsRenewal(item)||filter.value==='missing'&&daysUntil(item.renewal)===null)&&`${item.name} ${item.provider||''} ${item.host||''}`.toLowerCase().includes(search.value.trim().toLowerCase())).sort((a,b)=>(a.renewal||'9999').localeCompare(b.renewal||'9999')))
async function copy(value){try{await navigator.clipboard.writeText(value);ElMessage.success('域名已复制')}catch{ElMessage.error('复制失败')}}
const noteValue=(item,key)=>item.notes?.match(new RegExp(`(?:^|\\n)${key}：([^\\n]+)`))?.[1]||''
const isAliyun=item=>/阿里云|aliyun|alibaba/i.test(item.provider||'')
const dns=item=>(item.host||'').split(/\s*[|\n]\s*/).filter(Boolean)
function expiry(item){const days=daysUntil(item.renewal);return days===null?'未设置':days<0?`已过期 ${-days} 天`:days===0?'今天到期':`剩余 ${days} 天`}
const tagType=item=>{const days=daysUntil(item.renewal);return days===null?'info':days<=7?'danger':days<=30?'warning':'primary'}
</script>
<template>
  <section class="domain-workspace" aria-label="域名管理">
    <div class="domain-page-heading"><div><h1>域名</h1><p>{{items.length}} 个域名 · 集中管理与续费提醒</p></div><AppButton @click="emit('add')"><IconPlus :size="16"/>添加域名</AppButton></div>
    <div class="domain-toolbar"><div class="domain-filters" role="group" aria-label="域名状态筛选"><button :class="{selected:filter==='all'}" :aria-pressed="filter==='all'" @click="filter='all'">全部 <span>{{items.length}}</span></button><button :class="{selected:filter==='due'}" :aria-pressed="filter==='due'" @click="filter='due'">待续费 <span>{{pending}}</span></button><button :class="{selected:filter==='missing'}" :aria-pressed="filter==='missing'" @click="filter='missing'">未设到期日 <span>{{missing}}</span></button></div><el-input v-model="search" class="domain-search" placeholder="搜索域名、注册商或 DNS" aria-label="搜索域名" clearable><template #prefix><IconSearch :size="17"/></template></el-input></div>
    <AppCard v-if="!domains.length"><el-empty :description="items.length?'没有匹配的域名':'记录你的第一个域名'"><AppButton v-if="!items.length" @click="emit('add')">添加域名</AppButton><el-button v-else @click="search='';filter='all'">清除筛选</el-button></el-empty></AppCard>
    <template v-else>
      <AppCard class="domain-table-card" padding="flush"><el-table class="domain-desktop-table" :data="domains" :row-class-name="({row})=>renewalLevel(row.renewal)" row-key="id">
        <el-table-column label="域名 / 注册商" min-width="260"><template #default="{row}"><div class="domain-identity"><div class="domain-name-row"><strong>{{row.name}}</strong><ElTooltip content="复制域名"><button class="domain-copy" :aria-label="'复制 '+row.name" @click="copy(row.name)"><IconCopy :size="14"/></button></ElTooltip></div><div class="domain-provider"><img v-if="isAliyun(row)" src="/brands/aliyun.svg" alt="阿里云" width="65" height="16"><span v-else>{{row.provider||'未填写注册商'}}</span><small v-if="noteValue(row,'注册时间')">{{noteValue(row,'注册时间').slice(0,10)}} 注册</small></div></div></template></el-table-column>
        <el-table-column label="到期日期" width="190"><template #default="{row}"><div class="domain-expiry"><span>{{row.renewal||'未设置'}}</span><el-tag size="small" :type="tagType(row)" effect="light">{{expiry(row)}}</el-tag></div></template></el-table-column>
        <el-table-column label="DNS 服务器" min-width="180"><template #default="{row}"><div class="domain-dns"><span v-for="host in dns(row)" :key="host">{{host}}</span><span v-if="!dns(row).length">未填写</span></div></template></el-table-column>
        <el-table-column label="自动续费" width="110"><template #default="{row}"><el-tag :type="noteValue(row,'自动续费')==='开启'?'primary':'info'" size="small" effect="plain">{{noteValue(row,'自动续费')==='开启'?'已开启':noteValue(row,'自动续费')==='关闭'?'未开启':'未记录'}}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="126" align="right" fixed="right"><template #default="{row}"><div class="domain-table-actions"><el-button size="small" :aria-label="'管理 '+row.name" @click="emit('edit',row)">管理</el-button><ElTooltip content="删除域名"><el-button type="danger" text size="small" :aria-label="'删除 '+row.name" @click="emit('delete',row)"><IconTrash :size="15" /></el-button></ElTooltip></div></template></el-table-column>
      </el-table></AppCard>
      <div class="domain-mobile-list"><AppCard tag="article" v-for="item in domains" :key="item.id" :class="renewalLevel(item.renewal)"><div class="domain-identity"><strong>{{item.name}}</strong><div class="domain-provider"><img v-if="isAliyun(item)" src="/brands/aliyun.svg" alt="阿里云" width="65" height="16"><span v-else>{{item.provider||'未填写注册商'}}</span></div></div><el-descriptions :column="2" size="small" direction="vertical"><el-descriptions-item label="到期日期">{{item.renewal||'未设置'}}<br><el-tag :type="tagType(item)" size="small">{{expiry(item)}}</el-tag></el-descriptions-item><el-descriptions-item label="自动续费">{{noteValue(item,'自动续费')==='开启'?'已开启':noteValue(item,'自动续费')==='关闭'?'未开启':'未记录'}}</el-descriptions-item><el-descriptions-item label="DNS 服务器" :span="2"><div class="domain-dns"><span v-for="host in dns(item)" :key="host">{{host}}</span><span v-if="!dns(item).length">未填写</span></div></el-descriptions-item></el-descriptions><div class="domain-row-actions"><el-button :aria-label="'管理 '+item.name" @click="emit('edit',item)">管理</el-button><el-button type="danger" text :aria-label="'删除 '+item.name" @click="emit('delete',item)"><IconTrash :size="16" /></el-button></div></AppCard></div>
    </template>
  </section>
</template>
