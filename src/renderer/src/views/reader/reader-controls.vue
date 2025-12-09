<template>
  <div class="reader-controls" @click="onClickShowControls" @wheel.prevent="onWheel">
    <!-- 顶部控制栏 -->
    <div
      class="top-controls"
      :class="{ 'controls-hidden': !effectiveShowControls }"
      @mouseenter="onControlsEnter"
      @mouseleave="onControlsLeave"
    >
      <!-- 返回按钮 -->
      <button class="control-button back-button" @click="$emit('back')">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
      </button>

      <!-- 页码显示 -->
      <div class="page-indicator">{{ currentPage }} / {{ totalPages }}</div>

      <!-- 功能按钮组 -->
      <div class="function-buttons">
        <!-- 全屏 -->
        <button class="control-button" @click="$emit('toggleFullscreen')" title="全屏">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
            />
          </svg>
        </button>

        <!-- 缩放重置 -->
        <button class="control-button" @click="$emit('resetZoom')" title="适应屏幕">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 5.83L15.17 9l1.41-1.41L12 3 7.41 7.59 8.83 9 12 5.83zm0 12.34L8.83 15l-1.41 1.41L12 21l4.59-4.59L15.17 15 12 18.17z"
            />
          </svg>
        </button>

        <!-- 自动播放（可选） -->
        <button
          v-if="showAutoPlay"
          class="control-button"
          @click="$emit('toggleAutoPlay')"
          :title="isAutoPlaying ? '暂停 (空格)' : '播放 (空格)'"
        >
          <svg v-if="!isAutoPlaying" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        </button>

        <!-- 缩放控制（可选） -->
        <template v-if="showZoomControls">
          <button class="control-button" @click="$emit('zoomOut')" title="缩小">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13H5v-2h14v2z" />
            </svg>
          </button>

          <span class="zoom-display">{{ Math.round(zoomPercent) }}%</span>

          <button class="control-button" @click="$emit('zoomIn')" title="放大">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </button>
        </template>

        <!-- 右侧额外内容插槽（如 PDF 选择器） -->
        <slot name="right-extra"></slot>
      </div>
    </div>

    <!-- 主体内容插槽 -->
    <slot />

    <!-- 左右切换按钮 -->
    <button
      v-if="totalPages > 1"
      class="nav-button nav-left"
      :class="{ 'controls-hidden': !effectiveShowControls, disabled: disabledPrevComputed }"
      @click="$emit('prev')"
      :disabled="disabledPrevComputed"
      @mouseenter="onControlsEnter"
      @mouseleave="onControlsLeave"
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
      </svg>
    </button>

    <button
      v-if="totalPages > 1"
      class="nav-button nav-right"
      :class="{ 'controls-hidden': !effectiveShowControls, disabled: disabledNextComputed }"
      @click="$emit('next')"
      :disabled="disabledNextComputed"
      @mouseenter="onControlsEnter"
      @mouseleave="onControlsLeave"
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
      </svg>
    </button>
    <!-- 底部进度条 -->
    <div
      v-if="totalPages > 1"
      class="bottom-progress"
      :class="{ 'controls-hidden': !effectiveShowControls }"
      @mouseenter="onControlsEnter"
      @mouseleave="onControlsLeave"
      @click.stop
    >
      <div class="progress-bar">
        <n-slider
          :min="1"
          :max="Math.max(totalPages, 1)"
          :value="Math.min(Math.max(currentPage, 1), Math.max(totalPages, 1))"
          :step="1"
          :show-tooltip="effectiveShowControls"
          :format-tooltip="(p) => `${p} / ${totalPages}`"
          @update:value="onNaiveSliderUpdate"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, ref, onUnmounted } from 'vue'

export default defineComponent({
  name: 'ReaderControls',
  props: {
    showControls: { type: Boolean, default: undefined },
    currentPage: { type: Number, required: true },
    totalPages: { type: Number, required: true },
    showAutoPlay: { type: Boolean, default: false },
    isAutoPlaying: { type: Boolean, default: false },
    showZoomControls: { type: Boolean, default: false },
    zoomPercent: { type: Number, default: 100 },
    disabledPrev: { type: Boolean, default: undefined },
    disabledNext: { type: Boolean, default: undefined }
  },
  emits: [
    'back',
    'toggleFullscreen',
    'resetZoom',
    'toggleAutoPlay',
    'zoomIn',
    'zoomOut',
    'prev',
    'next',
    'progress-input',
    'progress-mousedown',
    'progress-mousemove',
    'progress-mouseup',
    'progress-mouseleave'
  ],
  setup(props, { emit }) {
    // 内部控制显示/隐藏（当父组件未传 showControls 时启用）
    const showControlsInternal = ref(false)
    const AUTO_HIDE_DELAY = 3000
    const autoHideTimer = ref<number | null>(null)
    const isHoveringControls = ref(false)

    const effectiveShowControls = computed(() => {
      return typeof props.showControls === 'boolean'
        ? props.showControls
        : showControlsInternal.value
    })

    const resetAutoHideTimer = () => {
      if (isHoveringControls.value) return
      if (autoHideTimer.value) {
        clearTimeout(autoHideTimer.value)
      }
      autoHideTimer.value = window.setTimeout(() => {
        if (!isHoveringControls.value) {
          showControlsInternal.value = false
        }
      }, AUTO_HIDE_DELAY) as unknown as number
    }

    const showControlsTemporarily = () => {
      showControlsInternal.value = true
      resetAutoHideTimer()
    }

    const onClickShowControls = () => {
      // 仅在未传入 props.showControls 时，使用内部状态进行切换
      if (typeof props.showControls !== 'boolean') {
        if (showControlsInternal.value) {
          // 当前可见：点击后隐藏，并清除自动隐藏定时器
          showControlsInternal.value = false
          if (autoHideTimer.value) {
            clearTimeout(autoHideTimer.value)
            autoHideTimer.value = null
          }
        } else {
          // 当前隐藏：点击后显示，并启动/重置自动隐藏
          showControlsInternal.value = true
          resetAutoHideTimer()
        }
      }
    }
    const onWheel = (ev: WheelEvent) => {
      // 显示控件并根据滚轮方向翻页
      // showControlsTemporarily()
      const dy = ev.deltaY
      if (dy === 0) return
      if (dy > 0) {
        if (!disabledNextComputed.value) emit('next')
      } else {
        if (!disabledPrevComputed.value) emit('prev')
      }
      ev.preventDefault()
    }
    const onControlsEnter = () => {
      isHoveringControls.value = true
      if (autoHideTimer.value) {
        clearTimeout(autoHideTimer.value)
        autoHideTimer.value = null
      }
      showControlsInternal.value = true
    }
    const onControlsLeave = () => {
      isHoveringControls.value = false
      resetAutoHideTimer()
    }
    onUnmounted(() => {
      if (autoHideTimer.value) {
        clearTimeout(autoHideTimer.value)
      }
    })
    const disabledPrevComputed = computed(() => {
      if (typeof props.disabledPrev === 'boolean') return props.disabledPrev
      return props.currentPage <= 1
    })
    const disabledNextComputed = computed(() => {
      if (typeof props.disabledNext === 'boolean') return props.disabledNext
      return props.currentPage >= props.totalPages
    })

    const progressInputRef = ref<HTMLInputElement | null>(null)
    const isDraggingProgress = ref(false)
    const progressTooltip = ref({
      show: false,
      x: 0,
      y: 0,
      page: 1
    })

    const onProgressInput = (ev: Event) => {
      emit('progress-input', ev)
    }
    const onNaiveSliderUpdate = (val: number) => {
      emit('progress-input', { target: { value: val } } as unknown as Event)
    }

    return {
      effectiveShowControls,
      onClickShowControls,
      onWheel,
      onNaiveSliderUpdate,
      disabledPrevComputed,
      disabledNextComputed,
      progressInputRef,
      isDraggingProgress,
      progressTooltip,
      onProgressInput,

      onControlsEnter,
      onControlsLeave
    }
  }
})
</script>

<style lang="scss" scoped>
.reader-controls {
  @apply h-full w-full flex items-center justify-between;

  /* 顶部控制栏（通用） */
  .top-controls {
    @apply absolute top-5 left-0 right-0 flex items-center justify-between p-6 z-10;
    z-index: 100;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), transparent);
    transition:
      opacity 0.3s ease,
      transform 0.3s ease;

    &.controls-hidden {
      opacity: 0;
      transform: translateY(-100%);
      pointer-events: none;
    }

    /* 顶部按钮与信息 */
    .control-button {
      @apply flex items-center justify-center w-10 h-10 text-white rounded-lg transition-all duration-200;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(10px);

      &:hover {
        background: rgba(0, 0, 0, 0.6);
        transform: scale(1.05);
      }
    }

    .back-button {
      @apply w-12 h-12;
    }

    .page-indicator {
      @apply text-white text-xl font-medium px-4 py-2 rounded-lg;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(10px);
    }

    .function-buttons {
      @apply flex items-center space-x-3;
    }

    /* 缩放显示（已存在，保留） */
    .zoom-display {
      @apply text-white text-sm px-2 py-1 rounded;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(10px);
      min-width: 50px;
      text-align: center;
    }
  }

  /* 底部进度条（通用） */
  .bottom-progress {
    @apply absolute bottom-0 left-2 right-2 z-10;
    height: 60px;
    padding: 15px 0;
    background: #000;
    &.controls-hidden {
      opacity: 0;
      transform: translateY(100%);
      pointer-events: none;
    }
  }

  /* 左右切换按钮（通用） */
  .nav-button {
    @apply absolute top-1/2 transform -translate-y-1/2 w-16 h-16 flex items-center justify-center text-white rounded-full transition-all duration-200 z-10;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(10px);

    &:hover:not(.disabled) {
      background: rgba(0, 0, 0, 0.6);
      transform: translateY(-50%) scale(1.1);
    }

    &.disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    &.nav-left {
      left: 2rem;
    }

    &.nav-right {
      right: 2rem;
    }

    &.controls-hidden {
      opacity: 0;
      pointer-events: none;
    }
  }

  /* 快捷键提示（通用） */
  .keyboard-hints {
    @apply absolute bottom-6 left-6 flex space-x-4 text-white text-xs z-10;
    transition: opacity 0.3s ease;

    &.controls-hidden {
      opacity: 0;
    }

    .hint-item {
      @apply px-2 py-1 rounded;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(10px);
    }
  }

  /* 响应式细节（通用） */
  @media (max-width: 768px) {
    .desktop-only {
      display: none;
    }
    .top-controls {
      @apply p-4;
    }
    .bottom-progress {
      @apply p-4;
    }
    .nav-button {
      @apply w-12 h-12;
    }
    .nav-button.nav-left {
      left: 1rem;
    }
    .nav-button.nav-right {
      right: 1rem;
    }
    .page-indicator {
      @apply text-lg;
    }
    .function-buttons {
      @apply space-x-2;
    }
  }

  @media (max-width: 480px) {
    .function-buttons {
      @apply space-x-1;
    }
    .control-button {
      @apply w-8 h-8;
    }
    .back-button {
      @apply w-10 h-10;
    }
  }
}
</style>
