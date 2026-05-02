import { createDiscreteApi } from 'naive-ui'
import { useSettingStore, pinia } from '@renderer/plugins/store'
export async function getDefaultDownloadPath(key) {
  const settingStore = useSettingStore(pinia)
  let savePath = settingStore.setting?.[key] || settingStore.setting?.defaultDownloadPath
  if (!savePath) {
    const result = await window.electron.ipcRenderer.invoke('dialog:openDirectory')
    if (result && !result.canceled && result.filePaths.length > 0) {
      savePath = result.filePaths[0]
    }
  }
  if (!savePath) {
    message.error('未选择下载路径')
    return Promise.reject()
  }
  return savePath
}

const { message } = createDiscreteApi(['message'])

/**
 * 从 URL 路径中提取指定 key 后面的路径段
 * @param {string} currentUrl - 完整 URL
 * @param {string} key - 要查找的路径段
 * @returns {string|null} key 后面的路径段值
 */
export function extractFromUrl(currentUrl, key) {
  try {
    const parts = currentUrl.split('/').filter(Boolean)
    const idx = parts.findIndex((p) => p === key)
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1]
    return null
  } catch {
    return null
  }
}

export class Tip {
  constructor() {
    this.instance = null
  }
  info(content) {
    if (!this.instance) {
      this.instance = message.create(content, {
        type: 'loading',
        duration: 0
      })
    }
    this.instance.content = content
  }
  success(content) {
    if (!this.instance) {
      this.instance = message.create(content, {
        type: 'loading',
        duration: 0
      })
    }
    this.instance.content = content
    this.instance.type = 'success'
    setTimeout(() => {
      this.instance.destroy()
    }, 1000)
  }
  error(err) {
    const content = `下载失败：${err}`
    if (!this.instance) {
      this.instance = message.create(content, {
        type: 'loading',
        duration: 0
      })
    }
    this.instance.content = content
    this.instance.type = 'error'
    this.instance.closable = true
  }
}
