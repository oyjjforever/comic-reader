<template>
  <div class="setting">
    <n-form :model="formData">
      <!-- <n-form-item path="theme" label="主题">
                <n-radio-group v-model:value="formData.theme">
                    <n-space>
                        <n-radio value="auto">
                            自动
                        </n-radio>
                        <n-radio value="light">
                            浅色
                        </n-radio>
                        <n-radio value="dark">
                            深色
                        </n-radio>
                    </n-space>
                </n-radio-group>
            </n-form-item> -->

      <n-form-item path="resourcePath" label="漫画书资源路径">
        <n-input-group>
          <n-input
            v-model:value="formData.resourcePath"
            placeholder="请选择资源文件夹路径"
            readonly
          />
          <n-button type="primary" @click="selectResourcePath('resourcePath')">
            选择文件夹
          </n-button>
        </n-input-group>
      </n-form-item>
      <n-form-item path="videoResourcePath" label="电影资源路径">
        <n-input-group>
          <n-input
            v-model:value="formData.videoResourcePath"
            placeholder="请选择资源文件夹路径"
            readonly
          />
          <n-button type="primary" @click="selectResourcePath('videoResourcePath')">
            选择文件夹
          </n-button>
        </n-input-group>
      </n-form-item>
    </n-form>
  </div>
</template>

<script setup lang="ts">
import { useSettingStore } from '@renderer/plugins/store'
import { setting } from '@/typings/setting'

let settingStore = useSettingStore()
const message = useMessage()

const formData = ref<setting>(settingStore.setting)

// 选择资源路径
const selectResourcePath = async (key: string) => {
  try {
    // 调用 Electron 的文件选择器
    const result = await window.electron.ipcRenderer.invoke('dialog:openDirectory')
    if (result && !result.canceled && result.filePaths.length > 0) {
      formData.value[key] = result.filePaths[0]
      settingStore.setSetting(formData.value)
      message.success('设置成功')
    }
  } catch (error) {
    message.error('选择文件夹失败')
  }
}

// 组件挂载时，更新设置状态
onMounted(async () => {
  await settingStore.updateSetting()
  formData.value = settingStore.setting
})
</script>

<style lang="scss" scoped>
.setting {
  padding: 20px;
}
</style>
