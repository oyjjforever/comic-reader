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
export class Tip {
  constructor() {
    this.instance = null
  }
  info(data) {
    if (!this.instance) {
      this.instance = message.create(data, {
        type: 'loading',
        duration: 0
      })
    }
    this.instance.content = data
  }
  progress(data) {
    let content = `正在下载：${data.title}\n`
    if (data.chapter.total) content += `[第${data.chapter.index}/${data.chapter.total}章]`
    if (data.image.total) content += `[第${data.image.index}/${data.image.total}张]`
    this.instance.content = content
  }
  success() {
    this.instance.content = `下载完成`
    this.instance.type = 'success'
    setTimeout(() => {
      this.instance.destroy()
    }, 1000)
  }
  error(err) {
    this.instance.content = `下载失败：${err}`
    this.instance.type = 'error'
  }
}
