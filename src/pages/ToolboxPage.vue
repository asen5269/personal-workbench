<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { LuckyWheel } from 'lucky-canvas'
import { ElMessage, ElImage, ElSelect, ElOption } from 'element-plus'
import { IconToolsKitchen2, IconSettings, IconPlus, IconTrash, IconPhoto, IconPencil } from '@tabler/icons-vue'
import AppDialog from '../components/AppDialog.vue'
import '../css/toolbox-base.css'
import '../css/wheel.css'
import {IconCheck,IconArrowRight} from '@tabler/icons-vue'
import foodPhotos from '../state/food-photos.json'
const props=defineProps({mode:String})
const food=computed(()=>props.mode==='food'),items=ref([]),pool=ref('全部'),chosen=ref(null),busy=ref(false),loading=ref(true),problem=ref(''),dialog=ref(false),draft=ref([]),saving=ref(false),uploading=ref(false),wheelRoot=ref(null)
const options=computed(()=>items.value.filter(x=>!food.value||pool.value==='全部'||x.category===pool.value))
const failedPhotos=ref(new Set())
const currentPhoto=computed(()=>chosen.value?.image||options.value[0]?.image||foodPhotos[0].image)
const foodSearch=ref(''),visibleFoods=ref(12)
const matchingFoods=computed(()=>options.value.filter(x=>x.image&&x.name.includes(foodSearch.value.trim())))
const featured=computed(()=>matchingFoods.value.slice(0,visibleFoods.value))
watch([pool,foodSearch],()=>visibleFoods.value=12)
const categories=computed(()=>['全部',...new Set(items.value.map(x=>x.category).filter(Boolean))])
const wheelColors=['#dcece1','#f6dfc5','#e3dff3','#dce9f3','#f3dcdf','#f1eccf']
const totalWeight=computed(()=>items.value.reduce((sum,item)=>sum+item.weight,0))
let wheel,timer,themeObserver,disposed=false,targetIndex=0
async function api(path='',init){const response=await fetch('/api/toolbox'+path,init);const data=await response.json();if(!response.ok)throw Error(data.error||'操作失败');return data}
function select(){const sum=options.value.reduce((n,x)=>n+x.weight,0);let value=Math.random()*sum;return options.value.findIndex(x=>(value-=x.weight)<0)}
function finish(index){if(disposed)return;chosen.value=options.value[index];busy.value=false}
function spin(){if(busy.value||!options.value.length)return;busy.value=true;const index=Math.max(0,select());if(matchMedia('(prefers-reduced-motion: reduce)').matches||food.value){timer=setTimeout(()=>finish(index),180);return}targetIndex=index;wheel.play();timer=setTimeout(()=>wheel.stop(index),240)}
function configureWheel(){
  if(!wheelRoot.value||!items.value.length)return
  const prizes=items.value.map((x,i)=>({background:wheelColors[i%wheelColors.length],fonts:[{text:x.name,top:x.image?'44%':'24%',fontSize:items.value.length>12?'12px':'16px',fontColor:'#294239',fontWeight:'600',lengthLimit:'82%'}],...(x.image?{imgs:[{src:x.image,width:'36px',height:'36px',top:'8%'}]}:{})}))
  const blocks=[{padding:'2px',background:'#dce5df'},{padding:'10px',background:'#ffffff'}]
  const buttons=[{radius:'18%',background:'#ffffff',pointer:false,fonts:[{text:'开始',top:'-10px',fontSize:'18px',fontColor:'#294239'}]}]
  if(wheel){wheel.prizes=prizes;wheel.blocks=blocks;wheel.buttons=buttons;return}
  wheel=new LuckyWheel(wheelRoot.value,{width:'440px',height:'440px',blocks,prizes,buttons,defaultConfig:{speed:16,accelerationTime:180,decelerationTime:360},start:spin,end:()=>finish(targetIndex)})
}
function edit(){draft.value=structuredClone(items.value.map(x=>({...x})));dialog.value=true}
function add(){draft.value.unshift({id:crypto.randomUUID(),name:'',weight:1,image:'',...(food.value?{category:'米饭',portion:'一份',calories:null,protein:null,carbs:null,fat:null,advice:'',source:''}:{})})}
async function image(event,item){const file=event.target.files?.[0];event.target.value='';if(!file)return;if(file.size>2*1024*1024)return ElMessage.error('图片最大 2MB');uploading.value=true;try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});const result=await api('/image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:data})});item.image=result.image}catch(e){ElMessage.error(e.message)}finally{uploading.value=false}}
async function save(){saving.value=true;try{await api('/'+props.mode,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft.value)});items.value=structuredClone(draft.value.map(x=>({...x})));pool.value='全部';chosen.value=null;dialog.value=false;await nextTick();configureWheel();ElMessage.success('配置已保存')}catch(e){ElMessage.error(e.message)}finally{saving.value=false}}
onMounted(async()=>{try{items.value=await api('/'+props.mode);await nextTick();configureWheel();if(!food.value){themeObserver=new MutationObserver(()=>configureWheel());themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['style','class','data-theme']})}}catch(e){problem.value=e.message}finally{loading.value=false}})
onBeforeUnmount(()=>{disposed=true;themeObserver?.disconnect();clearTimeout(timer);wheel?.stop(-1)})
</script>
<template>
  <section class="toolbox-page" :class="{'food-planner':food,'wheel-studio':!food}"><header class="toolbox-heading"><div><span v-if="food" class="toolbox-eyebrow">每日选餐</span><h1>{{food?'今天吃什么？':'幸运大转盘'}}</h1><p v-if="!food" class="wheel-intro">把犹豫交给转盘。</p></div><el-button :disabled="loading||busy||!!problem" @click="edit"><IconSettings :size="17"/>{{food?'管理美食':'编辑选项'}}</el-button></header>
    <el-alert v-if="problem" :title="problem" type="error" :closable="false"/>
    <div v-if="food" class="toolbox-categories"><el-button v-for="c in categories" :key="c" :type="pool===c?'primary':'default'" :disabled="busy" @click="pool=c;chosen=null">{{c}}</el-button></div>
    <div class="toolbox-layout" :class="{'is-food':food}"><div class="toolbox-stage" :class="{'is-choosing':busy}"><template v-if="food"><div class="food-art"><Transition name="food-photo" mode="out-in"><ElImage v-if="!failedPhotos.has(currentPhoto)" :key="currentPhoto" :src="currentPhoto" :alt="chosen?.image?chosen.name:'美食实拍'" fit="contain" :preview-src-list="[currentPhoto]" preview-teleported hide-on-click-modal referrerpolicy="no-referrer" @error="failedPhotos.add(currentPhoto)"/><div v-else class="food-photo-unavailable"><IconPhoto :size="44"/><span>图片暂不可用</span></div></Transition></div><Transition name="toolbox-result" mode="out-in"><div class="food-choice-info" :key="chosen?.id||'empty'"><h2>{{chosen?.name||'这一餐，交给随机'}}</h2><p>{{chosen?chosen.category:'从 '+options.length+' 道美食里，选出今天想吃的。'}}</p></div></Transition></template><div v-else class="wheel-artboard"><div class="wheel-halo" aria-hidden="true"/><div ref="wheelRoot" class="toolbox-wheel"/><span class="wheel-fixed-pointer" aria-hidden="true"></span></div><el-button type="primary" size="large" :loading="busy||loading" :disabled="!options.length||!!problem" @click="spin">{{busy?'选择中…':chosen?'再选一次':'开始选择'}}</el-button><p class="toolbox-stage-note">{{options.length}} 个选项 · {{food?'可按分类筛选':'按配置权重随机抽取'}}</p></div>
    <aside v-if="!food" class="toolbox-detail wheel-ticket">
      <div class="wheel-ticket-result" aria-live="polite" role="status"><div class="wheel-result-label"><span>本次结果</span><span class="wheel-status-dot" :class="{'is-busy':busy}">{{busy?'选择中':chosen?'已选出':'等待开始'}}</span></div><Transition name="toolbox-result" mode="out-in"><div :key="busy?'busy':chosen?.id||'waiting'"><h2>{{busy?'转动中…':chosen?.name||'会是哪一个？'}}</h2><p>{{busy?'正在随机抽取，请稍候':chosen?'已经选好了，试着去做吧。':'点击开始，选出接下来要做的事。'}}</p></div></Transition><img v-if="chosen?.image&&!busy" class="wheel-result-image" :src="chosen.image" alt="所选选项图片"/></div>
      <div class="wheel-pool-heading"><h3>候选选项</h3><span>{{items.length}} 项</span></div>
      <div class="wheel-options"><div v-for="(item,i) in items" :key="item.id" :class="{'is-picked':chosen?.id===item.id&&!busy}"><span class="wheel-option-swatch" :style="{background:wheelColors[i%wheelColors.length]}" aria-hidden="true"/><span class="wheel-option-name">{{item.name}}</span><IconCheck v-if="chosen?.id===item.id&&!busy" class="wheel-option-check" :size="16"/><small v-else>{{(item.weight/totalWeight*100).toFixed(1)}}%</small></div></div>
      <button class="wheel-edit-link" :disabled="busy||loading||!!problem" @click="edit">添加或调整选项<IconArrowRight :size="15"/></button>
    </aside></div>
    <div v-if="food" class="food-gallery-heading"><div><h2>美食灵感 <span>{{matchingFoods.length}}</span></h2><p>找到喜欢的，点一下就选它。</p></div><el-input v-model="foodSearch" placeholder="搜索美食" aria-label="搜索美食" clearable/></div>
    <div v-if="food&&featured.length" class="food-featured"><button v-for="item in featured" :key="item.id" :disabled="busy" @click="chosen=item"><img v-if="!failedPhotos.has(item.image)" :src="item.image" :alt="item.name" loading="lazy" referrerpolicy="no-referrer" @error="failedPhotos.add(item.image)"/><span v-else class="food-photo-unavailable">图片暂不可用</span><span>{{item.name}}</span><small>{{item.category||'美食'}} <span>选这一餐 ↗</span></small></button></div>
    <div v-if="food" class="food-gallery-footer"><el-button v-if="visibleFoods<matchingFoods.length" @click="visibleFoods+=12">再看 12 道</el-button><span v-else-if="!matchingFoods.length">没有找到匹配的美食</span></div>
    <AppDialog v-model="dialog" :title="food?'管理美食':'配置转盘'" :width="760" :show-close="!saving"><div class="toolbox-edit-list"><article v-for="(item,i) in draft" :key="item.id" class="toolbox-edit-row" :class="{'food-edit-card':food}"><template v-if="food"><div class="food-edit-cover"><img v-if="item.image" :src="item.image" :alt="item.name||'美食图片'" referrerpolicy="no-referrer"/><div v-else class="food-edit-placeholder"><IconPhoto :size="28"/><span>添加图片</span></div><div class="food-edit-actions"><label class="food-edit-action" :aria-label="item.image?'更换图片':'上传图片'"><IconPencil :size="16"/><input type="file" accept="image/png,image/jpeg,image/webp" :disabled="uploading||saving" :aria-label="item.image?'更换图片':'上传图片'" @change="image($event,item)"/></label><button type="button" class="food-edit-action is-delete" :disabled="draft.length<=2||saving" :aria-label="'删除 '+(item.name||'选项')" @click="draft.splice(i,1)"><IconTrash :size="16"/></button></div></div><div class="food-edit-name"><el-input v-model="item.name" maxlength="30" placeholder="输入美食名称" :aria-label="'美食名称 '+(i+1)"/><ElSelect v-model="item.category" class="food-edit-category" placeholder="选择分类" :aria-label="'菜品分类 '+(i+1)"><ElOption v-for="c in ['米饭','面食','粉类','汤食','炒菜','快餐','轻食']" :key="c" :label="c" :value="c"/></ElSelect></div></template><template v-else><div class="toolbox-option-fields" :class="{'food-option-fields':food}"><el-input v-model="item.name" maxlength="30" placeholder="选项名称" :aria-label="'选项名称 '+(i+1)"/><el-input-number v-if="!food" v-model="item.weight" :min="1" :max="100" :precision="0" aria-label="抽中权重"/><label class="toolbox-upload"><img v-if="item.image" :src="item.image" alt="选项图片"/><IconPhoto v-else :size="20"/><input type="file" accept="image/png,image/jpeg,image/webp" :disabled="uploading||saving" aria-label="上传选项图片" @change="image($event,item)"/></label><el-button type="danger" text :disabled="draft.length<=2||saving" :aria-label="'删除选项 '+(i+1)" @click="draft.splice(i,1)"><IconTrash :size="18"/></el-button></div><el-button v-if="item.image" text size="small" @click="item.image=''">移除图片</el-button></template></article></div><div class="toolbox-edit-toolbar"><el-button class="toolbox-add" :disabled="draft.length>=(food?200:24)||saving" @click="add"><IconPlus :size="17"/>添加选项</el-button><p class="toolbox-data-note">{{food?'保留 2–200 项，图片最大 2MB。':'保留 2–24 项，权重越大越容易选中；图片最大 2MB。'}}</p></div><template #footer><el-button :disabled="saving" @click="dialog=false">取消</el-button><el-button type="primary" :loading="saving" :disabled="uploading" @click="save">保存配置</el-button></template></AppDialog>
  </section>
</template>

