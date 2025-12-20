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
      <n-form-item path="enableAuthorUpdateCheck" label="特别关注更新通知">
        <n-switch v-model:value="formData.enableAuthorUpdateCheck" />
      </n-form-item>
      <n-form-item path="defaultViewMode" label="默认展示标签页">
        <n-select
          v-model:value="formData.defaultViewMode"
          :options="[
            { label: '本地目录', value: 'folders' },
            { label: '我的收藏', value: 'favorites' },
            { label: '浏览历史', value: 'history' },
            { label: '最近下载', value: 'downloads' }
          ]"
          placeholder="请选择默认展示的标签页"
        />
      </n-form-item>
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
      <n-form-item path="defaultDownloadPath" label="默认下载路径">
        <n-input-group>
          <n-input
            v-model:value="formData.defaultDownloadPath"
            placeholder="请选择默认下载文件夹路径"
            readonly
          />
          <n-button type="primary" @click="selectResourcePath('defaultDownloadPath')">
            选择文件夹
          </n-button>
        </n-input-group>
      </n-form-item>
      <div class="more-toggle">
        <n-button text type="primary" @click="showMore = !showMore">
          {{ showMore ? '收起更多下载路径' : '更多下载路径设置' }}
        </n-button>
      </div>
      <div v-if="showMore">
        <n-form-item path="downloadPathJmtt" label="jmtt 下载路径">
          <n-input-group>
            <n-input
              v-model:value="formData.downloadPathJmtt"
              placeholder="可选，未设置则使用默认下载路径"
              readonly
            />
            <n-button type="primary" @click="selectResourcePath('downloadPathJmtt')">
              选择文件夹
            </n-button>
          </n-input-group>
        </n-form-item>

        <n-form-item path="downloadPathPixiv" label="pixiv 下载路径">
          <n-input-group>
            <n-input
              v-model:value="formData.downloadPathPixiv"
              placeholder="可选，未设置则使用默认下载路径"
              readonly
            />
            <n-button type="primary" @click="selectResourcePath('downloadPathPixiv')">
              选择文件夹
            </n-button>
          </n-input-group>
        </n-form-item>

        <n-form-item path="downloadPathTwitter" label="twitter 下载路径">
          <n-input-group>
            <n-input
              v-model:value="formData.downloadPathTwitter"
              placeholder="可选，未设置则使用默认下载路径"
              readonly
            />
            <n-button type="primary" @click="selectResourcePath('downloadPathTwitter')">
              选择文件夹
            </n-button>
          </n-input-group>
        </n-form-item>
      </div>
      <!-- <n-form-item label="应用更新">
        <n-button type="primary" @click="checkUpdate">立即检查更新</n-button>
      </n-form-item> -->
    </n-form>
  </div>
</template>

<script setup lang="ts">
import { useSettingStore } from '@renderer/plugins/store'
import { setting } from '@/typings/setting'

// 立即检查更新
const checkUpdate = async () => {
  try {
    await window.electron.ipcRenderer.invoke('update:check')
    // 具体提示由主进程 MessageBox 处理，这里可选地给出轻提示
    message.info('正在检查更新…')
  } catch (e: any) {
    message.error(e?.message || '检查更新失败')
  }
}

let settingStore = useSettingStore()
const message = useMessage()

const formData = ref<setting>(settingStore.setting)
const showMore = ref(false)

// 选择资源路径
const selectResourcePath = async (key: keyof setting) => {
  try {
    // 调用 Electron 的文件选择器
    const result = await window.electron.ipcRenderer.invoke('dialog:openDirectory')
    if (result && !result.canceled && result.filePaths.length > 0) {
      formData.value[key] = result.filePaths[0]
    }
  } catch (error) {
    message.error('选择文件夹失败')
  }
}

// 组件挂载时，更新设置状态
onMounted(async () => {
  await settingStore.updateSetting()
  formData.value = settingStore.setting
  watch(
    () => formData.value,
    (newValue: setting, oldValue: setting) => {
      settingStore.setSetting(newValue)
      message.success('设置成功')
    },
    { deep: true, immediate: false }
  )
})
</script>

<style lang="scss" scoped>
.setting {
  padding: 20px;
  width: 100%;
  height: 100%;
}
</style>
