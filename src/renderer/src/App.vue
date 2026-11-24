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
import { useTheme, applyThemeAttribute } from '@renderer/composables/use-theme'
const settingStore = useSettingStore()
const newArtworkDetector = useNewArtworkDetectorStore()
const osTheme = useOsTheme()
const { uiTheme, isLight } = useTheme()

// 界面主题写到 <html data-theme>：全局令牌（styles/theme.css）据此翻转。
// 设置在路由守卫里先于首个视图加载，视图首帧即为主题色。
// （侧栏切换按钮走 toggleTheme 的圆形扩散过渡，过渡回调里会先同步写一次同一个值）
watch(
  uiTheme,
  (value) => {
    applyThemeAttribute(value)
  },
  { immediate: true }
)

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
  // n-dropdown 面板随界面主题取值（naive 根主题本身不随 uiTheme 变，见下方 theme）。
  // 深色：面板固定暗色（与暗色主题下 n-select 下拉同源：
  // 面板=dark popoverColor，文字/hover/分隔线=overlay(白,α)，激活=主色 15%）；
  // 浅色：白底 + 深紫灰文字，hover 橙色胶囊，与白玻璃弹窗/右键菜单同语言
  Dropdown: isLight.value
    ? {
        color: '#ffffff',
        optionTextColor: '#3d3949',
        optionTextColorHover: '#3d3949',
        optionTextColorActive: '#a85a00',
        optionTextColorChildActive: '#a85a00',
        optionColorHover: 'rgba(255, 146, 5, 0.14)',
        optionColorActive: 'rgba(255, 146, 5, 0.1)',
        dividerColor: 'rgba(74, 70, 86, 0.12)',
        suffixColor: '#7d7789',
        prefixColor: '#7d7789',
        groupHeaderTextColor: 'rgba(61, 57, 73, 0.6)',
        peers: {
          Popover: {
            color: '#ffffff',
            boxShadow:
              '0 3px 6px -4px rgba(31, 28, 40, .24), 0 6px 12px 0 rgba(31, 28, 40, .16), 0 9px 18px 8px rgba(31, 28, 40, .10)'
          }
        }
      }
    : {
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
            boxShadow:
              '0 3px 6px -4px rgba(0, 0, 0, .24), 0 6px 12px 0 rgba(0, 0, 0, .16), 0 9px 18px 8px rgba(0, 0, 0, .10)'
          }
        }
      }
}))

// naive-ui 根主题：只跟旧 theme 字段，**不跟 uiTheme（界面主题）**——阅读器里的
// n-slider / n-rate 等吃根主题，随界面主题换色会让黑底阅读器里的滑块变色；
// 页面的暗肤靠容器内 CSS 变量覆写与设置页 / 搜索页的内层 provider
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
