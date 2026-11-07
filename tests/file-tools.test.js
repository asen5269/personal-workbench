import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import sharp from 'sharp'
import ExcelJS from 'exceljs'
import { PDFDocument } from 'pdf-lib'
import { registerFileTools } from '../server/lib/file-tools.js'

function multipart(files, fields={}) {
  const boundary='workbench-test-boundary', parts=[]
  for(const [name,value] of Object.entries(fields))parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`))
  for(const file of files)parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),file.buffer,Buffer.from('\r\n'))
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  return {payload:Buffer.concat(parts),headers:{'content-type':`multipart/form-data; boundary=${boundary}`}}
}

test('图片转换保留比例、不放大、JPG 透明填白及参数验证',async()=>{
  const app=Fastify();registerFileTools(app)
  const buffer=await sharp({create:{width:120,height:80,channels:4,background:{r:255,g:0,b:0,alpha:0}}}).png().toBuffer()
  try{
    for(const format of ['jpeg','png','webp','avif']){
      const response=await app.inject({method:'POST',url:'/api/file-tools/convert?mode=image',...multipart([{name:'透明.png',buffer}],{format,width:60,height:60,quality:80})})
      assert.equal(response.statusCode,200,response.body)
      const info=await sharp(response.rawPayload).metadata()
      assert.equal(info.width,60);assert.equal(info.height,40)
      assert.equal(response.headers['x-image-width'],'60')
      if(format==='jpeg'){
        const {data}=await sharp(response.rawPayload).raw().toBuffer({resolveWithObject:true})
        assert.ok(data[0]>250&&data[1]>250&&data[2]>250)
      }
    }
    const larger=await app.inject({method:'POST',url:'/api/file-tools/convert?mode=image',...multipart([{name:'test.png',buffer}],{width:1000})})
    assert.equal((await sharp(larger.rawPayload).metadata()).width,120)
    for(const fields of [{width:-2},{quality:101},{format:'exe'},{width:12000,height:12000}]){
      assert.equal((await app.inject({method:'POST',url:'/api/file-tools/convert?mode=image',...multipart([{name:'test.png',buffer}],fields)})).statusCode,400)
    }
    assert.equal((await app.inject({method:'POST',url:'/api/file-tools/convert?mode=image',...multipart([{name:'bad.png',buffer:Buffer.from('broken')}])})).statusCode,422)
  }finally{await app.close()}
})

test('CSV/XLSX 互转保留中文、前导零、引号和换行，CSV 只导出首表',async()=>{
  const app=Fastify();registerFileTools(app)
  try{
    const csv='\uFEFF姓名,编号,备注\r\n小明,00123,"第一行\n第二行,含逗号"\r\n'
    const xlsx=await app.inject({method:'POST',url:'/api/file-tools/convert?mode=csv-xlsx',...multipart([{name:'data.csv',buffer:Buffer.from(csv)}])})
    assert.equal(xlsx.statusCode,200,xlsx.body)
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(xlsx.rawPayload)
    assert.equal(workbook.worksheets[0].getCell('A2').value,'小明')
    assert.equal(workbook.worksheets[0].getCell('B2').value,'00123')
    assert.equal(workbook.worksheets[0].getCell('C2').value,'第一行\n第二行,含逗号')
    workbook.addWorksheet('第二表').addRow(['不应导出'])
    const output=await app.inject({method:'POST',url:'/api/file-tools/convert?mode=xlsx-csv',...multipart([{name:'data.xlsx',buffer:Buffer.from(await workbook.xlsx.writeBuffer())}])})
    assert.equal(output.statusCode,200,output.body)
    assert.ok(output.body.startsWith('\uFEFF'));assert.match(output.body,/00123/);assert.match(output.body,/小明/);assert.doesNotMatch(output.body,/不应导出/)
    assert.equal((await app.inject({method:'POST',url:'/api/file-tools/convert?mode=xlsx-csv',...multipart([{name:'data.xls',buffer:Buffer.from('old')}])})).statusCode,400)
  }finally{await app.close()}
})

test('缩放比例实际缩小和放大，按 EXIF 旋转后的尺寸计算并限制过大输出',async()=>{
  const app=Fastify();registerFileTools(app)
  const buffer=await sharp({create:{width:120,height:80,channels:3,background:'#446655'}}).png().toBuffer()
  const request=(input,fields)=>app.inject({method:'POST',url:'/api/file-tools/convert?mode=image',...multipart([{name:'比例.png',buffer:input}],{format:'png',...fields})})
  try{
    for(const scale of [0.25,0.5,1,1.5,2,3,4]){
      const response=await request(buffer,{scale})
      assert.equal(response.statusCode,200,response.body)
      const metadata=await sharp(response.rawPayload).metadata()
      assert.equal(metadata.width,Math.round(120*scale));assert.equal(metadata.height,Math.round(80*scale))
    }
    const rotated=await sharp(buffer).jpeg().withMetadata({orientation:6}).toBuffer()
    const result=await request(rotated,{scale:2})
    assert.equal(result.statusCode,200,result.body)
    const metadata=await sharp(result.rawPayload).metadata()
    assert.equal(metadata.width,160);assert.equal(metadata.height,240)
    for(const scale of ['invalid',0,-1,100])assert.equal((await request(buffer,{scale})).statusCode,400)
    assert.equal((await request(buffer,{scale:2,width:100})).statusCode,400)
    const large=await sharp({create:{width:2000,height:2000,channels:3,background:'#ffffff'}}).png().toBuffer()
    const rejected=await request(large,{scale:4})
    assert.equal(rejected.statusCode,400);assert.match(rejected.json().error,/较小倍数/)
  }finally{await app.close()}
})

test('多图合并 PDF 页数与 A4 尺寸、空输入及文件数量验证',async()=>{
  const app=Fastify();registerFileTools(app)
  const buffer=await sharp({create:{width:20,height:40,channels:3,background:'#123456'}}).png().toBuffer()
  try{
    const files=[{name:'1.png',buffer},{name:'2.png',buffer}]
    const output=await app.inject({method:'POST',url:'/api/file-tools/convert?mode=images-pdf',...multipart(files)})
    assert.equal(output.statusCode,200,output.body)
    const pdf=await PDFDocument.load(output.rawPayload)
    assert.equal(pdf.getPageCount(),2);assert.equal(pdf.getPage(0).getWidth(),595.28)
    assert.equal((await app.inject({method:'POST',url:'/api/file-tools/convert?mode=image',...multipart(files)})).statusCode,400)
    assert.equal((await app.inject({method:'POST',url:'/api/file-tools/convert?mode=image',...multipart([])})).statusCode,400)
    assert.equal((await app.inject({method:'POST',url:'/api/file-tools/convert?mode=images-pdf',...multipart(Array.from({length:21},()=>files[0]))})).statusCode,413)
  }finally{await app.close()}
})
