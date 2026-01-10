<template>
  <n-config-provider :theme="theme" :theme-overrides="themeOverrides">
    <n-loading-bar-provider>
      <n-dialog-provider>
        <n-message-provider>
          <setting-provider>
            <router-view />
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
</script>

<style scoped></style>
