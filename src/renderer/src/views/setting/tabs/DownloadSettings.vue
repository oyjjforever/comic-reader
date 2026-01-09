<template>
  <n-form :model="modelValue">
    <n-form-item path="defaultDownloadPath" label="默认下载路径">
      <n-input-group>
        <n-input
          :value="modelValue.defaultDownloadPath"
          @update:value="(value) => updateSetting('defaultDownloadPath', value)"
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
            :value="modelValue.downloadPathJmtt"
            @update:value="(value) => updateSetting('downloadPathJmtt', value)"
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
            :value="modelValue.downloadPathPixiv"
            @update:value="(value) => updateSetting('downloadPathPixiv', value)"
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
            :value="modelValue.downloadPathTwitter"
            @update:value="(value) => updateSetting('downloadPathTwitter', value)"
            placeholder="可选，未设置则使用默认下载路径"
            readonly
          />
          <n-button type="primary" @click="selectResourcePath('downloadPathTwitter')">
            选择文件夹
          </n-button>
        </n-input-group>
      </n-form-item>
      <n-form-item path="downloadPathWeibo" label="微博 下载路径">
        <n-input-group>
          <n-input
            :value="modelValue.downloadPathWeibo"
            @update:value="(value) => updateSetting('downloadPathWeibo', value)"
            placeholder="可选，未设置则使用默认下载路径"
            readonly
          />
          <n-button type="primary" @click="selectResourcePath('downloadPathWeibo')">
            选择文件夹
          </n-button>
        </n-input-group>
      </n-form-item>
    </div>
  </n-form>
</template>

<script setup lang="ts">
import { ref, defineProps, defineEmits } from 'vue'
import { useMessage } from 'naive-ui'
import { setting } from '../../../../../typings/setting'

const props = defineProps<{
  modelValue: setting
}>()

const emit = defineEmits(['update:modelValue'])

const message = useMessage()
const showMore = ref(false)

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

<style lang="scss" scoped>
.more-toggle {
  margin: 10px 0;
}
</style>
