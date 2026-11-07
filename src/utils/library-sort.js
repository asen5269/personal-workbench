const collator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'})
export function sortLibraryItems(items,field='name',direction='asc',foldersFirst=true){
  const type=item=>item.kind==='folder'?'文件夹':item.name.includes('.')?item.name.split('.').pop().toLowerCase():'文件'
  return [...items].sort((a,b)=>{
    if(foldersFirst&&a.kind!==b.kind)return a.kind==='folder'?-1:1
    const value=field==='created'?a.created-b.created:field==='size'?a.size-b.size:field==='type'?collator.compare(type(a),type(b)):collator.compare(a.name,b.name)
    return (value||collator.compare(a.name,b.name)||collator.compare(a.id,b.id))*(direction==='desc'?-1:1)
  })
}
