import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir,mkdtemp,readFile,writeFile,rm } from 'node:fs/promises'
import { join,relative,resolve,isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { unzipSync,strFromU8,zipSync,strToU8 } from 'fflate'
import { Document,Packer,Paragraph,ImageRun } from 'docx'
import ExcelJS from 'exceljs'
import { PDFDocument,StandardFonts } from 'pdf-lib'
import Fastify from 'fastify'
import { registerFileTools } from '../server/lib/file-tools.js'
import { convertUniversal } from '../server/lib/universal-converter.js'
import { conversionCatalog,findEngine } from '../server/lib/conversion-catalog.js'

const execute=promisify(execFile)
const convert=(name,buffer,target)=>convertUniversal({name,buffer:Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer)},target)

test('通用转换 API：能力查询、动态目标、下载响应与非法组合',async()=>{
  const app=Fastify();registerFileTools(app)
  const request=(target)=>({method:'POST',url:'/api/file-tools/convert?mode=universal',headers:{'content-type':'multipart/form-data; boundary=universal-api-test'},payload:Buffer.from(`--universal-api-test\r\nContent-Disposition: form-data; name="target"\r\n\r\n${target}\r\n--universal-api-test\r\nContent-Disposition: form-data; name="files"; filename="data.csv"\r\nContent-Type: text/csv\r\n\r\n姓名,编号\n小明,00123\r\n--universal-api-test--\r\n`)})
  try{
    const capabilities=(await app.inject('/api/file-tools/capabilities')).json()
    assert.ok(capabilities.routes.length>100)
    assert.ok(Object.values(capabilities.engines).every(value=>typeof value==='boolean'))
    const result=await app.inject(request('json'))
    assert.equal(result.statusCode,200,result.body)
    assert.deepEqual(JSON.parse(result.body),[['姓名','编号'],['小明','00123']])
    assert.match(result.headers['content-disposition'],/data\.json$/)
    assert.equal((await app.inject(request('mp3'))).statusCode,400)
  }finally{await app.close()}
})

test('格式匹配只提供实际存在的转换组合，错误源和目标不执行',async()=>{
  const catalog=conversionCatalog()
  assert.ok(catalog.routes.some(route=>route.source==='pptx'&&route.target==='pdf'))
  assert.ok(catalog.routes.some(route=>route.source==='mp4'&&route.target==='mp3'))
  assert.ok(!catalog.routes.some(route=>route.source==='mp3'&&route.target==='docx'))
  await assert.rejects(convert('a.exe','test','png'),/暂不支持/)
  await assert.rejects(convert('a.md','# hello','../../bad'),/暂不支持/)
  assert.equal(catalog.routes.find(route=>route.source==='csv'&&route.target==='xlsx').engine,'data')
})

test('数据：JSON/YAML/CSV/TSV/XLSX 转换保持中文、前导零及嵌套数据',async()=>{
  const data=[{姓名:'小明',编号:'00123',备注:'两行\n含,逗号',详情:{a:1}}]
  const yaml=await convert('数据.json',JSON.stringify(data),'yaml')
  assert.match(yaml.buffer.toString(),/小明/)
  const xlsx=await convert('数据.yaml',yaml.buffer,'xlsx')
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(xlsx.buffer)
  assert.equal(workbook.worksheets[0].getCell('B2').value,'00123')
  const tsv=await convert('数据.xlsx',xlsx.buffer,'tsv')
  assert.match(tsv.buffer.toString(),/00123/)
  const json=await convert('数据.tsv',tsv.buffer,'json')
  assert.equal(JSON.parse(json.buffer.toString())[1][0],'小明')
  const roundtrip=await convert('数据.yaml',yaml.buffer,'json')
  assert.deepEqual(JSON.parse(roundtrip.buffer.toString()),data)
  await assert.rejects(convert('无效.json','{wrong}','yaml'),/语法/)
  await assert.rejects(convert('配置.json','{"name":"test"}','csv'),/对象数组/)
})

test('图片：透明图片转 JPG、TIFF 和 GIF，伪造图片失败',async()=>{
  const png=await sharp({create:{width:40,height:30,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer()
  for(const target of ['jpg','tiff','gif']){
    const result=await convert('透明.png',png,target)
    const metadata=await sharp(result.buffer).metadata()
    assert.equal(metadata.width,40);assert.equal(metadata.height,30)
    assert.equal(result.name,`透明.${target}`)
  }
  await assert.rejects(convert('假.png','broken','jpg'))
})

test('Pandoc：Markdown → DOCX/EPUB，再从 EPUB 提取 TXT',{skip:!findEngine('pandoc')},async()=>{
  const text='# 中文标题\n\nHello conversion.\n\n- first\n- second\n'
  const docx=await convert('笔记.md',text,'docx')
  assert.match(strFromU8(unzipSync(docx.buffer)['word/document.xml']),/中文标题/)
  const epub=await convert('笔记.md',text,'epub')
  assert.ok(unzipSync(epub.buffer)['mimetype'])
  const plain=await convert('书.epub',epub.buffer,'txt')
  assert.match(plain.buffer.toString(),/Hello conversion/)
})

test('含图片的 Word 转 HTML 时打包图片，避免下载后丢图',{skip:!findEngine('pandoc')&&!findEngine('libreoffice')},async()=>{
  const data=await sharp({create:{width:40,height:30,channels:3,background:'#c08040'}}).png().toBuffer()
  const buffer=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('With embedded image'),new Paragraph({children:[new ImageRun({data,type:'png',transformation:{width:40,height:30}})]})]}]}))
  const output=await convert('图文.docx',buffer,'html')
  assert.match(output.name,/\.zip$/)
  const entries=unzipSync(output.buffer)
  const htmlName=Object.keys(entries).find(name=>name.endsWith('.html'))
  assert.ok(htmlName)
  assert.ok(Object.keys(entries).some(name=>/\.(png|jpg|jpeg|gif)$/i.test(name)))
  assert.doesNotMatch(strFromU8(entries[htmlName]),/workbench-convert/)
})

test('LibreOffice：Word/Excel/PowerPoint 互转及 PDF，临时任务清理',{skip:!findEngine('libreoffice')},async()=>{
  const docx=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('中文文档测试'),new Paragraph('Editable document')]}]}))
  const pdf=await convert('文档.docx',docx,'pdf')
  assert.ok((await PDFDocument.load(pdf.buffer)).getPageCount()>0)
  const odt=await convert('文档.docx',docx,'odt')
  assert.ok(unzipSync(odt.buffer)['content.xml'])
  const restored=await convert('文档.odt',odt.buffer,'docx')
  assert.match(strFromU8(unzipSync(restored.buffer)['word/document.xml']),/Editable document/)
  const workbook=new ExcelJS.Workbook();workbook.addWorksheet('表格').addRow(['姓名','小明'])
  const ods=await convert('表.xlsx',Buffer.from(await workbook.xlsx.writeBuffer()),'ods')
  const spreadsheet=await convert('表.ods',ods.buffer,'xlsx')
  const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(spreadsheet.buffer)
  assert.equal(reopened.worksheets[0].getCell('B1').value,'小明')
  const odpBuffer=Buffer.from(zipSync({mimetype:strToU8('application/vnd.oasis.opendocument.presentation'),'META-INF/manifest.xml':strToU8('<?xml version="1.0"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.presentation"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>'),'content.xml':strToU8('<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.2"><office:body><office:presentation><draw:page draw:name="Slide 1"><draw:frame svg:x="1cm" svg:y="1cm" svg:width="20cm" svg:height="3cm"><draw:text-box><text:p>Presentation conversion test</text:p></draw:text-box></draw:frame></draw:page></office:presentation></office:body></office:document-content>')}))
  const pptx=await convert('演示.odp',odpBuffer,'pptx')
  assert.ok(unzipSync(pptx.buffer)['ppt/presentation.xml'])
  const slidesPdf=await convert('演示.pptx',pptx.buffer,'pdf')
  assert.equal((await PDFDocument.load(slidesPdf.buffer)).getPageCount(),1)
  await assert.rejects(convert('坏.docx','broken','pdf'),/格式|损坏/)
})

test('FFmpeg：视频转 WebM、提取音频、音频互转、字幕互转',{skip:!findEngine('ffmpeg')},async()=>{
  const root=resolve(tmpdir(),'workbench-converter-test');await mkdir(root,{recursive:true})
  const directory=await mkdtemp(join(root,'job-'))
  try{
    const video=join(directory,'input.mp4')
    await execute(findEngine('ffmpeg'),['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=64x64:r=5:d=0.5','-f','lavfi','-i','sine=frequency=440:duration=0.5','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',video],{windowsHide:true})
    const buffer=await readFile(video)
    const webm=await convert('片段.mp4',buffer,'webm')
    assert.ok(webm.buffer.length>100)
    const mp3=await convert('片段.mp4',buffer,'mp3')
    const wav=await convert('音乐.mp3',mp3.buffer,'wav')
    assert.equal(wav.buffer.subarray(0,4).toString(),'RIFF')
    const vtt=await convert('字幕.srt','1\n00:00:00,000 --> 00:00:01,000\n中文字幕\n','vtt')
    assert.match(vtt.buffer.toString(),/WEBVTT/);assert.match(vtt.buffer.toString(),/中文字幕/)
  }finally{const child=relative(root,directory);if(child&&!child.startsWith('..')&&!isAbsolute(child))await rm(directory,{recursive:true,force:true})}
})

test('PDF：提取文字和分页图片 ZIP',{skip:!findEngine('python')},async()=>{
  const document=await PDFDocument.create(),font=await document.embedFont(StandardFonts.Helvetica)
  document.addPage().drawText('PDF text export',{font,x:50,y:500})
  const buffer=Buffer.from(await document.save())
  const text=await convert('文件.pdf',buffer,'txt')
  assert.match(text.buffer.toString(),/PDF text export/)
  const images=await convert('文件.pdf',buffer,'png')
  assert.equal(images.name,'文件.zip')
  const archive=unzipSync(images.buffer)
  assert.ok(archive['page-001.png']);assert.equal((await sharp(archive['page-001.png']).metadata()).format,'png')
})
