import { reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'

export const music = reactive({ tracks: [], onlineTracks: [], playlists: [], current: '', queue: [], playing: false, loading: false, quality:'standard', time: 0, duration: 0, volume: .7, muted: false, mode: 'list', remember: true, mini: true, busy: false, progress: '', error: '', ready: false })
watch(()=>music.error,message=>{if(message)ElMessage.error({message,grouping:true,showClose:true})})
export const findMusicTrack = id => music.tracks.find(t => t.id === id) || music.onlineTracks.find(t => t.id === id)
export const currentTrack = computed(() => findMusicTrack(music.current))
const audio = new Audio()
let db, objectUrl, pendingTime = 0, lastSave = 0, cancelled = false, generation = 0
const formats = /\.(mp3|m4a|aac|wav|ogg|flac|opus|webm)$/i
const openDb = new Promise((resolve, reject) => {
  const request = indexedDB.open('workbench-music', 1)
  request.onupgradeneeded = () => { request.result.createObjectStore('tracks', { keyPath: 'id' }); request.result.createObjectStore('settings') }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
async function store(name, mode, operation) {
  db ||= await openDb
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode), request = operation(tx.objectStore(name))
    tx.oncomplete = () => resolve(request?.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || Error('音乐数据保存失败'))
  })
}
export async function saveMusic() {
  try { await store('settings', 'readwrite', s => s.put({ playlists: JSON.parse(JSON.stringify(music.playlists)), current: music.current, queue: [...music.queue], time: music.remember ? music.time : 0, quality:music.quality, volume: music.volume, muted: music.muted, mode: music.mode, remember: music.remember }, 'player')) }
  catch { music.error = '音乐设置保存失败，请检查浏览器存储空间' }
}
export async function initMusic() {
  if (music.ready) return
  try {
    music.tracks = (await store('tracks', 'readonly', s => s.getAll())).filter(t=>!t.provider||t.provider==='netease')
    const saved = await store('settings', 'readonly', s => s.get('player'))
    if (saved) Object.assign(music, saved)
    music.queue=music.queue.filter(id=>findMusicTrack(id))
    music.playlists.forEach(p=>{p.tracks=p.tracks.filter(id=>findMusicTrack(id))})
    if(!findMusicTrack(music.current)){music.current='';music.time=0}
    pendingTime = music.remember ? music.time : 0
    music.duration = currentTrack.value?.duration || 0
    audio.volume = music.volume; audio.muted = music.muted
  } catch { music.error = '无法读取本地音乐库，请允许浏览器存储' }
  music.ready = true
}
export function formatTime(value) { return Number.isFinite(value) ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00' }
export async function collectOnlineTrack(track) {
  if(track.provider!=='netease'||!track.playable) throw Error('此歌曲未开放在线收听')
  const existing=music.tracks.find(t=>t.id===track.id)
  if(existing) return existing
  const saved={...track,liked:false,lastPlayed:0}
  await store('tracks','readwrite',s=>s.put(saved))
  music.tracks.push(saved)
  return music.tracks.find(t=>t.id===track.id)
}
export async function playOnlineTrack(track, queue = [track]) {
  for(const item of queue) if(!music.onlineTracks.some(t=>t.id===item.id)) music.onlineTracks.push({...item,liked:false,lastPlayed:0})
  if(!findMusicTrack(track.id)) music.onlineTracks.push({...track,liked:false,lastPlayed:0})
  return playTrack(track.id,queue.filter(t=>t.playable).map(t=>t.id))
}
async function source(track) {
  if (!track.handle) return track.file
  if (await track.handle.queryPermission({ mode: 'read' }) !== 'granted' && await track.handle.requestPermission({ mode: 'read' }) !== 'granted') throw Error('需要重新授权音乐文件访问，请点击播放并允许读取')
  return track.handle.getFile()
}
export async function playTrack(id, queue, automatic = false) {
  const track = findMusicTrack(id)
  if (!track) return
  if(track.provider && track.provider!=='netease'){music.error='此音源已停用';return}
  const token = ++generation
  music.error = ''; music.mini = true; music.loading = true
  if (queue) music.queue = [...queue]
  try {
    if (id !== music.current || !audio.src || audio.error) {
      audio.pause()
      let nextSource
      if(track.provider==='netease') {
        const suffix=music.quality==='standard'?'':'?quality='+encodeURIComponent(music.quality)
        const response=await fetch(`/api/music/netease/tracks/${encodeURIComponent(track.providerId)}${suffix}`,{signal:AbortSignal.timeout(20000)})
        const fresh=await response.json()
        if(!response.ok) throw Error(fresh.error || '网易云歌曲信息加载失败')
        if(!fresh.playable) throw Error(fresh.unavailableReason || '此歌曲暂时无法播放')
        if(token!==generation) return
        Object.assign(track,fresh)
        nextSource=`/api/music/netease/stream/${encodeURIComponent(track.providerId)}${suffix}`
      } else {
        const file = await source(track)
        if(token!==generation) return
        nextSource=URL.createObjectURL(file)
      }
      if (token !== generation) return
      if (id !== music.current) pendingTime = 0
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      objectUrl = track.provider==='netease' ? null : nextSource; music.current = id; music.time = pendingTime; music.duration = track.duration || 0
      audio.src = nextSource
    }
    if (token !== generation) return
    await audio.play()
    if (token !== generation) return
    track.lastPlayed = Date.now()
    await store('tracks', 'readwrite', s => s.put({ ...track }))
    if(!music.tracks.some(t=>t.id===id)) music.tracks.push({...track})
    saveMusic()
    return true
  } catch (error) { if (token === generation && !automatic) music.error = track.provider==='netease' ? (error.name==='NotSupportedError'?'网易云音频暂时无法播放，请重试或前往歌曲来源页面':error.message) : error.name === 'NotFoundError' ? '文件不存在或已移动，请重新定位这首歌曲' : error.name === 'NotSupportedError' ? '无法解码此文件，请检查音频格式或文件是否损坏' : error.message; return false }
  finally { if(token===generation) music.loading=false }
}
export function togglePlay() { if (music.playing) { audio.pause(); saveMusic() } else playTrack(music.current || music.tracks[0]?.id) }
export function stopMusic() { ++generation; music.loading=false; audio.pause(); if (audio.src) audio.currentTime = 0; pendingTime = 0; music.time = 0; saveMusic() }
export function resetOnlinePlayback(){if(currentTrack.value?.provider==='netease'){stopMusic();audio.removeAttribute('src');audio.load?.();music.duration=currentTrack.value.duration||0}}
export function pauseMusic(){++generation;music.loading=false;audio.pause();saveMusic()}
export function setMusicQuality(quality){const wasPlaying=music.playing,position=music.time,id=music.current;music.quality=quality;if(currentTrack.value?.provider==='netease'){++generation;music.loading=false;audio.pause();audio.removeAttribute('src');audio.load?.();pendingTime=position;music.time=position;if(wasPlaying)playTrack(id)}saveMusic()}
export function seek(value) {
  if(!audio.src && currentTrack.value) { pendingTime=Math.max(0,Math.min(Number(value),music.duration));music.time=pendingTime;saveMusic() }
  else if (Number.isFinite(audio.duration)) { audio.currentTime = Number(value); music.time = Number(value); saveMusic() }
}
export function setVolume(value) { music.volume = Number(value); audio.volume = music.volume; music.muted = false; audio.muted = false; saveMusic() }
export function muteMusic() { music.muted = !music.muted; audio.muted = music.muted; saveMusic() }
export function step(direction = 1, ended = false) {
  const queue = music.queue.filter(id => findMusicTrack(id))
  const ids = queue.length ? queue : music.tracks.map(t => t.id)
  if (!ids.length) return
  if (ended && music.mode === 'one') { seek(0); playTrack(music.current); return }
  let index = ids.indexOf(music.current) + direction
  if (music.mode === 'shuffle') { const others = ids.filter(id => id !== music.current); playTrack(others[Math.floor(Math.random() * others.length)] || ids[0]); return }
  if (ended && index >= ids.length && music.mode === 'order') { audio.pause(); saveMusic(); return }
  playTrack(ids[(index + ids.length) % ids.length])
}
audio.addEventListener('play', () => { music.playing = true })
audio.addEventListener('pause', () => { music.playing = false })
audio.addEventListener('timeupdate', () => { music.time = audio.currentTime; if (Date.now() - lastSave > 10000) { lastSave = Date.now(); saveMusic() } })
audio.addEventListener('loadedmetadata', () => { music.duration = Number.isFinite(audio.duration) ? audio.duration : 0; if (pendingTime && pendingTime < music.duration) audio.currentTime = pendingTime; pendingTime = 0 })
async function advanceAutomatically(){
  if(music.mode==='one'){seek(0);playTrack(music.current);return}
  const ids=(music.queue.length?music.queue:music.tracks.map(t=>t.id)).filter(id=>findMusicTrack(id))
  const index=ids.indexOf(music.current)
  let candidates=music.mode==='order'?ids.slice(index+1):[...ids.slice(index+1),...ids.slice(0,index+1)]
  if(music.mode==='shuffle')candidates=candidates.filter(id=>id!==music.current).sort(()=>Math.random()-.5)
  let expected=generation
  for(const id of candidates){
    if(expected!==generation)return
    const attempt=playTrack(id,undefined,true)
    expected=generation
    const played=await attempt
    if(expected!==generation||played)return
    await new Promise(resolve=>setTimeout(resolve,1000))
  }
  if(expected===generation){music.playing=false;if(candidates.length)music.error='当前播放队列均未能播放，请稍后重试';saveMusic()}
}
audio.addEventListener('ended', advanceAutomatically)
audio.addEventListener('error', () => { music.playing = false; music.loading=false; music.error = currentTrack.value?.provider==='netease'?'网易云音频加载失败，请检查网络、重试或前往歌曲来源页面':'音频无法播放：文件损坏或当前浏览器不支持此编码，请重新定位或移除' })
window.addEventListener('pagehide', saveMusic)

function probe(file) {
  return new Promise(resolve => {
    const element = new Audio(), url = URL.createObjectURL(file)
    const done = duration => { clearTimeout(timer); element.removeAttribute('src'); element.load(); URL.revokeObjectURL(url); resolve(duration) }
    const timer = setTimeout(() => done(0), 5000)
    element.onloadedmetadata = () => done(Number.isFinite(element.duration) ? element.duration : 0)
    element.onerror = () => done(0); element.src = url
  })
}
async function readTags(file) {
  try {
    const { parseBlob } = await import('music-metadata')
    const { common } = await parseBlob(file, { duration: false })
    const picture = common.picture?.find(p => ['image/jpeg','image/png','image/webp'].includes(p.format) && p.data.length <= 2 * 1024 * 1024)
    let cover = ''
    if (picture) cover = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => resolve(''); reader.readAsDataURL(new Blob([picture.data], { type: picture.format })) })
    return { title: common.title, artist: common.artist, album: common.album || '', cover }
  } catch { return {} }
}
async function fallbackFiles() {
  return new Promise(resolve => {
    const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.accept = 'audio/*'
    input.onchange = () => resolve([...input.files].map(file => ({ file })))
    input.oncancel = () => resolve([]); input.click()
  })
}
async function* walk(handle, prefix = '') {
  for await (const entry of handle.values()) {
    if (entry.kind === 'directory') yield* walk(entry, prefix + entry.name + '/')
    else if (formats.test(entry.name)) yield { handle: entry, relative: prefix + entry.name }
  }
}
export function cancelImport() { cancelled = true }
export async function importMusic(folder = false, replaceId = '') {
  if (music.busy) return
  music.busy = true; music.error = ''; cancelled = false
  let added = 0, skipped = 0, failed = 0
  try {
    let entries
    if (folder) {
      if (!window.showDirectoryPicker) throw Error('此浏览器不支持文件夹授权，请使用导入文件')
      const root = await window.showDirectoryPicker(); entries = walk(root)
    } else if (window.showOpenFilePicker) entries = (await window.showOpenFilePicker({ multiple: !replaceId, types: [{ description: '音频', accept: { 'audio/*': ['.mp3','.m4a','.aac','.wav','.ogg','.flac','.opus','.webm'] } }] })).map(handle => ({ handle }))
    else entries = await fallbackFiles()
    for await (const entry of entries) {
      if (cancelled) break
      try {
        const file = entry.file || await entry.handle.getFile()
        if (!formats.test(file.name)) { skipped++; continue }
        music.progress = `正在读取 ${file.name}`
        let duplicate = false
        for (const old of music.tracks) {
          if (old.id === replaceId) continue
          if (entry.handle && old.handle ? await entry.handle.isSameEntry(old.handle) : !entry.handle && !old.handle && old.identity === `${file.name}:${file.size}:${file.lastModified}`) { duplicate = true; break }
        }
        if (duplicate) { skipped++; continue }
        const duration = await probe(file)
        if (!duration) { failed++; continue }
        const parts = file.name.replace(/\.[^.]+$/, '').split(' - ')
        const tags = await readTags(file), previous = music.tracks.find(t => t.id === replaceId)
        const track = { id: replaceId || crypto.randomUUID(), title: tags.title || (parts.length > 1 ? parts.slice(1).join(' - ') : parts[0]), artist: tags.artist || (parts.length > 1 ? parts[0] : '未知艺人'), album: tags.album || '', cover: tags.cover || '', duration, identity: `${file.name}:${file.size}:${file.lastModified}`, name: file.name, lastPlayed: previous?.lastPlayed || 0, liked: previous?.liked || false, ...(entry.handle ? { handle: entry.handle } : { file }) }
        await store('tracks', 'readwrite', s => s.put(track))
        const index = music.tracks.findIndex(t => t.id === track.id)
        if (index < 0) music.tracks.push(track); else { music.tracks[index] = track; if (music.current === track.id) { stopMusic(); audio.removeAttribute('src') } }
        added++
      } catch { failed++ }
    }
    music.progress = `${cancelled ? '已取消 · ' : ''}已导入 ${added} 首 · 重复 ${skipped} 首 · 失败 ${failed} 首`
  } catch (error) { if (error.name !== 'AbortError') music.error = error.message }
  finally { music.busy = false }
}
export async function removeTrack(id) {
  await store('tracks', 'readwrite', s => s.delete(id))
  if (music.current === id) { stopMusic(); audio.removeAttribute('src'); music.current = ''; music.duration = 0 }
  music.tracks = music.tracks.filter(t => t.id !== id)
  music.onlineTracks = music.onlineTracks.filter(t => t.id !== id)
  music.queue = music.queue.filter(x => x !== id)
  music.playlists.forEach(p => { p.tracks = p.tracks.filter(x => x !== id) }); saveMusic()
}
export async function likeTrack(track) { track.liked = !track.liked; await store('tracks', 'readwrite', s => s.put({ ...track })) }
