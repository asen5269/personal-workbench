import {detectPlatform,parsePlatform} from './platforms.js'
export {detectPlatform} from './platforms.js'
const headers = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  Referer: 'https://www.douyin.com/',
}
const unique = values => [...new Set(values.filter(value => typeof value === 'string' && /^https?:\/\//i.test(value)))]
const decode = text => String(text || '').replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => { const value = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n); return value <= 0x10ffff ? String.fromCodePoint(value) : '' }).replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, key) => ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '})[key])
const allowed = url => { const host = new URL(url).hostname; return ['douyin.com','iesdouyin.com'].some(domain => host === domain || host.endsWith('.' + domain)) }
export function extractUrl(input) {
  const normalized = String(input).replace(/(https?)\\+:(?:\\*\/){2}/gi, '$1://')
  const url = normalized.match(/https?:\/\/[^\s，,。！!）)<>"']+/i)?.[0]
  if (!url || detectPlatform(url)==='unknown') throw Error('请输入支持平台的作品链接或分享内容')
  return url
}
const awemeId = url => url.match(/\/(?:video|note)\/(\d+)|[?&]modal_id=(\d+)|\/(\d{15,})/)?.slice(1).find(Boolean)
export function routerDetail(source) {
  const text = source.match(/window\._ROUTER_DATA\s*=\s*([\s\S]*?);?\s*<\/script>/)?.[1]
  if (!text) return null
  try {
    const data = JSON.parse(text)
    for (const loader of Object.values(data.loaderData || {})) {
      const item = loader?.videoInfoRes?.item_list?.[0]
      if (item && typeof item === 'object') return item
    }
  } catch {}
  return null
}
export function extractDetail(detail) {
  const description = decode(detail.desc || detail.title).trim()
  const [title, ...lines] = description.split('\n')
  const images = unique((detail.images || []).flatMap(image => (image.url_list || image.display_image?.url_list || image.origin_url_list || image.download_addr?.url_list || []).slice(0,1)))
  const video = detail.video || {}, candidates = [], uris=new Set()
  if (!images.length && ![2,68,150].includes(detail.aweme_type)) {
    for (const addr of [...Object.entries(video).filter(([key])=>key.startsWith('play_addr')||key.startsWith('download_addr')).map(([,value])=>value), ...(video.bit_rate || []).flatMap(rate=>Object.entries(rate).filter(([key])=>key.startsWith('play_addr')||key.startsWith('download_addr')).map(([,value])=>value))]) {
      if(typeof addr?.uri==='string'&&!addr.uri.includes('/')&&!addr.uri.startsWith('http'))uris.add(addr.uri)
      for (const url of [...(addr?.url_list||[]),...(addr?.download_url_list||[])]) {
        if (typeof url !== 'string' || !URL.canParse(url)) continue
        const parsed = new URL(url)
        if (['douyin.com','iesdouyin.com','amemv.com','snssdk.com'].some(domain => parsed.hostname === domain || parsed.hostname.endsWith('.'+domain)) && parsed.pathname === '/aweme/v1/playwm/') {
          parsed.pathname = '/aweme/v1/play/'
          candidates.push(parsed.href)
        }
        candidates.push(url)
      }
    }
  }
  const videos = unique(candidates).slice(0,1)
  const ids=uris
  for(const candidate of candidates){const u=new URL(candidate);if(['douyin.com','iesdouyin.com','amemv.com','snssdk.com'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d))&&/^\/aweme\/v1\/play(?:wm)?\/$/.test(u.pathname)){const id=u.searchParams.get('video_id');if(id)ids.add(id)}}
  for(const id of ids)for(const [host,line] of [['api-play-hl.amemv.com','0'],['api-play.amemv.com','1'],['www.iesdouyin.com','0']])candidates.push(`https://${host}/aweme/v1/play/?${new URLSearchParams({video_id:id,ratio:'default',line,is_play_url:'1',source:'PackSourceEnum_AWEME_DETAIL'})}`)
  if (videos.length) images.push(...unique((video.origin_cover || video.cover)?.url_list || []).slice(0,1))
  return {title, content:lines.join('\n'), images, videos, video_candidates:unique(candidates).map(url => ({url,default_probe:new URL(url).searchParams.get('ratio')==='default'})), video_duration_ms:video.duration || detail.duration || 0}
}
function meta(source, property) {
  for (const tag of source.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(m => [m[1].toLowerCase(),decode(m[3])]))
    if ((attrs.property || attrs.name) === property) return attrs.content || ''
  }
  return ''
}
export async function parseMedia(input, {fetchImpl = fetch} = {}) {
  const url = extractUrl(input),platform=detectPlatform(url)
  if(platform!=='douyin')return parsePlatform(url,platform,{fetchImpl})
  const signal = AbortSignal.timeout(85000), cookies = new Map()
  async function request(target) {
    for (let redirects = 0; redirects < 8; redirects++) {
      if (!allowed(target)) throw Error('作品链接跳转到不支持的地址')
      const response = await fetchImpl(target, {headers:{...headers, Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}, redirect:'manual', signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])})
      for (const cookie of response.headers.getSetCookie?.() || []) { const [pair] = cookie.split(';'), index = pair.indexOf('='); if(index>0)cookies.set(pair.slice(0,index),pair.slice(index+1)) }
      const location = response.headers.get('location')
      if ([301,302,303,307,308].includes(response.status) && location) { await response.body?.cancel();target = new URL(location,target).href;continue }
      if (!response.ok) throw Error(`平台返回 HTTP ${response.status}`)
      return {source:await response.text(),url:target}
    }
    throw Error('分享链接跳转次数过多')
  }
  let id = awemeId(url), source = ''
  if (!id) { const resolved = await request(url);id = awemeId(resolved.url);source = resolved.source }
  if (!id) throw Error('无法识别作品 ID，链接可能失效或需要登录')
  let detail = routerDetail(source), lastError
  if (!detail) for (const suffix of [`video/${id}/`,`video/${id}`,`note/${id}/`]) {
    try { const response = await request('https://www.iesdouyin.com/share/'+suffix);source = response.source;detail = routerDetail(source);if(detail)break } catch(error) { lastError=error;if(signal.aborted)throw error }
  }
  const data = detail ? extractDetail(detail) : {title:meta(source,'og:title'),content:meta(source,'og:description'),images:unique([meta(source,'og:image')]),videos:[]}
  if (!detail && !data.title && !data.images.length) throw Error(lastError?.message || '无法获取公开作品数据，可能需要登录或暂时受到平台限制')
  return {platform:'douyin',note_id:id,...data,url:`https://www.douyin.com/${[2,68,150].includes(detail?.aweme_type) || (detail?.images?.length && !data.videos.length) ? 'note' : 'video'}/${id}`,warnings:detail?[]:['仅获取到公开页面信息，视频地址暂不可用']}
}
