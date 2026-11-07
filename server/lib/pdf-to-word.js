import { execFile } from 'node:child_process'
import { join } from 'node:path'

const root = join(import.meta.dirname,'../..')
export const pdfPython = process.env.WORKBENCH_PDF_PYTHON || join(root,'.venv-pdf',process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const script = join(root,'server/python/pdf_to_docx.py')
let running = false
const failure = (statusCode,message) => Object.assign(new Error(message),{statusCode})

export async function pdfToWord(buffer) {
  if (running) throw failure(429,'正在转换另一个 PDF，请稍后重试')
  running = true
  try {
    return await new Promise((resolve,reject) => {
      const child = execFile(pdfPython,['-I',script],{encoding:'buffer',timeout:120000,maxBuffer:80*1024**2,windowsHide:true},(error,stdout) => {
        if (!error) return resolve(stdout)
        if (error.code === 'ENOENT' || error.code === 6) return reject(failure(503,'PDF 转 Word 组件未安装，请按项目说明安装转换依赖'))
        if (error.killed) return reject(failure(504,'转换超过 2 分钟，请拆分 PDF 后重试'))
        const messages = {2:'PDF 需要密码，请先使用密码解密后再上传',3:'未检测到可提取文字；扫描件需要先进行 OCR 识别',4:'PDF 无法转换，文件可能损坏或排版不受支持',5:'PDF 转 Word 最多支持 100 页、20MB'}
        reject(failure(422,messages[error.code] || 'PDF 转换失败，请检查文件或拆分后重试'))
      })
      child.stdin.on('error',()=>{})
      child.stdin.end(buffer)
    })
  } finally { running = false }
}
