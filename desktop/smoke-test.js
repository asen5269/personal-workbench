import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
const root=resolve(process.argv[2]||resolve(import.meta.dirname,'../artifacts/desktop-payload'))
const data=mkdtempSync(join(tmpdir(),'workbench-desktop-test-')),ready=join(data,'ready')
const token=crypto.randomUUID()
const env={...process.env,PATH:join(process.env.SystemRoot,'System32'),NODE_PATH:'',PYTHONHOME:'',PYTHONPATH:'',WORKBENCH_DESKTOP:'1',WORKBENCH_PORT:'0',WORKBENCH_DATA_DIR:data,WORKBENCH_SESSION_TOKEN:token,WORKBENCH_READY_FILE:ready}
const child=spawn(join(root,'node.exe'),[join(root,'desktop/server-bootstrap.js')],{cwd:tmpdir(),env,windowsHide:true,stdio:['ignore','pipe','pipe']})
let logs='';child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk)
try{
  for(let i=0;!existsSync(ready);i++){if(i>600||child.exitCode!==null)throw Error('Backend failed: '+logs);await new Promise(r=>setTimeout(r,100))}
  const url=readFileSync(ready,'utf8'),headers={Cookie:`workbench_session=${token}`}
  assert.equal((await fetch(url+'/api/entries')).status,403)
  assert.equal((await fetch(url+'/__desktop/start?token='+token,{redirect:'manual'})).status,302)
  assert.equal((await fetch(url+'/',{headers})).status,200)
  assert.deepEqual(await(await fetch(url+'/api/entries',{headers})).json(),[])
  const created=await fetch(url+'/api/entries',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({type:'account',name:'desktop smoke test'})})
  assert.equal(created.status,200)
  const convert=async(name,buffer,mode,fields={})=>{
    const form=new FormData();form.append('file',new Blob([buffer]),name)
    for(const [key,value] of Object.entries(fields))form.append(key,value)
    const response=await fetch(url+'/api/file-tools/convert?mode='+mode,{method:'POST',headers,body:form})
    if(!response.ok)throw Error(name+': '+await response.text())
    assert.ok((await response.arrayBuffer()).byteLength>0)
  }
  await convert('test.png',await sharp({create:{width:16,height:16,channels:3,background:'#618a6c'}}).png().toBuffer(),'image',{format:'webp'})
  const pdf=await PDFDocument.create();pdf.addPage().drawText('Desktop PDF conversion test')
  await convert('test.pdf',await pdf.save(),'pdf-docx')
  await convert('test.txt',Buffer.from('Desktop office conversion test'),'universal',{target:'docx'})
  const capabilities=await(await fetch(url+'/api/file-tools/capabilities',{headers})).json()
  console.log('Capabilities:',JSON.stringify(capabilities).slice(0,700))
  for(const exe of ['ffmpeg','ffprobe'])execFileSync(join(root,'engines/ffmpeg',exe+'.exe'),['-version'],{env,windowsHide:true})
  execFileSync(join(root,'engines/python/python.exe'),['-I','-c','import pdf2docx,pymupdf; print("PDF engines OK")'],{env,windowsHide:true})
  execFileSync(join(root,'engines/pandoc/pandoc.exe'),['--version'],{env,windowsHide:true})
  execFileSync(join(root,'engines/libreoffice/program/soffice.com'),['--headless','--version'],{env,windowsHide:true,timeout:30000})
  console.log('PASS: bundled Node, clean PATH, authenticated server, frontend, fresh SQLite, FFmpeg, Python PDF, Pandoc, LibreOffice. Data: '+data)
}finally{child.kill();await new Promise(resolve=>child.once('exit',resolve))}
