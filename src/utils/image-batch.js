export async function createImageArchive(results) {
  if(results.reduce((total,result)=>total+result.blob.size,0)>200*1024**2)throw Error('处理结果总大小超过 200MB，请分别下载')
  const entries=Object.create(null),used=new Set()
  for(const result of results){
    const original=result.name.replace(/[\\/\x00-\x1f]/g,'_')||'image'
    const dot=original.lastIndexOf('.'),stem=dot>0?original.slice(0,dot):original,extension=dot>0?original.slice(dot):''
    let name=original,index=2
    while(used.has(name.toLowerCase()))name=`${stem} (${index++})${extension}`
    used.add(name.toLowerCase());entries[name]=new Uint8Array(await result.blob.arrayBuffer())
  }
  const {zip}=await import('fflate')
  const data=await new Promise((resolve,reject)=>zip(entries,{level:0},(error,data)=>error?reject(error):resolve(data)))
  return new Blob([data],{type:'application/zip'})
}
