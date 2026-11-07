import { createApp, h } from 'vue'
import './css/style.css'
import { ElConfigProvider, ElButton, ElDialog, ElInput, ElInputNumber, ElForm, ElFormItem, ElDatePicker, ElCheckbox, ElSelect, ElOption, ElAlert, ElMenu, ElMenuItem, ElTable, ElTableColumn, ElTag, ElEmpty, ElLink, ElDescriptions, ElDescriptionsItem, ElSlider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import App from './App.vue'
import { router } from './router.js'
import './css/element-theme.css'
import './css/workspace-header.css'
import './css/design-tokens.css'
import './css/layout.css'
import './css/widgets.css'
import './css/weather-reference.css'
import AppCard from './components/AppCard.vue'
import './css/cards.css'
import './css/sidebar.css'
import './css/settings.css'
import './css/player-theme.css'
import './css/black-white-theme.css'
import './css/borderless.css'
import './css/test-video-reference.css'
import './css/tools-studio.css'
import './css/tool-selects.css'
import './css/bookmark-form.css'
import './css/input-borders.css'

const app = createApp({ render: () => h(ElConfigProvider, { locale: zhCn }, () => h(App)) })
document.addEventListener('keydown', event => {
  if (['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) document.documentElement.dataset.keyboardFocus = 'true'
}, true)
document.addEventListener('pointerdown', () => { delete document.documentElement.dataset.keyboardFocus }, true)
for (const component of [ElButton, ElDialog, ElInput, ElInputNumber, ElForm, ElFormItem, ElDatePicker, ElCheckbox, ElSelect, ElOption, ElAlert, ElMenu, ElMenuItem, ElTable, ElTableColumn, ElTag, ElEmpty, ElLink, ElDescriptions, ElDescriptionsItem, ElSlider]) app.component(component.name, component)
app.component('AppCard', AppCard)
app.use(router)
router.isReady().then(() => app.mount('#app'))

