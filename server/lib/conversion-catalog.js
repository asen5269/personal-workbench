import { existsSync } from 'node:fs'
import { join, delimiter } from 'node:path'
import { pdfPython } from './pdf-to-word.js'

export function findEngine(name) {
  const configuration={libreoffice:['WORKBENCH_SOFFICE','soffice',join('libreoffice','current','LibreOffice','program','soffice.com')],pandoc:['WORKBENCH_PANDOC','pandoc',join('pandoc','current','pandoc.exe')],ffmpeg:['WORKBENCH_FFMPEG','ffmpeg',join('ffmpeg','current','bin','ffmpeg.exe')],calibre:['WORKBENCH_CALIBRE','ebook-convert',join('calibre','current','Calibre','ebook-convert.exe')]}
  if(name==='python')return existsSync(pdfPython)?pdfPython:null
  const [variable,command,scoop]=configuration[name]
  const candidates=[process.env[variable],join(process.env.USERPROFILE||process.env.HOME||'', 'scoop/apps',scoop),...(process.env.PATH||'').split(delimiter).flatMap(directory=>[join(directory,command),join(directory,command+'.exe'),join(directory,command+'.com')])]
  if(name==='libreoffice')candidates.push('C:/Program Files/LibreOffice/program/soffice.com','C:/Program Files/LibreOffice/program/soffice.exe')
  return candidates.find(path=>path&&existsSync(path))||null
}

const rules=[]
function group(category,engine,inputs,outputs,note='') {
  for(const source of inputs.split(' '))for(const target of outputs.split(' '))if(source!==target)rules.push({source,target,category,engine,note})
}
group('图片','sharp','jpg jpeg png webp avif tiff tif gif svg ico','jpg jpeg png webp avif tiff gif svg ico','动图仅处理第一帧。SVG 为自动矢量描摹，适合图标与线稿，照片会简化；ICO 输出 16–256 像素的多尺寸图标。')
group('文档','libreoffice','doc docx odt rtf txt html htm','doc docx odt rtf txt html pdf epub','尽量保留排版；字体缺失、复杂布局和宏不会完整保留。')
group('表格','libreoffice','xls xlsx ods csv tsv','xls xlsx ods csv pdf','CSV 只保存当前首个工作表的内容，不保留样式。')
group('演示文稿','libreoffice','ppt pptx odp','ppt pptx odp pdf','复杂动画、特殊字体和视频可能无法保留。')
group('文档','pandoc','md markdown html htm docx odt rst tex epub txt','md html docx odt rtf txt epub rst tex','按内容结构转换，排版可能变化；外部图片和附件不自动下载。')
group('文档','pandoc-pdf','md markdown rst tex epub','pdf','先转换为文档再输出 PDF，复杂公式与排版可能变化。')
group('电子书','calibre','epub mobi azw3 fb2 txt html docx odt rtf','epub mobi azw3 fb2 txt docx pdf','不支持 DRM 加密电子书，排版可能变化。')
group('视频','ffmpeg','mp4 mkv mov avi webm flv mpeg mpg ts m4v','mp4 mkv mov avi webm gif mp3 wav flac ogg m4a aac opus','重新编码可能改变质量和大小；视频转音频需要文件含音轨。')
group('音频','ffmpeg','mp3 wav flac ogg m4a aac opus wma aiff','mp3 wav flac ogg m4a aac opus','重新编码可能有损；不绕过加密或 DRM。')
group('字幕','ffmpeg','srt vtt ass ssa','srt vtt ass','样式可能丢失；使用 UTF-8 编码。')
group('数据','data','csv tsv xlsx json yaml yml','csv tsv xlsx json yaml','表格格式仅处理首表，JSON / YAML 转表格需为对象数组或二维数组。')
group('PDF','pdf2docx','pdf','docx','单文件最大 20MB、100 页。文字版 PDF 可转可编辑 Word；扫描件需 OCR，复杂排版可能变化。')
group('PDF','python-pdf','pdf','txt png jpg','最多 100 页，图片输出按页打包为 ZIP；文字提取不含 OCR。')

export function conversionCatalog() {
  const engines={sharp:true,data:true,pandoc:!!findEngine('pandoc'),libreoffice:!!findEngine('libreoffice'),ffmpeg:!!findEngine('ffmpeg'),calibre:!!findEngine('calibre'),pdf2docx:!!findEngine('python'),'python-pdf':!!findEngine('python')}
  engines['pandoc-pdf']=engines.pandoc&&engines.libreoffice
  const pairs=new Map()
  for(const rule of rules){const key=rule.source+':'+rule.target;const previous=pairs.get(key);if(!previous||rule.engine==='data'||(!previous.available&&engines[rule.engine]))pairs.set(key,{...rule,available:engines[rule.engine]})}
  return {engines,routes:[...pairs.values()],maxFileSize:200*1024**2}
}
