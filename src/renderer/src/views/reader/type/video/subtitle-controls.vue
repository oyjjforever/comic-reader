<template>
  <div
    class="subtitle-controls"
    :class="{ 'controls-hidden': !showControls }"
    @mouseenter="onControlsEnter"
    @mouseleave="onControlsLeave"
  >
    <n-space align="center">
      <!-- 字幕开关 -->
      <n-button
        :type="subtitleEnabled ? 'success' : 'default'"
        size="small"
        @click="toggleSubtitle"
      >
        <template #icon>
          <n-icon :component="SubtitleIcon" />
        </template>
        {{ subtitleEnabled ? '字幕开' : '字幕关' }}
      </n-button>

      <!-- 生成字幕按钮 -->
      <n-button
        v-if="!isGenerating && !hasCache"
        type="info"
        size="small"
        :loading="isGenerating"
        @click="generateSubtitle"
      >
        生成字幕
      </n-button>

      <!-- 生成中进度 -->
      <div v-if="isGenerating" class="generating-info">
        <n-progress
          type="line"
          :percentage="generatePercent"
          :show-indicator="false"
          status="info"
          style="width: 80px"
          :height="4"
        />
        <span class="progress-text">{{ generatePercent }}%</span>
      </div>

      <!-- 设置按钮 -->
      <n-popover trigger="click" placement="top">
        <template #trigger>
          <n-button size="small" quaternary>
            <template #icon>
              <n-icon :component="SettingsIcon" />
            </template>
          </n-button>
        </template>

        <div class="subtitle-settings">
          <div class="setting-item">
            <label>语言</label>
            <n-select
              v-model:value="selectedLanguage"
              :options="languageOptions"
              size="small"
              style="width: 120px"
            />
          </div>

          <div class="setting-item">
            <label>字体大小</label>
            <n-slider v-model:value="fontSize" :min="14" :max="48" :step="2" style="width: 120px" />
          </div>

          <div class="setting-item">
            <label>位置</label>
            <n-radio-group v-model:value="subtitlePosition" size="small">
              <n-radio-button value="bottom">底部</n-radio-button>
              <n-radio-button value="top">顶部</n-radio-button>
            </n-radio-group>
          </div>

          <div class="setting-item">
            <label>透明度</label>
            <n-slider
              v-model:value="opacity"
              :min="0.3"
              :max="1"
              :step="0.1"
              style="width: 120px"
            />
          </div>
        </div>
      </n-popover>
    </n-space>
  </div>
</template>

<script setup lang="ts">
import { Text as SubtitleIcon, Settings as SettingsIcon } from '@vicons/ionicons5'
import type { SubtitleLanguage, SubtitlePosition } from '@/typings/subtitle'

const props = defineProps<{
  showControls: boolean
  videoPath: string
  isGenerating: boolean
  generatePercent: number
  hasCache: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle', enabled: boolean): void
  (e: 'generate'): void
  (
    e: 'updateSettings',
    settings: {
      language: SubtitleLanguage
      fontSize: number
      position: SubtitlePosition
      opacity: number
    }
  ): void
}>()

const subtitleEnabled = ref(false)
const selectedLanguage = ref<SubtitleLanguage>('ja')
const fontSize = ref(24)
const subtitlePosition = ref<SubtitlePosition>('bottom')
const opacity = ref(0.8)

const languageOptions = [
  { label: '自动检测', value: 'auto' },
  { label: '日本語', value: 'ja' },
  { label: '中文', value: 'zh' },
  { label: 'English', value: 'en' },
  { label: '한국어', value: 'ko' }
]

// 鼠标进入/离开控制栏
const onControlsEnter = () =>
  emit('updateSettings', {
    language: selectedLanguage.value,
    fontSize: fontSize.value,
    position: subtitlePosition.value,
    opacity: opacity.value
  })
const onControlsLeave = () => {}

// 切换字幕
const toggleSubtitle = () => {
  subtitleEnabled.value = !subtitleEnabled.value
  emit('toggle', subtitleEnabled.value)
}

// 生成字幕
const generateSubtitle = () => {
  emit('generate')
}

// 监听设置变化
watch([selectedLanguage, fontSize, subtitlePosition, opacity], () => {
  emit('updateSettings', {
    language: selectedLanguage.value,
    fontSize: fontSize.value,
    position: subtitlePosition.value,
    opacity: opacity.value
  })
})

// 暴露方法给父组件
defineExpose({
  setEnabled: (enabled: boolean) => {
    subtitleEnabled.value = enabled
  },
  setLanguage: (lang: SubtitleLanguage) => {
    selectedLanguage.value = lang
  }
})
</script>

<style lang="scss" scoped>
.subtitle-controls {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 110;
  backdrop-filter: blur(10px);
  background: rgba(0, 0, 0, 0.5);
  padding: 8px 12px;
  border-radius: 6px;
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;

  &.controls-hidden {
    opacity: 0;
    transform: translateY(-100%);
    pointer-events: none;
  }

  .generating-info {
    display: flex;
    align-items: center;
    gap: 8px;

    .progress-text {
      color: rgba(255, 255, 255, 0.8);
      font-size: 12px;
      min-width: 36px;
    }
  }
}

.subtitle-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px;

  .setting-item {
    display: flex;
    align-items: center;
    gap: 12px;

    label {
      min-width: 50px;
      font-size: 13px;
      color: #666;
    }
  }
}
</style>
