<script setup>
import {computed,onMounted,ref} from 'vue'
import {ElPagination,ElSkeleton} from 'element-plus'
import AppDialog from './AppDialog.vue'
import {netease} from '../utils/netease-client.js'
const detailsOpen=ref(false),selected=ref(null),busy=ref(true)
const catalog=ref({items:[],version:'',count:0}),query=ref(''),category=ref(''),status=ref(''),page=ref(1),error=ref('')
const categories=computed(()=>[...new Set(catalog.value.items.map(x=>x.category))])
const filtered=computed(()=>catalog.value.items.filter(x=>(!category.value||x.category===category.value)&&(!status.value||x.integration===status.value)&&`${x.method} ${x.title} ${x.path}`.toLowerCase().includes(query.value.toLowerCase())))
const labels={player:'播放器已接入',directory:'仅目录，未接入',restricted:'底层或特殊接口，未开放'}
async function load(){try{catalog.value=await netease('catalog')}catch(e){error.value=e.message}finally{busy.value=false}}
onMounted(load)
</script>
<template>
  <section class="music-api-catalog"><div class="music-list-title"><h2>全部接口目录</h2><el-tag>v{{catalog.version}}</el-tag><el-tag type="info">{{catalog.count}} 个模块</el-tag></div><p class="music-feature-hint">此目录来自当前安装版本。标为“仅目录”的功能没有可用入口，不代表已完成接入；实际调用仍可能需要登录或受上游限制。</p><div class="music-catalog-filters"><el-input v-model="query" clearable placeholder="搜索接口名、路径或说明" @input="page=1"/><el-select v-model="category" clearable placeholder="分类" @change="page=1"><el-option v-for="c in categories" :key="c" :label="c" :value="c"/></el-select><el-select v-model="status" clearable placeholder="接入状态" @change="page=1"><el-option v-for="(label,key) in labels" :key="key" :label="label" :value="key"/></el-select></div><el-alert v-if="error" :title="error" type="error" :closable="false"/><ElSkeleton v-if="busy" :rows="6"/><el-table v-else :data="filtered.slice((page-1)*20,page*20)" row-key="method" class="music-table"><el-table-column label="详情" width="70"><template #default="{row}"><el-button text size="small" @click="selected=row;detailsOpen=true">查看</el-button></template></el-table-column><el-table-column prop="method" label="接口模块" min-width="220" show-overflow-tooltip/><el-table-column prop="title" label="说明" min-width="180" show-overflow-tooltip/><el-table-column prop="category" label="分类" width="100"/><el-table-column label="接入状态" min-width="150"><template #default="{row}"><el-tag :type="row.integration==='player'?'success':'info'" size="small">{{labels[row.integration]}}</el-tag></template></el-table-column></el-table><ElPagination v-model:current-page="page" :page-size="20" :total="filtered.length" layout="total, prev, pager, next" class="music-catalog-pages"/><AppDialog v-model="detailsOpen" :title="selected?.method||'接口详情'" :width="560"><div v-if="selected" class="music-api-detail"><p>{{selected.title}}</p><p>路径：{{selected.path}}</p><p>状态：{{labels[selected.integration]}}</p><p>参数提示：{{selected.params.join('、')||'参考源码与文档'}}</p><p>参数由当前安装包源码提取，不替代接口文档。</p><el-link :href="selected.source" target="_blank" rel="noopener noreferrer" underline="never">查看仓库源码</el-link></div><template #footer><el-button @click="detailsOpen=false">关闭</el-button></template></AppDialog></section>
</template>
