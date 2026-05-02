import {
    createRouter,
    createWebHashHistory,
} from 'vue-router'
import modules from './modules'
import pinia, { useSettingStore } from '@renderer/plugins/store'

let settingStore = useSettingStore(pinia)

// 创建路由对象
const router = createRouter({
    history: createWebHashHistory(),
    routes: modules,
})

// 定义页面标题
let title = "漫画阅读器"

// 注册路由前置守卫
router.beforeEach(async (to, _from, next) => {
    // 判断是否有标题
    if (to.meta.title) {
        document.title = title + " - " + to.meta.title.toString()
    } else {
        document.title = title
    }

    // 更新设置信息
    await settingStore.updateSetting()

    // 同步 resourcePaths 到 HTTP 服务器，使用第一个路径作为默认资源路径
    const resourcePaths = settingStore.setting.resourcePaths || []
    if (resourcePaths.length > 0 && resourcePaths[0]) {
        window.server.setResourcePath(resourcePaths[0])
    }

    // 同步 videoResourcePaths 到 HTTP 服务器
    const videoResourcePaths = settingStore.setting.videoResourcePaths || []
    if (videoResourcePaths.length > 0 && videoResourcePaths[0]) {
        window.server.setVideoResourcePath(videoResourcePaths[0])
    }

    // 根据设置同步局域网中转服务的启停状态
    try {
        const serverStatus = await window.server.status()
        if (settingStore.setting.enableLanService && !serverStatus.running) {
            await window.server.start()
        } else if (!settingStore.setting.enableLanService && serverStatus.running) {
            await window.server.stop()
        }
    } catch (e) {
        console.warn('[Router] Failed to sync LAN service state:', e)
    }

    next()// 执行进入路由
})

export default router;