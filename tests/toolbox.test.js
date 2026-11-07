import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import Database from 'better-sqlite3'
import { registerToolbox } from '../server/lib/toolbox.js'

test('工具箱默认美食、转盘配置保存与输入校验',async()=>{
  const app=Fastify(),db=new Database(':memory:')
  registerToolbox(app,db)
  try{
    const foods=(await app.inject('/api/toolbox/food')).json()
    assert.equal(foods.length,76);assert.equal(foods[0].calories,null)
    const options=[{id:'1',name:'甲',weight:1,image:''},{id:'2',name:'乙',weight:3,image:''}]
    assert.equal((await app.inject({method:'PUT',url:'/api/toolbox/wheel',payload:options})).statusCode,200)
    assert.deepEqual((await app.inject('/api/toolbox/wheel')).json(),options)
    for(const invalid of [[],[{...options[0],weight:-1},options[1]],[options[0],{...options[1],image:'javascript:alert(1)'}]])assert.equal((await app.inject({method:'PUT',url:'/api/toolbox/wheel',payload:invalid})).statusCode,400)
    assert.equal((await app.inject({method:'POST',url:'/api/toolbox/image',payload:{image:'data:image/png;base64,invalid'}})).statusCode,400)
  }finally{await app.close();db.close()}
})
