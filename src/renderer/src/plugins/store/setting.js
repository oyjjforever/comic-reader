import { defineStore } from 'pinia'

// 默认设置
export const defaultSetting = {
  theme: 'light',
  bookSort: 'id DESC',
  resourcePath: '', // 旧字段，保留用于迁移
  videoResourcePath: '', // 旧字段，保留用于迁移
  resourcePaths: [], // 多个漫画书资源路径
  videoResourcePaths: [], // 多个电影资源路径
  defaultDownloadPath: '',
  enableAuthorUpdateCheck: false,
  enableClipboardMonitor: false, // 默认关闭剪切板监听
  clipboardPopupPosition: 'cursor', // 剪切板弹窗位置：'cursor' 跟随鼠标, 'bottom-right' 固定右下角
  autoFillClipboard: true, // 是否自动填入剪切板内容
  defaultViewMode: 'folders',
  enableScheduledBackup: false,
  backupInterval: 4, // 默认4周
  backupPath: '',
  enableLanService: false, // 默认关闭局域网中转服务
  lanServicePort: 9527 // 默认端口
}

export const useSettingStore = defineStore('setting', {
  state: () => {
    return {
      setting: defaultSetting
    }
  },
  actions: {
    // 设置设置
    async setSetting(setting) {
      // 更新设置
      this.setting = setting

      // 保存设置到sqlite
      await window.appData.set('setting', JSON.stringify(setting))
    },
    // 更新设置
    async updateSetting() {
      // 从sqlite中获取设置
      let setting = await window.appData.get('setting')

      // 如果设置存在
      if (setting) {
        let settingData = JSON.parse(setting)

        // 检查是否有不存在的字段，如果有则使用默认设置补全
        for (let key in defaultSetting) {
          if (settingData[key] == undefined) {
            settingData[key] = defaultSetting[key]
          }
        }

        // 迁移旧的单路径字段到新的数组字段
        if (
          (!settingData.resourcePaths || settingData.resourcePaths.length === 0) &&
          settingData.resourcePath
        ) {
          settingData.resourcePaths = [settingData.resourcePath]
        }
        if (
          (!settingData.videoResourcePaths || settingData.videoResourcePaths.length === 0) &&
          settingData.videoResourcePath
        ) {
          settingData.videoResourcePaths = [settingData.videoResourcePath]
        }

        // 将设置保存到store
        this.setting = settingData

        // 返回设置
        return settingData
      } else {
        // 设置不存在，返回默认设置
        return defaultSetting
      }
    }
  }
})
