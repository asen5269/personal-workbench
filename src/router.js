import { createRouter, createWebHistory } from 'vue-router'

export const pageRoutes = [
  ['overview', '/', '总览'],
  ['tasks', '/tasks', '待办任务'],
  ['account', '/accounts', '账号订阅'],
  ['server', '/servers', '服务器'],
  ['domain', '/domains', '域名'],
  ['parse', '/media-parser', '自媒体解析'],
  ['notes', '/notes', '每日笔记'],
  ['music', '/music', '音乐'],
  ['library', '/library', '资料库'],
  ['bookshelf', '/bookshelf', '书架'],
  ['image-tools', '/toolbox/images', '图片处理'],
  ['test-video', '/toolbox/test-video', '测试视频生成'],
  ['file-tools', '/toolbox/files', '文件转换'],
  ['food','/toolbox/food','今天吃什么？'],
].map(([name, path, title]) => ({ name, path, meta: { title } }))

export const router = createRouter({
  history: createWebHistory(),
  routes: [...pageRoutes, { path: '/:pathMatch(.*)*', redirect: '/' }],
})
router.afterEach(to => { document.title = `${to.meta.title} · 个人工作台` })


