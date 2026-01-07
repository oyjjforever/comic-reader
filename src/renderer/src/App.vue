<template>
  <n-config-provider :theme="theme" :theme-overrides="themeOverrides">
    <n-loading-bar-provider>
      <n-dialog-provider>
        <n-message-provider>
          <setting-provider>
            <Layout></Layout>
          </setting-provider>
        </n-message-provider>
      </n-dialog-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { useSettingStore } from '@renderer/plugins/store'
import { useNewArtworkDetectorStore } from '@renderer/plugins/store/newArtworkDetector'
import { ref, watch, onMounted, computed } from 'vue'
import { useOsTheme, GlobalTheme, darkTheme, lightTheme, type GlobalThemeOverrides } from 'naive-ui'
import Layout from '@renderer/layout/index.vue'
import { themeColors } from '@renderer/theme-config'
const settingStore = useSettingStore()
const newArtworkDetector = useNewArtworkDetectorStore()
const osTheme = useOsTheme()

// 自定义主题颜色覆盖
const themeOverrides = computed<GlobalThemeOverrides>(() => ({
  common: {
    primaryColor: themeColors.primary, // 主色调，在 theme-config.ts 中修改
    primaryColorHover: themeColors.hover,
    primaryColorPressed: themeColors.pressed,
    primaryColorSuppl: themeColors.suppl
  },
  // 可以继续添加其他组件的特定样式覆盖
  Button: {
    textColorPrimary: '#ffffff'
  }
}))

// 定义主题
const theme = computed(() => {
  // 根据设置选择基础主题
  if (settingStore.setting.theme === 'dark') {
    return darkTheme
  } else if (settingStore.setting.theme === 'auto') {
    return osTheme.value === 'dark' ? darkTheme : lightTheme
  }
  return lightTheme
})

// 应用启动时初始化新作品检测
onMounted(async () => {
  window.electron.ipcRenderer.invoke('update:check')
  // 延迟5秒后开始检测，避免应用启动时网络请求过多
  setTimeout(async () => {
    try {
      if (!settingStore.setting.enableAuthorUpdateCheck) return
      // 启动定时检测，每24小时检测一次
      const result = newArtworkDetector.startPeriodicCheck(24 * 60 * 60 * 1000, (newArtwork) => {
        console.log(`${newArtwork.authorName}(${newArtwork.source}) 有新作品发布！`)
      })
      // 如果有新作品，显示汇总通知
      if (result.newWorks > 0) {
        console.log(`检测完成，发现 ${result.newWorks} 位作者有新作品`)
      }
    } catch (error) {
      console.error('初始化新作品检测失败:', error)
    }
  }, 5000)
})
</script>

<style scoped></style>
