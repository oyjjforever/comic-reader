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
          { label: '精彩片段', value: 'highlights' },
          { label: '浏览历史', value: 'history' },
          { label: '最近下载', value: 'downloads' }
        ]"
        placeholder="请选择默认展示的标签页"
      />
    </n-form-item>

    <n-form-item path="historyMaxCount" label="浏览历史最大条数">
      <n-input-number
        :value="modelValue.historyMaxCount || 100"
        @update:value="(value) => updateSetting('historyMaxCount', value)"
        :min="10"
        :max="1000"
        :step="10"
        style="width: 200px"
      >
        <template #suffix>条</template>
      </n-input-number>
    </n-form-item>

    <n-form-item path="downloadMaxCount" label="最近下载最大条数">
      <n-input-number
        :value="modelValue.downloadMaxCount || 100"
        @update:value="(value) => updateSetting('downloadMaxCount', value)"
        :min="10"
        :max="1000"
        :step="10"
        style="width: 200px"
      >
        <template #suffix>条</template>
      </n-input-number>
    </n-form-item>

    <n-form-item path="enableUpdateCheck" label="启动时检测应用更新">
      <n-switch
        :value="modelValue.enableUpdateCheck ?? true"
        @update:value="(value) => updateSetting('enableUpdateCheck', value)"
      />
    </n-form-item>

    <n-form-item path="enableAuthorUpdateCheck" label="特别关注更新通知">
      <n-switch
        :value="modelValue.enableAuthorUpdateCheck"
        @update:value="(value) => updateSetting('enableAuthorUpdateCheck', value)"
      />
    </n-form-item>

    <n-form-item path="closeToTray" label="关闭时最小化到托盘">
      <n-switch
        :value="modelValue.closeToTray"
        @update:value="(value) => updateSetting('closeToTray', value)"
      />
    </n-form-item>

    <n-form-item path="dontRemind" label="关闭时不再提醒">
      <n-switch
        :value="modelValue.dontRemind"
        @update:value="(value) => updateSetting('dontRemind', value)"
      />
    </n-form-item>

    <!-- <n-form-item label="恢复默认关闭提示">
      <n-button size="small" @click="resetCloseConfig">恢复默认</n-button>
    </n-form-item> -->
  </n-form>
</template>

<script setup lang="ts">
import { defineProps, defineEmits, watch } from 'vue'
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

// 历史记录最大条数变化时，立即按新上限清理旧记录
watch(
  () => props.modelValue.historyMaxCount,
  (newVal, oldVal) => {
    if (newVal !== oldVal && newVal) {
      window.browseHistory.cleanupOldHistory(newVal)
    }
  }
)

watch(
  () => props.modelValue.downloadMaxCount,
  (newVal, oldVal) => {
    if (newVal !== oldVal && newVal) {
      window.downloadHistory.cleanupOldDownloadHistory(newVal)
    }
  }
)
</script>
