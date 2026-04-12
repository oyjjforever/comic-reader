<template>
  <n-form :model="modelValue">
    <n-form-item path="enableClipboardMonitor" label="剪切板监听">
      <n-switch
        :value="modelValue.enableClipboardMonitor"
        @update:value="(value) => updateSetting('enableClipboardMonitor', value)"
      />
    </n-form-item>

    <n-form-item
      v-if="modelValue.enableClipboardMonitor"
      path="clipboardPopupPosition"
      label="搜索窗位置"
    >
      <n-select
        :value="modelValue.clipboardPopupPosition"
        @update:value="(value) => updateSetting('clipboardPopupPosition', value)"
        :options="[
          { label: '跟随鼠标位置', value: 'cursor' },
          { label: '固定在右下角', value: 'bottom-right' }
        ]"
        placeholder="请选择搜索窗位置"
      />
    </n-form-item>

    <n-form-item
      v-if="modelValue.enableClipboardMonitor"
      path="autoFillClipboard"
      label="搜索框自动填入剪切板内容"
    >
      <n-switch
        :value="modelValue.autoFillClipboard"
        @update:value="(value) => updateSetting('autoFillClipboard', value)"
      />
    </n-form-item>
  </n-form>
</template>

<script setup lang="ts">
import { defineProps, defineEmits } from 'vue'
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
</script>
