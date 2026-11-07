let database
function db(){return database??=new Promise((resolve,reject)=>{const req=indexedDB.open('workbench-bookshelf',1);req.onupgradeneeded=()=>req.result.createObjectStore('books',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>{database=null;reject(req.error)}})}
export async function bookshelfStorage(mode,action){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('books',mode),req=action(tx.objectStore('books'));tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
export async function listBooks(){
  const d=await db()
  return new Promise((resolve,reject)=>{
    const books=[],tx=d.transaction('books','readonly'),request=tx.objectStore('books').openCursor()
    request.onsuccess=()=>{const cursor=request.result;if(cursor){const {id,title,created,length}=cursor.value;books.push({id,title,created,length});cursor.continue()}}
    tx.oncomplete=()=>resolve(books.sort((a,b)=>b.created-a.created));tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
  })
}
