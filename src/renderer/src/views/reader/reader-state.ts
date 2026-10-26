import { computed } from 'vue'
import pinia, { useSettingStore } from '@renderer/plugins/store'

const settingStore = useSettingStore(pinia)

// 阅读器进度条显示开关：由设置页「阅读设置」控制，持久化保存
export const showProgressBar = computed(() => settingStore.setting.showReaderProgress ?? true)

// 漫画双页模式（一屏两页）：由设置页「阅读设置」控制，持久化保存
export const doublePageMode = computed(() => settingStore.setting.doublePageMode ?? false)

// 控制栏显示方式：'hover' 鼠标移动到边缘显示（自动隐藏），'click' 点击作品区域切换显示（手动隐藏）
export const controlsDisplayMode = computed(() => settingStore.setting.controlsDisplayMode ?? 'hover')

// 自动播放间隔（毫秒）：设置页存储秒，转换为阅读器使用的毫秒
export const autoPlayInterval = computed(() => {
  const seconds = Number(settingStore.setting.autoPlayInterval)
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 3) * 1000
})

// 切换并持久化到设置（阅读器内的开关按钮与设置页共用同一份数据）
export function setShowReaderProgress(value: boolean) {
  settingStore.setSetting({ ...settingStore.setting, showReaderProgress: value })
}

export function setDoublePageMode(value: boolean) {
  settingStore.setSetting({ ...settingStore.setting, doublePageMode: value })
}
