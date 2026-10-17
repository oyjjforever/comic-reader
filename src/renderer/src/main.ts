import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import pinia from '@renderer/plugins/store'
import router from '@renderer/plugins/router'
//main.js
import '@imengyu/vue3-context-menu/lib/vue3-context-menu.css'

// 修复naive-ui样式被覆盖的问题
const meta = document.createElement('meta')
meta.name = 'naive-ui-style'
document.head.appendChild(meta)

// 全局错误兜底：未捕获的渲染错误默认会中断 Vue 补丁导致白屏，这里接管后仅记录不中断
const app = createApp(App)
app.config.errorHandler = (err, _instance, info) => {
  console.error('[Vue ErrorHandler]', info, err)
}
window.addEventListener('error', (e) => {
  console.error('[Window Error]', e.error || e.message, e.filename, e.lineno)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled Rejection]', e.reason)
})

app.use(pinia).use(router).mount('#app')
