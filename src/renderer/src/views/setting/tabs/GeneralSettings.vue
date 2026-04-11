<template>
  <n-form :model="modelValue">
    <!-- <n-form-item path="theme" label="主题">
      <n-radio-group v-model:value="modelValue.theme">
        <n-space>
          <n-radio value="auto">自动</n-radio>
          <n-radio value="light">浅色</n-radio>
          <n-radio value="dark">深色</n-radio>
        </n-space>
      </n-radio-group>
    </n-form-item> -->

    <n-form-item path="defaultViewMode" label="默认展示标签页">
      <n-select
        :value="modelValue.defaultViewMode"
        @update:value="(value) => updateSetting('defaultViewMode', value)"
        :options="[
          { label: '本地目录', value: 'folders' },
          { label: '我的收藏', value: 'favorites' },
          { label: '浏览历史', value: 'history' },
          { label: '最近下载', value: 'downloads' }
        ]"
        placeholder="请选择默认展示的标签页"
      />
    </n-form-item>

    <n-form-item path="enableAuthorUpdateCheck" label="特别关注更新通知">
      <n-switch
        :value="modelValue.enableAuthorUpdateCheck"
        @update:value="(value) => updateSetting('enableAuthorUpdateCheck', value)"
      />
    </n-form-item>

    <n-form-item path="enableClipboardMonitor" label="剪切板监听">
      <n-switch
        :value="modelValue.enableClipboardMonitor"
        @update:value="(value) => updateSetting('enableClipboardMonitor', value)"
      />
    </n-form-item>

    <n-form-item label="关闭时最小化到托盘">
      <n-switch
        :value="closeConfigData.closeToTray"
        @update:value="(value) => updateCloseConfig('closeToTray', value)"
      />
    </n-form-item>

    <n-form-item label="关闭时不再提醒">
      <n-switch
        :value="closeConfigData.dontRemind"
        @update:value="(value) => updateCloseConfig('dontRemind', value)"
      />
    </n-form-item>

    <!-- <n-form-item label="恢复默认关闭提示">
      <n-button size="small" @click="resetCloseConfig">恢复默认</n-button>
    </n-form-item> -->
  </n-form>
</template>

<script setup lang="ts">
import { defineProps, defineEmits, ref, onMounted } from 'vue'
import { setting } from '../../../../../typings/setting'

const props = defineProps<{
  modelValue: setting
}>()

const emit = defineEmits(['update:modelValue'])

const updateSetting = (key: keyof setting, value: any) => {
  const newSetting = { ...props.modelValue }
  newSetting[key] = value
  emit('update:modelValue', newSetting)
}

// 关闭行为配置
const closeConfigData = ref<{ closeToTray: boolean; dontRemind: boolean }>({
  closeToTray: true,
  dontRemind: false
})

const loadCloseConfig = async () => {
  try {
    const config = await window.closeConfig.get()
    closeConfigData.value = config
  } catch (e) {
    console.error('获取关闭配置失败:', e)
  }
}

const updateCloseConfig = async (key: 'closeToTray' | 'dontRemind', value: boolean) => {
  closeConfigData.value[key] = value
  try {
    await window.closeConfig.set({ ...closeConfigData.value })
  } catch (e) {
    console.error('保存关闭配置失败:', e)
  }
}

const resetCloseConfig = async () => {
  try {
    await window.closeConfig.reset()
    closeConfigData.value = { closeToTray: true, dontRemind: false }
  } catch (e) {
    console.error('重置关闭配置失败:', e)
  }
}

onMounted(() => {
  loadCloseConfig()
})
</script>
