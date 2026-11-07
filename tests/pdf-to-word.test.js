import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { unzipSync, strFromU8 } from 'fflate'
import Fastify from 'fastify'
import sharp from 'sharp'
import { registerFileTools } from '../server/lib/file-tools.js'
import { pdfPython } from '../server/lib/pdf-to-word.js'

function upload(buffer,name='示例.pdf') {
  const boundary='pdf-word-test'
  return {method:'POST',url:'/api/file-tools/convert?mode=pdf-docx',headers:{'content-type':`multipart/form-data; boundary=${boundary}`},payload:Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: application/pdf\r\n\r\n`),buffer,Buffer.from(`\r\n--${boundary}--\r\n`)])}
}

test('PDF 转 Word：英文、表格和中文保持可编辑，扫描件、密码、损坏及超页数明确报错',{skip:!existsSync(pdfPython)&&'未安装可选 PDF 转 Word Python 环境'},async()=>{
  const app=Fastify();registerFileTools(app)
  try {
    const pdf=await PDFDocument.create(),page=pdf.addPage([595,842]),font=await pdf.embedFont(StandardFonts.Helvetica)
    page.drawText('Workbench invoice',{x:50,y:780,size:18,font})
    for(const x of [50,200,350])page.drawLine({start:{x,y:620},end:{x,y:720},color:rgb(0,0,0)})
    for(const y of [620,670,720])page.drawLine({start:{x:50,y},end:{x:350,y},color:rgb(0,0,0)})
    for(const [text,x,y] of [['Item',60,690],['Price',210,690],['Book',60,640],['25.00',210,640]])page.drawText(text,{x,y,size:12,font})
    const result=await app.inject(upload(Buffer.from(await pdf.save())))
    assert.equal(result.statusCode,200,result.body)
    assert.match(result.headers['content-type'],/wordprocessingml/)
    assert.match(result.headers['content-disposition'],/\.docx$/)
    const xml=strFromU8(unzipSync(result.rawPayload)['word/document.xml'])
    assert.match(xml,/Workbench invoice/);assert.match(xml,/Book/);assert.match(xml,/<w:tbl>/)

    const chinese=execFileSync(pdfPython,['-I','-c',`import pymupdf,sys; d=pymupdf.open(); p=d.new_page(); p.insert_text((60,80),'中文转换测试',fontname='china-s',fontsize=18); sys.stdout.buffer.write(d.tobytes())`],{windowsHide:true})
    const chineseResult=await app.inject(upload(chinese))
    assert.equal(chineseResult.statusCode,200,chineseResult.body)
    const chineseXml=strFromU8(unzipSync(chineseResult.rawPayload)['word/document.xml']).replace(/<[^>]+>/g,'').replace(/\s/g,'')
    assert.match(chineseXml,/中文转换测试/)

    const scan=await PDFDocument.create()
    const scanImage=await scan.embedPng(await sharp({create:{width:100,height:100,channels:3,background:'#eeeeee'}}).png().toBuffer())
    scan.addPage().drawImage(scanImage,{x:0,y:0,width:100,height:100})
    const noText=await app.inject(upload(Buffer.from(await scan.save())))
    assert.equal(noText.statusCode,422);assert.match(noText.json().error,/OCR/)
    const encrypted=execFileSync(pdfPython,['-I','-c',`import pymupdf,sys;d=pymupdf.open();p=d.new_page();p.insert_text((50,50),'private');sys.stdout.buffer.write(d.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256,user_pw='secret',owner_pw='owner'))`],{windowsHide:true})
    const encryptedResult=await app.inject(upload(encrypted))
    assert.equal(encryptedResult.statusCode,422);assert.match(encryptedResult.json().error,/密码/)
    const broken=await app.inject(upload(Buffer.from('%PDF-1.7\nbroken')))
    assert.equal(broken.statusCode,422);assert.match(broken.json().error,/损坏|无法转换/)
    const long=await PDFDocument.create();for(let i=0;i<101;i++)long.addPage()
    const longResult=await app.inject(upload(Buffer.from(await long.save())))
    assert.equal(longResult.statusCode,422);assert.match(longResult.json().error,/100 页/)
    assert.equal((await app.inject(upload(Buffer.from('wrong'),'file.txt'))).statusCode,400)
  } finally {await app.close()}
})
