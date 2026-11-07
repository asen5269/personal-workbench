<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElTooltip } from 'element-plus'
import { IconMapPinFilled, IconChevronRight, IconDroplet, IconStack2 } from '@tabler/icons-vue'
const weather=ref(null), location=ref('当前位置'), busy=ref(false), error=ref(''), city=ref(''), editing=ref(false)
const description=computed(()=>{const c=weather.value?.weather_code;return c===0?'晴朗':c<=3?'多云':c<=48?'有雾':c<=67?'有雨':c<=77?'有雪':c<=82?'阵雨':c<=86?'阵雪':'雷雨'})
async function load(lat,lon,name) {
  busy.value=true;error.value=''
  try { const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,relative_humidity_2m&timezone=auto`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error();const data=await r.json();if(!data.current)throw Error();weather.value=data.current;location.value=name;editing.value=false;try{localStorage.setItem('workbench-weather-location',JSON.stringify({lat,lon,name}))}catch{} }
  catch { error.value='天气获取失败，请重试' } finally {busy.value=false}
}
function locate(){busy.value=true;error.value='';if(!navigator.geolocation){busy.value=false;editing.value=true;return}navigator.geolocation.getCurrentPosition(p=>load(p.coords.latitude,p.coords.longitude,'当前位置'),()=>{busy.value=false;error.value='定位不可用，请输入城市';editing.value=true},{timeout:10000})}
async function search(){if(!city.value.trim()||busy.value)return;busy.value=true;error.value='';try{const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.value.trim())}&count=1&language=zh`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error();const data=await r.json();const place=data.results?.[0];if(!place){error.value='未找到城市';return}await load(place.latitude,place.longitude,place.name)}catch{error.value='城市查询失败，请重试'}finally{busy.value=false}}
onMounted(()=>{try{const saved=JSON.parse(localStorage.getItem('workbench-weather-location'));if(saved){load(saved.lat,saved.lon,saved.name);return}}catch{}locate()})
</script>
<template>
  <section class="weather-card" aria-label="天气" :aria-busy="busy">
    <div class="weather-art" aria-hidden="true"><img src="/weather-cloud.png" alt=""/></div>
    <div class="weather-info"><div class="weather-location"><ElTooltip content="切换城市" placement="top"><button @click="editing=!editing"><IconMapPinFilled :size="13"/>{{location}}<IconChevronRight :size="13"/></button></ElTooltip><span v-if="busy">更新中</span></div>
      <div class="weather-reading"><strong>{{weather?Math.round(weather.temperature_2m):'--'}}<small>°C</small></strong><span>{{weather?description:'天气'}}</span></div>
      <form v-if="editing" class="weather-city" @submit.prevent="search"><el-input v-model="city" size="small" aria-label="城市名称" placeholder="输入城市"/><el-button size="small" :loading="busy" native-type="submit">确定</el-button></form>
      <p v-else-if="error" class="weather-error" role="status">{{error}} <button @click="locate">重试</button></p><p v-else-if="weather" class="weather-meta"><span><IconDroplet :size="15"/>湿度 {{weather.relative_humidity_2m}}%</span><a href="https://open-meteo.com/" target="_blank" rel="noreferrer"><IconStack2 :size="16"/>Open-Meteo</a></p>
      <p v-if="editing&&error" class="weather-error" role="status">{{error}}</p>
    </div>
  </section>
</template>
