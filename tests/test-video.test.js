import test from 'node:test'
import assert from 'node:assert/strict'
import {videoDimensions,imagePlacement} from '../src/utils/test-video.js'
test('video dimensions preserve common landscape, portrait and square ratios',()=>{
  assert.deepEqual(videoDimensions(1080,'16:9'),{width:1920,height:1080})
  assert.deepEqual(videoDimensions(720,'9:16'),{width:720,height:1280})
  assert.deepEqual(videoDimensions(480,'1:1'),{width:480,height:480})
  for(const ratio of ['16:9','9:16','1:1','4:3','3:4'])for(const resolution of [360,480,720,1080,2160]){
    const {width,height}=videoDimensions(resolution,ratio)
    assert.equal(width%2,0);assert.equal(height%2,0)
  }
})
test('image fitting either preserves whole image or fills frame with centered crop',()=>{
  assert.deepEqual(imagePlacement(100,100,200,100),{x:50,y:0,width:100,height:100})
  assert.deepEqual(imagePlacement(100,100,200,100,'cover'),{x:0,y:-50,width:200,height:200})
})
