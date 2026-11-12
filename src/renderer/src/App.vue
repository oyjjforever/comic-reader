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
  },
  // n-dropdown 面板固定暗色（与暗色主题下 n-select 下拉同源：
  // 面板=dark popoverColor，文字/hover/分隔线=overlay(白,α)，激活=主色 15%）
  Dropdown: {
    color: 'rgb(72, 72, 78)',
    optionTextColor: 'rgba(255, 255, 255, 0.82)',
    optionTextColorHover: 'rgba(255, 255, 255, 0.82)',
    optionTextColorActive: themeColors.primary,
    optionTextColorChildActive: themeColors.primary,
    optionColorHover: 'rgba(255, 255, 255, 0.09)',
    optionColorActive: 'rgba(50, 47, 59, 0.15)',
    dividerColor: 'rgba(255, 255, 255, 0.09)',
    suffixColor: 'rgba(255, 255, 255, 0.82)',
    prefixColor: 'rgba(255, 255, 255, 0.82)',
    groupHeaderTextColor: 'rgba(255, 255, 255, 0.52)',
    peers: {
      Popover: {
        color: 'rgb(72, 72, 78)',
        boxShadow: '0 3px 6px -4px rgba(0, 0, 0, .24), 0 6px 12px 0 rgba(0, 0, 0, .16), 0 9px 18px 8px rgba(0, 0, 0, .10)'
      }
    }
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
