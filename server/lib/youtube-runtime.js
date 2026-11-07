import {getQuickJS} from 'quickjs-emscripten'
export async function evaluateYouTube(data){
  const engine=await getQuickJS(),runtime=engine.newRuntime(),deadline=Date.now()+3000
  runtime.setMemoryLimit(32*1024*1024);runtime.setMaxStackSize(1024*1024);runtime.setInterruptHandler(()=>Date.now()>deadline)
  const context=runtime.newContext()
  try{const result=context.evalCode(`(function(){${data.output}\n})()`);if(result.error){const error=context.dump(result.error);result.error.dispose();throw Error(error.message||'YouTube 播放地址解码失败')}const value=context.dump(result.value);result.value.dispose();return value}finally{context.dispose();runtime.dispose()}
}
