import { useMessage } from 'naive-ui'
const message = useMessage()
export async function getDefaultDownloadPath(key) {
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

export class Tip {
  constructor() {
    this.instance = {}
  }
  create(total) {
    this.instance = message.create(`共${total}篇作品，开始下载...`, {
      type: 'loading',
      duration: 0
    })
  }
  update(data) {
    this.instance.content = `正在下载:${data.title}\n[第 ${data.chapter.index} / ${data.chapter.total} 章] ${data.image.index} / ${data.image.total} 张`
  }
  success() {
    this.instance.content = `下载完成`
    this.instance.type = 'success'
    setTimeout(() => {
      this.instance.destroy()
    }, 1000)
  }
}
