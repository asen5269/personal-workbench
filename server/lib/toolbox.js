import foodPhotos from '../../src/state/food-photos.json' with { type: 'json' }
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
const foods=[['黄焖鸡米饭','米饭'],['宫保鸡丁饭','米饭'],['卤肉饭','米饭'],['咖喱鸡饭','米饭'],['牛肉面','面食'],['兰州拉面','面食'],['桂林米粉','粉类'],['螺蛳粉','粉类'],['凉皮','面食'],['饺子','面食'],['麻辣烫','汤食'],['麻辣香锅','炒菜'],['汉堡','快餐'],['披萨','快餐'],['寿司','快餐'],['鸡肉沙拉','轻食']].map(([name,category],i)=>({id:String(i),name,category,weight:1,image:foodPhotos.find(x=>x.name===name)?.image||'',portion:'一份（具体份量以商家为准）',calories:null,protein:null,carbs:null,fat:null,advice:'可搭配一份蔬菜，按口味选择酱料。',source:''}))
for(const photo of foodPhotos)if(!foods.some(x=>x.name===photo.name))foods.push({id:'food-'+foods.length,name:photo.name,category:/饭$/.test(photo.name)?'米饭':/面|馄饨|包|饼/.test(photo.name)?'面食':/粉/.test(photo.name)?'粉类':'炒菜',weight:1,image:photo.image})
export function registerToolbox(app,db){
  db.exec('CREATE TABLE IF NOT EXISTS toolbox (kind TEXT PRIMARY KEY,data TEXT NOT NULL)')
  const initial={food:foods,wheel:['看电影','喝奶茶','散步','读书','听歌','休息'].map((name,i)=>({id:String(i),name,weight:1,image:''}))}
  for(const kind of ['food','wheel'])db.prepare('INSERT OR IGNORE INTO toolbox VALUES (?,?)').run(kind,JSON.stringify(initial[kind]))
  app.get('/api/toolbox/:kind',(req,reply)=>{const data=db.prepare('SELECT data FROM toolbox WHERE kind=?').get(req.params.kind);return data?JSON.parse(data.data):reply.code(404).send({error:'工具不存在'})})
  app.put('/api/toolbox/:kind',(req,reply)=>{
    const items=req.body
    if(!['food','wheel'].includes(req.params.kind)||!Array.isArray(items)||items.length<2||items.length>(req.params.kind==='food'?200:24)||new Set(items.map(x=>x?.id)).size!==items.length||items.some(x=>!x||typeof x.name!=='string'||!x.name.trim()||x.name.length>30||typeof x.id!=='string'||!Number.isFinite(x.weight)||x.weight<=0||x.weight>100||typeof x.image!=='string'||(x.image&&!/^\/toolbox-images\/[a-z0-9-]+\.png$/.test(x.image)&&!/^https?:\/\/[^\s]+$/i.test(x.image))||['calories','protein','carbs','fat'].some(key=>x[key]!=null&&(!Number.isFinite(x[key])||x[key]<0))))return reply.code(400).send({error:'请填写名称和有效权重；美食限 2–200 项，转盘限 2–24 项'})
    db.prepare('UPDATE toolbox SET data=? WHERE kind=?').run(JSON.stringify(items),req.params.kind);return {saved:true}
  })
  app.post('/api/toolbox/image',{bodyLimit:3*1024*1024},async(req,reply)=>{
    const match=String(req.body?.image||'').match(/^data:image\/(?:png|jpeg|webp);base64,(.+)$/s)
    if(!match)return reply.code(400).send({error:'请选择 PNG、JPG 或 WebP 图片'})
    try{const bytes=Buffer.from(match[1],'base64');if(bytes.length>2*1024*1024)throw Error();const output=await sharp(bytes,{limitInputPixels:20e6}).resize(256,256,{fit:'cover',withoutEnlargement:true}).png().toBuffer();const dir=join(process.env.WORKBENCH_DATA_DIR?join(process.env.WORKBENCH_DATA_DIR,'public'):join(import.meta.dirname,'../../public'),'toolbox-images');await mkdir(dir,{recursive:true});const name=crypto.randomUUID()+'.png';await writeFile(join(dir,name),output);return {image:'/toolbox-images/'+name}}catch{return reply.code(400).send({error:'图片无效或超过 2MB'})}
  })
}
