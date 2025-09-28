<template>
  <n-config-provider :theme="theme">
    <n-loading-bar-provider>
      <n-dialog-provider>
        <n-message-provider>
          <setting-provider>
            <Layout></Layout>
            <!-- <router-view v-slot="{ Component }">
              <keep-alive include="home">
                <component :is="Component" />
              </keep-alive>
            </router-view> -->
          </setting-provider>
        </n-message-provider>
      </n-dialog-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import SettingProvider from '@renderer/components/setting/provider.vue'
import { useSettingStore } from '@renderer/plugins/store'
import { ref, watch } from 'vue'
import { useOsTheme, GlobalTheme, darkTheme } from 'naive-ui'
import Layout from '@renderer/layout/index.vue'
const settingStore = useSettingStore()
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
</script>

<style scoped></style>
