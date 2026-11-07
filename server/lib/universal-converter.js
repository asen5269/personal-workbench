import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, writeFile, readFile, readdir, rm, stat } from 'node:fs/promises'
import { join, extname, relative, resolve, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import ExcelJS from 'exceljs'
import YAML from 'yaml'
import { Readable } from 'node:stream'
import { zipSync, unzipSync } from 'fflate'
import { conversionCatalog, findEngine } from './conversion-catalog.js'
import { pdfToWord } from './pdf-to-word.js'
import { normalizeImage,encodeSpecialImage } from './image-formats.js'

const execute=promisify(execFile), MAX=200*1024**2, jobsRoot=resolve(tmpdir(),'workbench-convert')
const failure=(statusCode,message)=>Object.assign(new Error(message),{statusCode})
let running=0
export const extension=name=>extname(name).slice(1).toLowerCase()
const mimeTypes={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',zip:'application/zip',txt:'text/plain; charset=utf-8',csv:'text/csv; charset=utf-8',tsv:'text/tab-separated-values; charset=utf-8',json:'application/json',yaml:'application/yaml',html:'text/html; charset=utf-8',epub:'application/epub+zip',jpg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',avif:'image/avif',tiff:'image/tiff',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',wav:'audio/wav',flac:'audio/flac',ogg:'audio/ogg',m4a:'audio/mp4',opus:'audio/ogg'}
async function run(binary,args,cwd) {
  try {await execute(binary,args,{cwd,windowsHide:true,timeout:180000,maxBuffer:1024**2})}
  catch(error){throw failure(error.killed?504:422,error.killed?'转换超过 3 分钟，请缩小文件后重试':'转换失败：文件可能损坏、受密码保护，或使用了不支持的编码。')}
}
const documentFilters={doc:'MS Word 97',docx:'Office Open XML Text',odt:'writer8',rtf:'Rich Text Format',txt:'Text (encoded):UTF8',html:'HTML (StarWriter)',pdf:'writer_pdf_Export',epub:'EPUB'}
const sheetFilters={xls:'MS Excel 97',xlsx:'Calc MS Excel 2007 XML',ods:'calc8',csv:'Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,0',pdf:'calc_pdf_Export'}
const slideFilters={ppt:'MS PowerPoint 97',pptx:'Impress MS PowerPoint 2007 XML',odp:'impress8',pdf:'impress_pdf_Export'}
async function office(input,source,target,directory) {
  const outputDirectory=join(directory,'output');await mkdir(outputDirectory,{recursive:true})
  const profile=join(directory,'office-profile');await mkdir(join(profile,'user'),{recursive:true})
  await writeFile(join(profile,'user/registrymodifications.xcu'),'<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>')
  const filters=['xls','xlsx','ods','csv','tsv'].includes(source)?sheetFilters:['ppt','pptx','odp'].includes(source)?slideFilters:documentFilters
  const args=[`-env:UserInstallation=${pathToFileURL(profile).href}`,'--headless','--norestore','--nodefault','--nolockcheck']
  if(source==='csv'||source==='tsv')args.push(`--infilter=Text - txt - csv (StarCalc):${source==='tsv'?9:44},34,76,1`)
  args.push('--convert-to',`${target}:${filters[target]}`,'--outdir',outputDirectory,input)
  await run(findEngine('libreoffice'),args,directory)
  return outputDirectory
}
const pandocFormats={md:'markdown',markdown:'markdown',txt:'markdown',html:'html',htm:'html',docx:'docx',odt:'odt',rst:'rst',tex:'latex',epub:'epub',rtf:'rtf'}
async function pandoc(input,source,target,directory) {
  const output=join(directory,`converted.${target}`)
  await run(findEngine('pandoc'),['--sandbox','--standalone','--from',pandocFormats[source],'--to',target==='txt'?'plain':pandocFormats[target],'--extract-media',join(directory,'media'),'--output',output,input],directory)
  return output
}
async function dataConvert(buffer,source,target) {
  const workbook=new ExcelJS.Workbook();let sheet,value
  if(source==='json'||source==='yaml'||source==='yml') {
    try {const text=buffer.toString('utf8').replace(/^\uFEFF/,'');value=source==='json'?JSON.parse(text):YAML.parse(text,{maxAliasCount:50})}catch{throw failure(422,'数据格式无效，请检查 JSON 或 YAML 语法')}
    if(target==='json')return Buffer.from(JSON.stringify(value,null,2))
    if(target==='yaml')return Buffer.from(YAML.stringify(value))
    if(!Array.isArray(value)||value.some(row=>!row||typeof row!=='object'))throw failure(422,'转成表格时，JSON / YAML 必须是对象数组或二维数组')
    sheet=workbook.addWorksheet('数据')
    if(value.every(Array.isArray)){value.forEach(row=>sheet.addRow(row.map(cell=>cell&&typeof cell==='object'?JSON.stringify(cell):cell)))}
    else {
      if(value.some(Array.isArray))throw failure(422,'不能混用对象行和数组行')
      const keys=[...new Set(value.flatMap(row=>Object.keys(row)))]
      sheet.addRow(keys)
      value.forEach(row=>sheet.addRow(keys.map(key=>row[key]&&typeof row[key]==='object'?JSON.stringify(row[key]):row[key]??'')))
    }
  } else if(source==='xlsx') {await workbook.xlsx.load(buffer);sheet=workbook.worksheets[0]}
  else sheet=await workbook.csv.read(Readable.from([buffer]),{map:value=>value,parserOptions:{delimiter:source==='tsv'?'\t':','},sheetName:'数据'})
  if(!sheet)throw failure(422,'没有可转换的工作表')
  if(target==='xlsx')return Buffer.from(await workbook.xlsx.writeBuffer())
  if(target==='csv'||target==='tsv')return Buffer.concat([Buffer.from('\uFEFF'),Buffer.from(await workbook.csv.writeBuffer({sheetId:sheet.id,formatterOptions:{delimiter:target==='tsv'?'\t':','}}))])
  const rows=[]
  sheet.eachRow({includeEmpty:true},row=>{const values=[];for(let i=1;i<=sheet.columnCount;i++){let cell=row.getCell(i).value;if(cell&&typeof cell==='object')cell=cell.result??cell.text??cell.richText?.map(item=>item.text).join('')??'';values.push(cell??'')}rows.push(values)})
  return Buffer.from(target==='json'?JSON.stringify(rows,null,2):YAML.stringify(rows))
}
async function packageOutput(directory,preferred) {
  const contents={};let total=0
  async function visit(path,prefix='') {
    for(const entry of await readdir(path,{withFileTypes:true})) {
      const file=join(path,entry.name),key=prefix+entry.name
      if(entry.isDirectory())await visit(file,key+'/')
      else if(entry.isFile()){const info=await stat(file);total+=info.size;if(total>MAX)throw failure(413,'输出超过 200MB，请缩小文件后重试');contents[key]=new Uint8Array(await readFile(file))}
    }
  }
  await visit(directory)
  const names=Object.keys(contents)
  if(!names.length)throw failure(422,'没有生成输出文件，请检查文件格式或密码保护')
  if(names.length===1)return {buffer:Buffer.from(contents[names[0]]),format:preferred}
  return {buffer:Buffer.from(zipSync(contents)),format:'zip'}
}

export async function convertUniversal(file,target) {
  const source=extension(file.name)
  const rule=conversionCatalog().routes.find(rule=>rule.source===source&&rule.target===target)
  if(!rule)throw failure(400,'此源格式与目标格式之间暂不支持转换')
  if(!rule.available)throw failure(503,'此转换格式的组件尚未安装，请选择其他目标格式')
  if(file.buffer.length>MAX)throw failure(413,'单文件最大 200MB')
  const requiredEntries={docx:'word/document.xml',xlsx:'xl/workbook.xml',pptx:'ppt/presentation.xml',odt:'content.xml',ods:'content.xml',odp:'content.xml',epub:'mimetype'}
  if(requiredEntries[source]) {
    const required=requiredEntries[source]
    try {
      const entries=unzipSync(file.buffer,{filter:entry=>entry.name===required&&entry.originalSize<=20*1024**2})
      if(!entries[required])throw Error('missing entry')
    }catch{throw failure(422,'文件内容与扩展名格式不匹配，或文件已损坏')}
  }
  if(['doc','xls','ppt'].includes(source)&&!file.buffer.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex')))throw failure(422,'旧版 Office 文件格式不匹配或已损坏')
  if(running>=2)throw failure(429,'已有两个转换任务在运行，请稍后重试')
  running++
  let directory,buffer,outputFormat=target
  try {
    if(rule.engine==='sharp') {
      let processor=sharp(await normalizeImage(file.buffer),{limitInputPixels:40_000_000}).rotate()
      if(target==='jpg'||target==='jpeg')processor=processor.flatten({background:'#ffffff'})
      buffer=target==='svg'||target==='ico'?(await encodeSpecialImage(processor,target)).data:await processor.toFormat(target==='jpg'?'jpeg':target,{quality:85}).toBuffer()
    } else if(rule.engine==='data')buffer=await dataConvert(file.buffer,source,target)
    else if(rule.engine==='pdf2docx') {
      if(file.buffer.length>20*1024**2)throw failure(413,'PDF 转 Word 单文件最大 20MB')
      buffer=await pdfToWord(file.buffer)
    } else {
      await mkdir(jobsRoot,{recursive:true});directory=await mkdtemp(join(jobsRoot,'job-'))
      const input=join(directory,`input.${source}`);await writeFile(input,file.buffer)
      let output=join(directory,`converted.${target}`)
      if(rule.engine==='libreoffice') {
        const packaged=await packageOutput(await office(input,source,target,directory),target);buffer=packaged.buffer;outputFormat=packaged.format
      } else if(rule.engine==='pandoc'||rule.engine==='pandoc-pdf') {
        const pandocTarget=rule.engine==='pandoc-pdf'?'docx':target
        output=await pandoc(input,source,pandocTarget,directory)
        if(rule.engine==='pandoc-pdf'){const packaged=await packageOutput(await office(output,'docx','pdf',directory),'pdf');buffer=packaged.buffer;outputFormat=packaged.format}
        else if(target==='html'||target==='md'||target==='rst'||target==='tex') {
          const exportDirectory=join(directory,'export');await mkdir(exportDirectory)
          const text=(await readFile(output,'utf8')).split(join(directory,'media')).join('media').split(join(directory,'media').replaceAll('\\','/')).join('media')
          await writeFile(join(exportDirectory,`converted.${target}`),text)
          const {cp}=await import('node:fs/promises');await cp(join(directory,'media'),join(exportDirectory,'media'),{recursive:true}).catch(error=>{if(error.code!=='ENOENT')throw error})
          const packaged=await packageOutput(exportDirectory,target);buffer=packaged.buffer;outputFormat=packaged.format
        }
      } else if(rule.engine==='calibre')await run(findEngine('calibre'),[input,output],directory)
      else if(rule.engine==='python-pdf') {
        outputFormat=target==='txt'?'txt':'zip';output=join(directory,`converted.${outputFormat}`)
        await run(findEngine('python'),['-I',join(import.meta.dirname,'../python/pdf_export.py'),input,output,target],directory)
      } else if(rule.engine==='ffmpeg') {
        const args=['-hide_banner','-loglevel','error','-nostdin','-y','-protocol_whitelist','file,pipe','-i',input]
        if(['srt','vtt','ass','ssa'].includes(source))args.push('-map','0:s:0')
        else if(['mp3','wav','flac','ogg','m4a','aac','opus'].includes(target)){
          const codecs={mp3:'libmp3lame',wav:'pcm_s16le',flac:'flac',ogg:'libvorbis',m4a:'aac',aac:'aac',opus:'libopus'}
          args.push('-map','0:a:0','-vn','-c:a',codecs[target])
          if(target==='opus')args.push('-ar','48000')
        } else if(target==='gif')args.push('-an','-vf','fps=12,scale=min(640\\,iw):-2')
        else {
          args.push('-map','0:v:0','-map','0:a:0?','-c:v',target==='webm'?'libvpx-vp9':target==='avi'?'mpeg4':'libx264','-pix_fmt','yuv420p','-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2','-c:a',target==='webm'?'libopus':'aac')
          if(['mp4','mov'].includes(target))args.push('-movflags','+faststart')
          if(['mp4','mkv','mov'].includes(target))args.push('-preset','fast','-crf','23')
        }
        args.push('-threads','2','-fs',String(MAX+1),output);await run(findEngine('ffmpeg'),args,directory)
      }
      if(!buffer){const info=await stat(output).catch(()=>{throw failure(422,'未能生成目标文件，请检查输入格式')});if(!info.size||info.size>=MAX)throw failure(413,'输出为空或超过 200MB');buffer=await readFile(output)}
    }
    if(buffer.length>MAX)throw failure(413,'输出超过 200MB，请缩小文件后重试')
    const name=(file.name.slice(0,-extname(file.name).length).replace(/[\x00-\x1f\\/]/g,'_').slice(0,150)||'converted')+'.'+outputFormat
    return {buffer,name,mime:outputFormat==='svg'?'image/svg+xml':outputFormat==='ico'?'image/x-icon':outputFormat==='jpeg'?'image/jpeg':mimeTypes[outputFormat]||'application/octet-stream'}
  } finally {
    running--
    if(directory){const child=relative(jobsRoot,resolve(directory));if(child&&!child.startsWith('..')&&!isAbsolute(child))await rm(directory,{recursive:true,force:true})}
  }
}
