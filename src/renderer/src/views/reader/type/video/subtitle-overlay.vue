<template>
  <div
    class="subtitle-overlay"
    :class="[`position-${position}`, { 'subtitle-hidden': !visible }]"
    :style="{
      '--font-size': `${fontSize}px`,
      '--opacity': opacity
    }"
  >
    <!-- 预生成字幕（带时间轴） -->
    <div v-if="currentSegment" class="subtitle-text" :key="currentSegment.id">
      <!-- 有翻译时只显示翻译文本，不显示原文 -->
      <template v-if="translatedText">
        {{ translatedText }}
      </template>
      <!-- 没有翻译时显示原文 -->
      <template v-else>
        {{ currentSegment.text }}
      </template>
    </div>

    <!-- 实时字幕 -->
    <div v-else-if="realtimeText" class="subtitle-text realtime">
      {{ realtimeText }}
      <div v-if="translatedRealtimeText" class="subtitle-translation">
        {{ translatedRealtimeText }}
      </div>
    </div>

    <!-- 生成进度提示 -->
    <div v-if="isGenerating && !currentSegment && !realtimeText" class="subtitle-generating">
      <n-spin size="small" />
      <span>字幕生成中 {{ generatePercent }}%</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SubtitleSegment, SubtitlePosition } from '@/typings/subtitle'

const props = withDefaults(
  defineProps<{
    /** 字幕段落列表（预生成） */
    segments: SubtitleSegment[]
    /** 当前播放时间（秒） */
    currentTime: number
    /** 字幕是否可见 */
    visible: boolean
    /** 字幕位置 */
    position: SubtitlePosition
    /** 字体大小 */
    fontSize: number
    /** 透明度 */
    opacity: number
    /** 实时字幕文本 */
    realtimeText?: string
    /** 是否正在生成 */
    isGenerating?: boolean
    /** 生成进度百分比 */
    generatePercent?: number
    /** 翻译映射表：segmentId → 翻译文本 */
    translatedMap?: Record<number, string>
    /** 翻译后的实时文本 */
    translatedRealtimeText?: string
  }>(),
  {
    visible: true,
    position: 'bottom',
    fontSize: 24,
    opacity: 0.8,
    isGenerating: false,
    generatePercent: 0
  }
)

// 根据当前时间找到匹配的字幕段落
const currentSegment = computed(() => {
  if (!props.segments || props.segments.length === 0) return null

  const time = props.currentTime
  return props.segments.find((seg) => time >= seg.startTime && time <= seg.endTime) || null
})

// 根据当前段落的 id 从 translatedMap 中查找翻译文本
const translatedText = computed(() => {
  if (!props.translatedMap || !currentSegment.value) return null
  return props.translatedMap[currentSegment.value.id] || null
})
</script>

<style lang="scss" scoped>
.subtitle-overlay {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  pointer-events: none;
  max-width: 80%;
  text-align: center;
  transition: opacity 0.3s ease;

  &.position-bottom {
    bottom: 60px;
  }

  &.position-top {
    top: 60px;
  }

  &.subtitle-hidden {
    opacity: 0;
  }

  .subtitle-text {
    display: inline-block;
    padding: 6px 16px;
    background: rgba(0, 0, 0, var(--opacity));
    color: #fff;
    font-size: var(--font-size);
    line-height: 1.4;
    border-radius: 4px;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
    word-break: break-word;
    white-space: pre-wrap;

    &.realtime {
      border-left: 3px solid #4caf50;
    }

    .subtitle-translation {
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px solid rgba(255, 255, 255, 0.3);
      font-size: calc(var(--font-size) * 0.85);
      color: rgba(255, 255, 255, 0.9);
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.6);
    }
  }

  .subtitle-generating {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 16px;
    background: rgba(0, 0, 0, 0.6);
    color: rgba(255, 255, 255, 0.8);
    font-size: 14px;
    border-radius: 4px;
  }
}
</style>
