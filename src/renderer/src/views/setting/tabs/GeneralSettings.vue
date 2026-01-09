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
