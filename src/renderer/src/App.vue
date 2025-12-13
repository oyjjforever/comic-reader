<template>
  <n-config-provider :theme="theme">
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
import { ref, watch, onMounted } from 'vue'
import { useOsTheme, GlobalTheme, darkTheme } from 'naive-ui'
import Layout from '@renderer/layout/index.vue'
const settingStore = useSettingStore()
const newArtworkDetector = useNewArtworkDetectorStore()
const osTheme = useOsTheme()

// 定义主题
const theme = ref<GlobalTheme | null | undefined>(null)

// 监听主题设置
watch(
  () => settingStore.setting.theme,
  (newValue) => {
    // 如果是自动模式，根据系统主题设置
    if (newValue === 'auto') {
      if (osTheme.value == 'dark') {
        theme.value = darkTheme
      } else {
        theme.value = undefined
      }
      return
    }

    if (newValue === 'dark') {
      theme.value = darkTheme
      return
    }

    theme.value = undefined
  },
  { immediate: true }
)

// 应用启动时初始化新作品检测
onMounted(async () => {
  // 延迟5秒后开始检测，避免应用启动时网络请求过多
  setTimeout(async () => {
    try {
      // 检测新作品
      const result = await newArtworkDetector.detectNewArtworks((newArtwork) => {
        // 当发现新作品时显示通知
        console.log(`${newArtwork.authorName}(${newArtwork.source}) 有新作品发布！`)
      })

      // 如果有新作品，显示汇总通知
      if (result.newWorks > 0) {
        console.log(`检测完成，发现 ${result.newWorks} 位作者有新作品`)
      }

      // 启动定时检测，每30分钟检测一次
      newArtworkDetector.startPeriodicCheck(30 * 60 * 1000, (newArtwork) => {
        console.log(`${newArtwork.authorName}(${newArtwork.source}) 有新作品发布！`)
      })
    } catch (error) {
      console.error('初始化新作品检测失败:', error)
    }
  }, 5000)
})
</script>

<style scoped></style>
