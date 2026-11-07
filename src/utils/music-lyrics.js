export function parseLyrics(text=''){
  const lines=[]
  for(const line of text.split(/\r?\n/)){
    const words=line.replace(/\[[^\]]*\]/g,'').trim()
    if(!words)continue
    for(const match of line.matchAll(/\[(\d+):(\d{1,2}(?:\.\d+)?)\]/g))lines.push({time:Number(match[1])*60+Number(match[2]),text:words})
  }
  return lines.sort((a,b)=>a.time-b.time)
}
export function activeLyric(lines,time){let index=-1;for(let i=0;i<lines.length&&lines[i].time<=time;i++)index=i;return index}
