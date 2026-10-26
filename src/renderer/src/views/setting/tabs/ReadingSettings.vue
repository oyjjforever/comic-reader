<template>
  <n-form :model="modelValue">
    <n-form-item path="doublePageMode" label="漫画双页模式（一屏两页）">
      <n-switch
        :value="modelValue.doublePageMode"
        @update:value="(value) => updateSetting('doublePageMode', value)"
      />
    </n-form-item>

    <n-form-item path="showReaderProgress" label="显示阅读器进度条">
      <n-switch
        :value="modelValue.showReaderProgress"
        @update:value="(value) => updateSetting('showReaderProgress', value)"
      />
    </n-form-item>

    <n-form-item path="controlsDisplayMode" label="控制栏显示">
      <n-radio-group
        :value="modelValue.controlsDisplayMode ?? 'hover'"
        @update:value="
          (value) => updateSetting('controlsDisplayMode', value as setting['controlsDisplayMode'])
        "
      >
        <n-radio value="hover">鼠标移动显示</n-radio>
        <n-radio value="click">点击作品区域显示</n-radio>
      </n-radio-group>
    </n-form-item>

    <n-form-item path="autoPlayInterval" label="自动播放间隔">
      <n-input-number
        :value="modelValue.autoPlayInterval ?? 3"
        @update:value="(value) => updateSetting('autoPlayInterval', value || 3)"
        :min="1"
        :max="60"
        :step="1"
        style="width: 200px"
      >
        <template #suffix>秒</template>
      </n-input-number>
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

const updateSetting = <K extends keyof setting>(key: K, value: setting[K]) => {
  const newSetting = { ...props.modelValue }
  newSetting[key] = value
  emit('update:modelValue', newSetting)
}
</script>
