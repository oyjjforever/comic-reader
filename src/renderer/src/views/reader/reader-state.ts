import { computed } from 'vue'
import pinia, { useSettingStore } from '@renderer/plugins/store'

const settingStore = useSettingStore(pinia)

// 阅读器进度条显示开关：由设置页「通用设置」控制，持久化保存
export const showProgressBar = computed(() => settingStore.setting.showReaderProgress ?? true)

// 漫画双页模式（一屏两页）：由设置页「通用设置」控制，持久化保存
export const doublePageMode = computed(() => settingStore.setting.doublePageMode ?? false)

// 切换并持久化到设置（阅读器内的开关按钮与设置页共用同一份数据）
export function setShowReaderProgress(value: boolean) {
  settingStore.setSetting({ ...settingStore.setting, showReaderProgress: value })
}

export function setDoublePageMode(value: boolean) {
  settingStore.setSetting({ ...settingStore.setting, doublePageMode: value })
}
