export async function netease(path,options={}){
  const response=await fetch('/api/music/netease/'+path,options),data=await response.json()
  if(!response.ok)throw Error(data.error||'网易云请求失败')
  return data
}
export function neteaseAction(action,params){return netease('action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,params,confirmed:true})})}
