<template>
  <n-form :model="modelValue">
    <n-form-item path="resourcePath" label="漫画书资源路径">
      <n-input-group>
        <n-input
          :value="modelValue.resourcePath"
          @update:value="(value) => updateSetting('resourcePath', value)"
          placeholder="请选择资源文件夹路径"
          readonly
        />
        <n-button type="primary" @click="selectResourcePath('resourcePath')"> 选择文件夹 </n-button>
      </n-input-group>
    </n-form-item>

    <n-form-item path="videoResourcePath" label="电影资源路径">
      <n-input-group>
        <n-input
          :value="modelValue.videoResourcePath"
          @update:value="(value) => updateSetting('videoResourcePath', value)"
          placeholder="请选择资源文件夹路径"
          readonly
        />
        <n-button type="primary" @click="selectResourcePath('videoResourcePath')">
          选择文件夹
        </n-button>
      </n-input-group>
    </n-form-item>
  </n-form>
</template>

<script setup lang="ts">
import { defineProps, defineEmits } from 'vue'
import { useMessage } from 'naive-ui'
import { setting } from '../../../../../typings/setting'

const props = defineProps<{
  modelValue: setting
}>()

const emit = defineEmits(['update:modelValue'])

const message = useMessage()

const updateSetting = (key: keyof setting, value: any) => {
  const newSetting = { ...props.modelValue }
  newSetting[key] = value
  emit('update:modelValue', newSetting)
}

// 选择资源路径
const selectResourcePath = async (key: keyof setting) => {
  try {
    // 调用 Electron 的文件选择器
    const result = await window.electron.ipcRenderer.invoke('dialog:openDirectory')
    if (result && !result.canceled && result.filePaths.length > 0) {
      updateSetting(key, result.filePaths[0])
    }
  } catch (error) {
    message.error('选择文件夹失败')
  }
}
</script>

<script lang="ts">
export default {
  name: 'ResourceSettings'
}
</script>
