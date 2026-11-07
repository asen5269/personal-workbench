import { reactive } from 'vue'
export const branding=reactive({name:'个人工作台',logo:''})
try { Object.assign(branding,JSON.parse(localStorage.getItem('workbench-branding'))||{}) } catch {}
