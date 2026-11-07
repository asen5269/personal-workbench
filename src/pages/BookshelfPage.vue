<script setup>
import {ref,computed,onMounted,onBeforeUnmount,watch,nextTick} from 'vue'
import {ElMessage,ElMessageBox,ElColorPicker} from 'element-plus'
import {IconBook,IconUpload,IconArrowLeft,IconSettings,IconTrash,IconList,IconSearch,IconMaximize,IconMinimize,IconLayoutGrid} from '@tabler/icons-vue'
import '../css/bookshelf.css'
import {useRoute} from 'vue-router'
import {bookshelfStorage as storage,listBooks} from '../utils/bookshelf-storage.js'
const route=useRoute()
const books=ref([]),book=ref(null),query=ref(''),picker=ref(null),busy=ref(false),page=ref(0),settings=ref(false),problem=ref('')
const directory=ref(true),sort=ref('recent'),reading=ref({})
const reader=ref(null),fullscreen=ref(false)
function syncFullscreen(){fullscreen.value=document.fullscreenElement===reader.value}
async function toggleFullscreen(){try{if(fullscreen.value)await document.exitFullscreen();else await reader.value.requestFullscreen()}catch{ElMessage.error('当前浏览器无法进入全屏阅读')}}
async function backToShelf(){if(fullscreen.value)await document.exitFullscreen();book.value=null}
onMounted(()=>document.addEventListener('fullscreenchange',syncFullscreen))
onBeforeUnmount(()=>document.removeEventListener('fullscreenchange',syncFullscreen))
const size=5000
function saved(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
const gridView=ref(saved('bookshelf-grid-view',false)===true),shelf=ref(null)
let layoutAnimations=[]
async function toggleLayout(){
 layoutAnimations.forEach(a=>a.cancel())
 const nodes=[...(shelf.value?.querySelectorAll('.shelf-book')||[])],before=nodes.map(n=>n.getBoundingClientRect())
 gridView.value=!gridView.value
 try{localStorage.setItem('bookshelf-grid-view',JSON.stringify(gridView.value))}catch{}
 await nextTick()
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return
 const style=getComputedStyle(document.documentElement)
 layoutAnimations=nodes.map((node,i)=>{const after=node.getBoundingClientRect(),old=before[i];return node.animate([{transformOrigin:'top left',transform:`translate(${old.x-after.x}px,${old.y-after.y}px) scale(${old.width/after.width},${old.height/after.height})`,opacity:.55},{transformOrigin:'top left',transform:'none',opacity:1}],{duration:280,easing:style.getPropertyValue('--ease').trim()||'cubic-bezier(.22,.7,.25,1)'})})
}
onBeforeUnmount(()=>layoutAnimations.forEach(a=>a.cancel()))
const preferences=ref(saved('bookshelf-settings',{font:'serif',size:20,line:1.9,background:'paper'}))
preferences.value.background='white'
const papers=[
 {id:'plain',name:'纯白',ink:'#282828'},
 {id:'xuan',name:'宣纸',ink:'#463e32'},
 {id:'cream',name:'米黄书页',ink:'#4b4030'},
 {id:'green',name:'护眼绿',ink:'#304536'},
 {id:'blue',name:'雾蓝',ink:'#344655'},
 {id:'gray',name:'浅灰',ink:'#353535'},
 {id:'night',name:'夜间',ink:'#d6d2c9'},
]
preferences.value.texture=papers.some(p=>p.id===preferences.value.texture)?preferences.value.texture:'plain'
preferences.value.ink=/^#[0-9a-f]{6}$/i.test(preferences.value.ink||'')?preferences.value.ink:'#282828'
watch(()=>preferences.value.texture,id=>{preferences.value.ink=papers.find(p=>p.id===id)?.ink||'#282828'})
const fonts={serif:'"Noto Serif SC","SimSun",serif',sans:'"Noto Sans SC Variable",sans-serif',kai:'"KaiTi","STKaiti",serif'}
const appearance=computed(()=>({'--reader-font':fonts[preferences.value.font]||fonts.serif,'--reader-size':preferences.value.size+'px','--reader-line':preferences.value.line,'--novel-ink':preferences.value.ink||'#282828'}))
watch(preferences,value=>{try{localStorage.setItem('bookshelf-settings',JSON.stringify(value))}catch{ElMessage.error('阅读设置保存失败')}},{deep:true})
async function load(){try{books.value=await listBooks()}catch{problem.value='无法读取书架，请检查浏览器存储权限。'}}
async function upload(event){
 const files=[...event.target.files];event.target.value='';busy.value=true;problem.value=''
 try{for(const file of files){
  if(!/\.txt$/i.test(file.name)||!file.size||file.size>20*1024**2){problem.value='仅支持非空 TXT 小说，单本最大 20MB。';continue}
  const bytes=await file.arrayBuffer();let text
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{text=new TextDecoder('gb18030').decode(bytes)}
  text=text.replace(/\r\n?/g,'\n').replace(/\0/g,'').trim()
  if(!text){problem.value='文件没有可阅读的文字。';continue}
  await storage('readwrite',s=>s.put({id:crypto.randomUUID(),title:file.name.replace(/\.txt$/i,''),text,created:Date.now(),length:text.length}))
 }await load()}catch{problem.value='导入失败，浏览器存储空间可能不足。'}finally{busy.value=false}
}
const filtered=computed(()=>books.value.filter(b=>b.title.toLowerCase().includes(query.value.toLowerCase())).sort((a,b)=>sort.value==='title'?a.title.localeCompare(b.title,'zh'):sort.value==='reading'?(reading.value[b.id]?.time||0)-(reading.value[a.id]?.time||0):b.created-a.created))
const headings=computed(()=>book.value?[...book.value.text.matchAll(/^(?:第[零〇一二三四五六七八九十百千万两\d]+[章节卷回部篇].{0,65}|序章.{0,40}|前言|后记|尾声)[ \t]*$/gm)]:[])
const pages=computed(()=>{
 if(!book.value)return []
 const text=book.value.text,result=[],boundaries=[...headings.value.map(m=>m.index).filter(n=>n>0),text.length]
 let start=0
 for(const boundary of boundaries){while(start<boundary){let end=Math.min(start+size,boundary);if(end<boundary){const line=text.lastIndexOf('\n',end);if(line>start)end=line+1;else if(end>start&&/[\uD800-\uDBFF]/.test(text[end-1]))end--}result.push({start,end});start=end}}
 return result
})
const count=computed(()=>pages.value.length)
const content=computed(()=>{const p=pages.value[page.value];return p?book.value.text.slice(p.start,p.end):''})
const paragraphs=computed(()=>content.value.split('\n').map(text=>text.trim()).filter(Boolean).map(text=>({text,heading:headings.value.some(h=>h[0].trim()===text)})))
const chapters=computed(()=>headings.value.map(m=>({title:m[0].trim(),page:pages.value.findIndex(p=>p.start===m.index)})))
const chapter=computed(()=>{const list=chapters.value.filter(c=>c.page<=page.value);return list.at(-1)?.title||'正文'})
const progress=computed(()=>book.value?Math.round((pages.value[page.value]?.start||0)/book.value.text.length*100):0)
async function open(item){try{book.value=await storage('readonly',s=>s.get(item.id));page.value=Math.min(Math.max(0,Number(saved('book-page-'+item.id,0))||0),count.value-1)}catch{ElMessage.error('书籍读取失败')}}
function remember(){if(!book.value)return;const mark={page:page.value,progress:Math.round((pages.value[page.value]?.start||0)/book.value.text.length*100),time:Date.now()};reading.value[book.value.id]=mark;try{localStorage.setItem('book-page-'+book.value.id,JSON.stringify(page.value));localStorage.setItem('bookshelf-reading',JSON.stringify(reading.value))}catch{}}
watch([page,book],remember)
function turn(value){page.value=Math.max(0,Math.min(count.value-1,value));document.querySelector('.novel-text')?.scrollTo({top:0,behavior:'instant'})}
async function remove(item){try{await ElMessageBox.confirm('移除「'+item.title+'」？','移除书籍',{confirmButtonText:'移除',cancelButtonText:'取消'});await storage('readwrite',s=>s.delete(item.id));await load()}catch(e){if(e!=='cancel'&&e!=='close')ElMessage.error('移除失败')}}
function readProgress(item){const mark=reading.value[item.id];return mark?mark.progress??Math.min(100,Math.round(mark.page/Math.ceil(item.length/size)*100)):0}
onMounted(async()=>{reading.value=saved('bookshelf-reading',{});await load();const item=books.value.find(book=>book.id===route.query.book);if(route.name==='bookshelf'&&item)await open(item)})
</script>
<template>
 <section class="bookshelf-page" :class="{'is-reading':book}">
  <template v-if="!book">
   <div class="shelf-toolbar">
    <el-input v-model="query" placeholder="搜索书名" clearable aria-label="搜索书名"><template #prefix><IconSearch :size="18"/></template></el-input>
    <span class="shelf-count">{{books.length}} 本</span>
    <el-select v-model="sort" aria-label="书籍排序"><el-option label="最近导入" value="recent"/><el-option label="最近阅读" value="reading"/><el-option label="书名排序" value="title"/></el-select>
    <el-button class="shelf-view-toggle" :aria-label="gridView?'列表视图':'宫格视图'" :title="gridView?'列表视图':'宫格视图'" :aria-pressed="gridView" @click="toggleLayout"><component :is="gridView?IconList:IconLayoutGrid" :size="20"/></el-button>
    <el-button type="primary" :loading="busy" @click="picker.click()"><IconUpload :size="18"/>导入小说</el-button>
   </div>
   <input ref="picker" type="file" accept=".txt,text/plain" multiple hidden @change="upload"/>
   <el-alert v-if="problem" :title="problem" type="error" :closable="false"/>
   <div v-if="!filtered.length" class="shelf-empty"><IconBook :size="32"/><p>{{query?'没有匹配的书籍':'暂无书籍'}}</p><el-button v-if="!query" text :loading="busy" @click="picker.click()">导入 TXT</el-button></div>
   <div v-else ref="shelf" class="bookshelf-grid" :class="{'is-grid':gridView}">
    <article v-for="item in filtered" :key="item.id" class="shelf-book">
     <button class="book-open" :aria-label="'阅读 '+item.title" @click="open(item)">
      <span class="book-cover" aria-hidden="true"><IconBook :size="28"/><small>TXT</small></span>
      <span class="book-details"><strong>{{item.title}}</strong><span class="book-meta">{{new Intl.NumberFormat('zh-CN').format(item.length)}} 字<span>·</span>{{reading[item.id]?'已读 '+readProgress(item)+'%':'未开始'}}</span><span class="book-track"><i :style="{transform:'scaleX('+readProgress(item)/100+')'}"/></span><span class="book-status">{{reading[item.id]?'继续阅读':'开始阅读'}} →</span></span>
     </button>
     <el-button class="book-remove" text :aria-label="'移除 '+item.title" @click="remove(item)"><IconTrash :size="16"/></el-button>
    </article>
   </div>
  </template>
  <div v-else ref="reader" class="novel-reader" :class="['reader-'+preferences.background,{'has-directory':directory,'has-settings':settings}]" :style="appearance">
   <header class="reader-heading">
    <el-button text @click="backToShelf"><IconArrowLeft :size="18"/>返回</el-button>
    <div class="reader-title"><strong>{{book.title}}</strong><small>{{chapter}}</small></div>
    <div class="reader-actions"><el-button text :aria-pressed="fullscreen" :aria-label="fullscreen?'退出阅读模式':'阅读模式'" @click="toggleFullscreen"><component :is="fullscreen?IconMinimize:IconMaximize" :size="18"/>{{fullscreen?'退出全屏':'阅读模式'}}</el-button><el-button text :aria-pressed="directory" aria-label="章节目录" @click="directory=!directory"><IconList :size="18"/></el-button><el-button text :aria-expanded="settings" aria-label="阅读设置" @click="settings=!settings"><IconSettings :size="18"/></el-button></div>
   </header>
   <div class="reader-workspace">
    <Transition name="reader-panel"><aside v-if="directory" class="reader-directory"><h2>目录 <small>{{chapters.length}}</small></h2><p v-if="!chapters.length" class="reader-muted">未识别到章节</p><nav v-else aria-label="小说章节"><button v-for="(c,i) in chapters" :key="i" :aria-current="c.page===page?'location':undefined" :class="{selected:c.title===chapter}" @click="turn(c.page)"><small>{{String(i+1).padStart(2,'0')}}</small><span>{{c.title}}</span></button></nav></aside></Transition>
    <div class="reader-paper" :class="'paper-'+preferences.texture"><article class="novel-text" tabindex="0" aria-label="小说正文" @keydown.right.prevent="turn(page+1)" @keydown.left.prevent="turn(page-1)"><template v-for="(paragraph,i) in paragraphs" :key="page+'-'+i"><h2 v-if="paragraph.heading" class="novel-chapter-title">{{paragraph.text}}</h2><p v-else>{{paragraph.text}}</p></template></article>
     <footer class="reader-pagination"><el-button text :disabled="page===0" @click="turn(page-1)">上一页</el-button><span>{{page+1}} / {{count}}</span><el-button text :disabled="page>=count-1" @click="turn(page+1)">下一页</el-button></footer>
    </div>
    <Transition name="reader-panel"><aside v-if="settings" class="reader-settings">
     <h2>阅读设置</h2>
     <label>字体<el-select v-model="preferences.font" :teleported="false" aria-label="阅读字体"><el-option label="宋体" value="serif"/><el-option label="黑体" value="sans"/><el-option label="楷体" value="kai"/></el-select></label>
     <label>字号<el-input-number v-model="preferences.size" :min="14" :max="36" :step="2" aria-label="阅读字号"/></label>
     <label>行距<el-input-number v-model="preferences.line" :min="1.4" :max="2.8" :step=".1" :precision="1" aria-label="阅读行距"/></label>
     <label>字体颜色<ElColorPicker v-model="preferences.ink" :teleported="false" :predefine="['#282828','#51483c','#405442','#465268','#703f3f']" aria-label="字体颜色"/></label>
     <label>纸张与配色<el-select v-model="preferences.texture" :teleported="false" aria-label="纸张与配色"><el-option v-for="paper in papers" :key="paper.id" :label="paper.name" :value="paper.id"/></el-select></label>
     <div class="reader-position"><span>阅读进度</span><strong>{{progress}}%</strong></div>
    </aside></Transition>
   </div>
  </div>
 </section>
</template>
