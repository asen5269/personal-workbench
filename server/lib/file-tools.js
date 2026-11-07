import multipart from '@fastify/multipart'
import sharp from 'sharp'
import ExcelJS from 'exceljs'
import { PDFDocument } from 'pdf-lib'
import { Readable } from 'node:stream'
import { pdfToWord } from './pdf-to-word.js'
import { conversionCatalog } from './conversion-catalog.js'
import { convertUniversal } from './universal-converter.js'
import { normalizeImage,encodeSpecialImage } from './image-formats.js'

const MAX_FILE = 20 * 1024 ** 2
const bad = message => Object.assign(new Error(message), { statusCode:400 })
const image = buffer => sharp(buffer, { limitInputPixels:40_000_000 }).rotate()
const stem = name => name.replace(/\.[^.]+$/, '').replace(/[\x00-\x1f\\/]/g, '_').slice(0,150) || 'converted'
const integer = (value, fallback, min, max) => {
  if (value === undefined || value === '') return fallback
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) throw bad(`参数范围应为 ${min}–${max}`)
  return number
}

export function registerFileTools(app) {
  app.register(async routes => {
    await routes.register(multipart, { limits:{fileSize:200*1024**2,files:20,fields:8,parts:28} })
    routes.setErrorHandler((error, req, reply) => reply.code(error.statusCode || 422).send({ error:error.code === 'FST_REQ_FILE_TOO_LARGE' ? `单个文件最大 ${req.query.mode==='universal'?200:20}MB` : error.statusCode ? error.message : '无法处理此文件，请检查格式或文件是否损坏' }))
    routes.get('/api/file-tools/capabilities',()=>conversionCatalog())
    routes.post('/api/file-tools/convert', async (req, reply) => {
      const mode = req.query.mode
      if (!['image','csv-xlsx','xlsx-csv','images-pdf','pdf-docx','universal'].includes(mode)) throw bad('不支持的转换方式')
      const files = [], fields = {}; let total = 0
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer(); total += buffer.length
          if (mode==='universal' ? total>200*1024**2 : total>80*1024**2) throw bad(mode==='universal'?'单文件最大 200MB':'单次文件总大小最大 80MB')
          if(mode!=='universal'&&buffer.length>MAX_FILE)throw bad('单个文件最大 20MB')
          if (!buffer.length) throw bad('文件内容为空')
          files.push({name:part.filename,buffer})
        } else fields[part.fieldname] = part.value
      }
      if (!files.length || (mode !== 'images-pdf' && files.length !== 1)) throw bad('请选择一个文件；图片转 PDF 可选择多张')
      let output, name, mime
      if(mode==='universal') {
        const converted=await convertUniversal(files[0],fields.target)
        return reply.header('Content-Type',converted.mime).header('X-Content-Type-Options','nosniff').header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(converted.name).replace(/['()*]/g,c=>'%' + c.charCodeAt(0).toString(16))}`).send(converted.buffer)
      }
      if (mode === 'image') {
        const format = fields.format || 'webp'
        if (!['jpg','jpeg','png','webp','avif','svg','ico'].includes(format)) throw bad('不支持的图片格式')
        const input=await normalizeImage(files[0].buffer)
        const width = integer(fields.width,undefined,1,12000), height = integer(fields.height,undefined,1,12000)
        const quality = integer(fields.quality,80,1,100)
        if (width && height && width * height > 40_000_000) throw bad('目标图片不能超过 4000 万像素')
        if(format==='ico'&&(width||height||(fields.scale!==undefined&&Number(fields.scale)!==1)))throw bad('ICO 使用固定图标尺寸，请选择原尺寸')
        let processor = image(input)
        if(fields.scale!==undefined) {
          const scale=Number(fields.scale)
          if(![0.25,0.5,1,1.5,2,3,4].includes(scale))throw bad('请选择有效的缩放比例')
          if(width||height)throw bad('缩放比例与像素尺寸不能同时设置')
          if(scale!==1){
            const metadata=await sharp(input,{limitInputPixels:40_000_000}).metadata()
            const rotated=metadata.orientation>=5
            const scaledWidth=Math.max(1,Math.round((rotated?metadata.height:metadata.width)*scale))
            const scaledHeight=Math.max(1,Math.round((rotated?metadata.width:metadata.height)*scale))
            if(scaledWidth>12000||scaledHeight>12000||scaledWidth*scaledHeight>40_000_000)throw bad('放大后图片过大，请选择较小倍数（最长边 12000、最多 4000 万像素）')
            processor=processor.resize({width:scaledWidth,height:scaledHeight,fit:'fill'})
          }
        } else if (width || height) processor = processor.resize({width,height,fit:'inside',withoutEnlargement:true})
        if (format === 'jpeg'||format==='jpg') processor = processor.flatten({background:'#ffffff'})
        if(format==='svg'||format==='ico'){
          const result=await encodeSpecialImage(processor,format,{original:input,scale:fields.scale===undefined?1:Number(fields.scale),width,height})
          output=result.data;mime=result.mime
          reply.header('X-Image-Width',result.width).header('X-Image-Height',result.height)
        } else {
          const result = await processor.toFormat(format==='jpg'?'jpeg':format,{quality}).toBuffer({resolveWithObject:true})
          output=result.data;mime=`image/${format==='jpg'?'jpeg':format}`
          reply.header('X-Image-Width',result.info.width).header('X-Image-Height',result.info.height)
        }
        name = `${stem(files[0].name)}.${format}`
      } else if (mode === 'images-pdf') {
        const pdf = await PDFDocument.create()
        for (const file of files) {
          const png = await image(file.buffer).resize({width:2400,height:3200,fit:'inside',withoutEnlargement:true}).png().toBuffer()
          const embedded = await pdf.embedPng(png), page = pdf.addPage([595.28,841.89])
          const scale = Math.min(547.28 / embedded.width,793.89 / embedded.height)
          const width = embedded.width * scale, height = embedded.height * scale
          page.drawImage(embedded,{x:(595.28-width)/2,y:(841.89-height)/2,width,height})
        }
        output = Buffer.from(await pdf.save()); name = '合并图片.pdf'; mime = 'application/pdf'
      } else if (mode === 'pdf-docx') {
        if (!/\.pdf$/i.test(files[0].name)) throw bad('请选择 PDF 文件')
        output = await pdfToWord(files[0].buffer)
        name = `${stem(files[0].name)}.docx`
        mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      } else {
        const workbook = new ExcelJS.Workbook()
        if (mode === 'csv-xlsx') {
          if (!/\.csv$/i.test(files[0].name)) throw bad('请选择 UTF-8 编码的 CSV 文件')
          await workbook.csv.read(Readable.from([files[0].buffer]),{map:value=>value,sheetName:'数据'})
          output = Buffer.from(await workbook.xlsx.writeBuffer()); name = `${stem(files[0].name)}.xlsx`
          mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        } else {
          if (!/\.xlsx$/i.test(files[0].name)) throw bad('请选择 XLSX 文件，不支持旧版 XLS')
          await workbook.xlsx.load(files[0].buffer)
          const sheet = workbook.worksheets[0]
          if (!sheet) throw bad('工作簿中没有工作表')
          output = Buffer.concat([Buffer.from('\uFEFF'),Buffer.from(await workbook.csv.writeBuffer({sheetId:sheet.id}))])
          name = `${stem(files[0].name)}.csv`; mime = 'text/csv; charset=utf-8'
        }
      }
      return reply.header('Content-Type',mime).header('X-Content-Type-Options','nosniff').header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g,c=>'%' + c.charCodeAt(0).toString(16))}`).send(output)
    })
  })
}
