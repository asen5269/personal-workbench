import { join, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url))
const engines=join(root,'engines')
process.env.PATH=[join(engines,'ffmpeg'),join(engines,'pandoc'),process.env.PATH||''].join(delimiter)
process.env.WORKBENCH_FFMPEG=join(engines,'ffmpeg','ffmpeg.exe')
process.env.WORKBENCH_PANDOC=join(engines,'pandoc','pandoc.exe')
process.env.WORKBENCH_SOFFICE=join(engines,'libreoffice','program','soffice.com')
process.env.WORKBENCH_PDF_PYTHON=join(engines,'python','python.exe')
await import('../server/index.js')
