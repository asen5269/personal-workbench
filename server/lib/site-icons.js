import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import sharp from 'sharp'
import decodeIco from 'decode-ico'

const directory = join(process.env.WORKBENCH_DATA_DIR?join(process.env.WORKBENCH_DATA_DIR,'public'):join(import.meta.dirname,'../../public'), 'site-icons')
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m => [m[1].toLowerCase(), m[2] ?? m[3] ?? m[4]]))
export async function fetchSiteIcon(input) {
  const site = new URL(input)
  if (!['http:', 'https:'].includes(site.protocol)) throw Error('请输入网站网址')
  const signal = AbortSignal.timeout(25000)
  const fetchResource = async (url, max) => {
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]), headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!response.ok) throw Error('获取失败')
    let size = 0; const chunks = []
    for await (const chunk of response.body) { size += chunk.length; if (size > max) { await response.body.cancel().catch(()=>{}); throw Error('文件过大') } chunks.push(chunk) }
    return { data: Buffer.concat(chunks), url: response.url }
  }
  const candidates = []
  const add = (url, size = 0) => { try { const resolved = new URL(url.replace(/&amp;/g, '&'), site); if (['http:', 'https:'].includes(resolved.protocol)) candidates.push({ url: resolved.href, size }) } catch {} }
  try {
    const page = await fetchResource(site.href, 2 * 1024 * 1024)
    const html = page.data.toString('utf8')
    const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => attributes(m[0]))
    for (const link of links) if (/icon/i.test(link.rel || '') && link.href) add(new URL(link.href, page.url).href, link.type === 'image/svg+xml' ? 1024 : Math.max(...(link.sizes?.match(/\d+/g)?.map(Number) || [link.rel.includes('apple') ? 180 : 32])))
    const manifest = links.find(link => link.rel === 'manifest')
    if (manifest?.href) try {
      const resource = await fetchResource(new URL(manifest.href, page.url).href, 256 * 1024)
      for (const icon of JSON.parse(resource.data.toString()).icons || []) if (icon.src) add(new URL(icon.src, resource.url).href, Math.max(...(icon.sizes?.match(/\d+/g)?.map(Number) || [0])))
    } catch {}
  } catch {}
  add('/apple-touch-icon.png', 180); add('/favicon.ico', 16)
  const sorted = [...new Map(candidates.sort((a,b)=>b.size-a.size).map(c=>[c.url,c])).values()].slice(0,8)
  let best
  for (const candidate of sorted) {
    if (signal.aborted) break
    try {
      const { data } = await fetchResource(candidate.url, 3 * 1024 * 1024)
      let source = data
      // ICO containers may include PNG images; libvips does not decode ICO directly.
      if (data.length >= 6 && data.readUInt32LE(0) === 65536) {
        const frame=decodeIco(data).sort((a,b)=>Math.min(b.width,b.height)-Math.min(a.width,a.height))[0]
        if (!frame) continue
        source=frame.type==='png'?Buffer.from(frame.data):await sharp(Buffer.from(frame.data),{raw:{width:frame.width,height:frame.height,channels:4}}).png().toBuffer()
      }
      const metadata = await sharp(source, { limitInputPixels: 16e6 }).metadata()
      const size = metadata.format === 'svg' ? 1024 : Math.min(metadata.width || 0, metadata.height || 0)
      if (!best || size > best.size) best = { source, size, url: candidate.url }
      if (size >= 512) break
    } catch {}
  }
  if (!best) throw Error('未能获取网站图标，请上传图片')
  const output = await sharp(best.source, { density: 192, limitInputPixels: 16e6 }).resize(256,256,{fit:'inside',withoutEnlargement:best.size<256}).png().toBuffer()
  const filename=createHash('sha256').update(output).digest('hex')+'.png'
  await mkdir(directory,{recursive:true});await writeFile(join(directory,filename),output)
  return { icon:'/site-icons/'+filename, source:best.url, sourceSize:best.size }
}
