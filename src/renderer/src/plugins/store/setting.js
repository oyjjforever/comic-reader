import { defineStore } from 'pinia'

// 默认设置
export const defaultSetting = {
  theme: 'auto',
  bookSort: 'id DESC',
  resourcePath: '',
  videoResourcePath: '',
  defaultDownloadPath: '',
  enableAuthorUpdateCheck: false,
  defaultViewMode: 'favorites'
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
