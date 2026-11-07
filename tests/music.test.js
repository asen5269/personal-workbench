import test from 'node:test'
import assert from 'node:assert/strict'
import { indexedDB } from 'fake-indexeddb'

test('曲库恢复不自动播放，单例切歌、播放模式、进度保存与移除同步', async () => {
  globalThis.indexedDB = indexedDB
  const engines = []
  class AudioEngine extends EventTarget {
    constructor() { super(); this.src = ''; this.currentTime = 0; this.duration = 120; this.paused = true; engines.push(this) }
    async play() { this.paused = false; this.dispatchEvent(new Event('play')) }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
    removeAttribute() { this.src = '' }
  }
  globalThis.Audio = AudioEngine
  globalThis.window = new EventTarget()
  const db = await new Promise(resolve => {
    const req = indexedDB.open('workbench-music', 1)
    req.onupgradeneeded = () => { req.result.createObjectStore('tracks', {keyPath:'id'}); req.result.createObjectStore('settings') }
    req.onsuccess = () => resolve(req.result)
  })
  const tx = db.transaction(['tracks','settings'],'readwrite')
  for (const id of ['a','b','c']) tx.objectStore('tracks').put({ id, title:id, artist:'Test', duration:120, file:new Blob(['audio'],{type:'audio/wav'}), lastPlayed:0 })
  tx.objectStore('tracks').put({id:'legacy:old',provider:'removed',title:'停用音源记录'})
  tx.objectStore('settings').put({ current:'b', queue:['a','b','c'], time:25, volume:.3, muted:false, mode:'order', remember:true, playlists:[{id:'p',name:'歌单',tracks:['b','c']}] },'player')
  await new Promise(resolve => { tx.oncomplete = resolve })
  const { music, initMusic, playTrack, togglePlay, step, seek, removeTrack, saveMusic, stopMusic, playOnlineTrack, collectOnlineTrack, setMusicQuality } = await import('../src/state/music.js')
  await initMusic()
  assert.equal(music.current,'b'); assert.equal(music.time,25); assert.equal(music.playing,false)
  assert.equal(music.duration,120)
  assert.equal(music.tracks.some(t=>t.id==='legacy:old'),false)
  assert.equal(engines.length,1)
  const engine = engines[0]
  await playTrack('b')
  engine.dispatchEvent(new Event('loadedmetadata'))
  assert.equal(engine.currentTime,25); assert.equal(music.playing,true)
  seek(40); togglePlay()
  assert.equal(music.playing,false)
  await playTrack('c'); engine.dispatchEvent(new Event('loadedmetadata'))
  step(1,true)
  assert.equal(music.current,'c'); assert.equal(music.playing,false)
  music.mode='one'; step(1,true)
  assert.equal(music.current,'c'); assert.equal(engine.currentTime,0)
  music.mode='list'; step(1,true)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(music.current,'a')
  await removeTrack('b')
  assert.deepEqual([...music.playlists[0].tracks],['c'])
  assert.ok(!music.queue.includes('b'))
  await removeTrack('a')
  assert.equal(music.current,''); assert.equal(music.playing,false)
  await saveMusic()
  const read = db.transaction('tracks').objectStore('tracks').getAll()
  const stored = await new Promise(resolve => { read.onsuccess = () => resolve(read.result) })
  assert.deepEqual(stored.map(t=>t.id),['c','legacy:old'])
  const previousFetch=globalThis.fetch
  const online={id:'netease:123',provider:'netease',providerId:'123',title:'Online',artist:'Artist',duration:180,playable:true}
  const next={...online,id:'netease:456',providerId:'456',title:'Next'}
  globalThis.fetch=async url=>Response.json(url.includes('456')?next:online)
  try {
    await playOnlineTrack(online,[online,next])
    assert.equal(engine.src,'/api/music/netease/stream/123')
    assert.equal(music.current,online.id)
    assert.equal(music.playing,true)
    assert.equal(music.tracks.filter(t=>t.id===online.id).length,1)
    let retryRequests=0
    globalThis.fetch=async url=>{retryRequests++;return Response.json(url.includes('456')?next:online)}
    engine.error={code:4}
    await playTrack(online.id)
    assert.equal(retryRequests,1,'音频失败后重新获取播放地址，不能直接复用失败的媒体状态')
    engine.error=null
    await collectOnlineTrack(online)
    assert.equal(music.tracks.filter(t=>t.id===online.id).length,1)
    step(1)
    await new Promise(resolve=>setTimeout(resolve,20))
    assert.equal(music.current,next.id)
    assert.equal(engine.src,'/api/music/netease/stream/456')
    seek(40);setMusicQuality('lossless')
    await new Promise(resolve=>setTimeout(resolve,20))
    engine.dispatchEvent(new Event('loadedmetadata'))
    assert.equal(engine.src,'/api/music/netease/stream/456?quality=lossless')
    assert.equal(engine.currentTime,40)
    assert.equal(engines.length,1)
    await assert.rejects(()=>collectOnlineTrack({...online,playable:false}))
    stopMusic()
    globalThis.fetch=async()=>Response.json({...online,playable:false,unavailableReason:'已下架'})
    await playOnlineTrack(online)
    assert.equal(music.error,'已下架')
    assert.equal(music.playing,false)
  } finally {globalThis.fetch=previousFetch}
  stopMusic(); db.close()
})
