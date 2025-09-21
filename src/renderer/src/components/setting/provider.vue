<template>
  <n-modal
    v-model:show="show"
    title="设置"
    preset="dialog"
    size="huge"
    :bordered="false"
    style="width: 60%"
    positive-text="确认"
    @positive-click="submitCallback"
  >
    <n-form :model="settingForm">
      <!-- <n-form-item path="theme" label="主题">
                <n-radio-group v-model:value="settingForm.theme">
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

      <n-form-item path="resourcePath" label="资源路径">
        <n-input-group>
          <n-input
            v-model:value="settingForm.resourcePath"
            placeholder="请选择资源文件夹路径"
            readonly
          />
          <n-button type="primary" @click="selectResourcePath"> 选择文件夹 </n-button>
        </n-input-group>
      </n-form-item>
    </n-form>
    <template #footer> 不错 </template>
  </n-modal>

  <slot />
</template>

<script setup lang="ts">
import { useSettingStore } from '@renderer/plugins/store'
import { setting } from '@/typings/setting'

let settingStore = useSettingStore()
const message = useMessage()

const show = ref(false)
let callback = ref<Function>()
const settingForm = ref<setting>(settingStore.setting)

// 打开设置框
const open = (cb: Function) => {
  show.value = true
  callback.value = cb
}

// 关闭设置框
const close = () => {
  show.value = false
}
// 选择资源路径
const selectResourcePath = async () => {
  try {
    // 调用 Electron 的文件选择器
    const result = await window.electron.ipcRenderer.invoke('dialog:openDirectory')
    if (result && !result.canceled && result.filePaths.length > 0) {
      settingForm.value.resourcePath = result.filePaths[0]
    }
  } catch (error) {
    message.error('选择文件夹失败')
  }
}

// 向子组件提供方法
provide('useSetting', {
  open,
  close
})
function submitCallback() {
  settingStore.setSetting(settingForm.value)
  message.success('设置成功')
  callback.value?.()
}
// 组件挂载时，更新设置状态
onMounted(async () => {
  await settingStore.updateSetting()
  settingForm.value = settingStore.setting
})
</script>

<style scoped></style>
