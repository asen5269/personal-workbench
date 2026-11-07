import { parentPort, workerData } from 'node:worker_threads'
import vtracer from '@visioncortex/vtracer'

try {
  const svg=vtracer.convertBuffer(new Uint8Array(workerData),{clustering:'watershed',watershedDetail:240,colorPrecision:8,layerDifference:1,filterSpeckle:0,hierarchical:'cutout',mode:'spline',lengthThreshold:1,maxIterations:10,cornerThreshold:60,spliceThreshold:45,pathPrecision:6,optimize:0})
  parentPort.postMessage({svg})
}catch{parentPort.postMessage({error:'SVG 描摹失败，请尝试更简单的图标或线稿'})}
