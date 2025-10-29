<template>
  <div class="pdf-reader">
    <div class="pdf-container">
      <!-- PDF页面 -->
      <div class="pdf-wrapper" :style="pdfTransformStyle">
        <VuePdfEmbed
          ref="pdfRef"
          :source="state.pdfSource"
          :page="state.currentPageNum"
          :scale="state.zoomLevel"
          @loaded="onPdfLoaded"
          @loading-failed="onPdfLoadingFailed"
          @rendered="onPdfRendered"
          @rendering-failed="onPdfRenderingFailed"
          class="pdf-embed"
        />
      </div>
      <div class="progress-bar">
        <n-slider
          vertical
          reverse
          :min="1"
          :max="Math.max(state.totalPages, 1)"
          :value="Math.min(Math.max(state.currentPageNum, 1), Math.max(state.totalPages, 1))"
          :step="1"
          :format-tooltip="(p) => `${p} / ${state.totalPages}`"
          @update:value="handleProgressChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import VuePdfEmbed from 'vue-pdf-embed'
import ReaderControls from './reader-controls.vue'

// Props 和 Emits
const props = defineProps<{
  file: Object
}>()
const currentPage = ref(1)
// 响应式状态
const state = reactive({
  currentPageNum: 1,
  totalPages: 0,
  zoomLevel: 2,
  loading: true,
  error: false,
  errorMessage: '',
  loadingText: '初始化PDF...',
  loadingProgress: 0,
  currentPdfFile: null,
  pdfSource: null,
  pdfWidth: 800,
  pdfHeight: 600
})

// Refs
const pdfRef = ref<InstanceType<typeof VuePdfEmbed>>()

// 计算属性
const pdfTransformStyle = computed(() => ({
  transform: `scale(${state.zoomLevel})`,
  transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  transformOrigin: 'center center'
}))

// 更新PDF尺寸
const updatePdfSize = () => {
  const container = document.querySelector('.pdf-container') as HTMLElement
  if (container) {
    state.pdfWidth = container.clientWidth - 40
    state.pdfHeight = container.clientHeight - 40
  }
}

const handleProgressChange = (value) => {
  const newPageNum = parseInt(value)
  jumpToPage(newPageNum)
}
const loadPdfDocument = async (index: number) => {
  try {
    state.loading = true
    state.error = false
    state.loadingText = '加载PDF文档...'
    state.loadingProgress = 0

    // 设置PDF源数据
    state.pdfSource = `file://${props.file.fullPath}` //arrayBuffer
    state.currentPageNum = 1

    // 更新PDF尺寸
    updatePdfSize()
  } catch (err: any) {
    console.error('加载PDF文档失败:', err)
    state.errorMessage = `加载PDF文档失败: ${err.message}`
    state.error = true
    state.loading = false
  }
}

// PDF事件处理
const onPdfLoaded = async (pdf: any) => {
  console.log('PDF加载成功:', pdf)
  state.totalPages = pdf.numPages
  state.loading = false
  state.error = false
  state.loadingProgress = 100
}

const onPdfLoadingFailed = (error: any) => {
  console.error('PDF加载失败:', error)
  state.errorMessage = `PDF加载失败: ${error.message || '未知错误'}`
  state.error = true
  state.loading = false
}

const onPdfRendered = async () => {
  console.log('PDF页面渲染完成')
}

const onPdfRenderingFailed = (error: any) => {
  console.error('PDF渲染失败:', error)
  state.errorMessage = `PDF渲染失败: ${error.message || '未知错误'}`
  state.error = true
}

// 防抖定时器
let jumpToPageTimer: NodeJS.Timeout | null = null

// 页面导航函数（带防抖）
const jumpToPage = (pageNum: number) => {
  if (pageNum < 1 || pageNum > state.totalPages) return

  // 清除之前的定时器
  if (jumpToPageTimer) {
    clearTimeout(jumpToPageTimer)
  }

  // 设置新的防抖定时器
  jumpToPageTimer = setTimeout(() => {
    state.currentPageNum = pageNum
    jumpToPageTimer = null
  }, 100) // 100ms 防抖延迟
}

const nextPage = () => {
  if (state.currentPageNum < state.totalPages) {
    jumpToPage(state.currentPageNum + 1)
  }
}

const prevPage = () => {
  if (state.currentPageNum > 1) {
    jumpToPage(state.currentPageNum - 1)
  }
}

// 缩放功能
const setZoom = (zoom: number) => {
  state.zoomLevel = Math.max(0.5, Math.min(3, zoom))
}

const zoomIn = async () => {
  setZoom(state.zoomLevel * 1.2)
}

const zoomOut = async () => {
  setZoom(state.zoomLevel / 1.2)
}

const resetZoom = async () => {
  state.zoomLevel = 1
}

// 重试加载
const retryLoad = () => {
  loadPdfDocument()
}

// 窗口大小变化时重新渲染
const handleResize = async () => {
  updatePdfSize()
}

// 生命周期钩子
onMounted(() => {
  loadPdfDocument()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style lang="scss" scoped>
.pdf-reader {
  @apply w-full h-full relative overflow-hidden;
  background: #1a1a1a;
  cursor: none;

  &:hover {
    cursor: default;
  }

  /* 主PDF容器 */
  .pdf-container {
    @apply w-full h-full flex items-center justify-center relative;

    .pdf-wrapper {
      @apply flex items-center justify-center;
      transform-origin: center center;

      .pdf-embed {
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        background: white;
      }
    }
  }

  /* 加载状态 */
  .loading-overlay {
    @apply absolute inset-0 flex items-center justify-center;
    background: rgba(26, 26, 26, 0.8);

    .loading-content {
      @apply text-center text-white;

      .loading-spinner {
        @apply w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4;
      }

      .loading-text {
        @apply text-lg mb-4;
      }

      .loading-progress {
        @apply w-64 mx-auto;

        .progress-bar {
          @apply w-full h-2 bg-gray-700 rounded-full mb-2;

          .progress-fill {
            @apply h-full bg-blue-500 rounded-full transition-all duration-300;
          }
        }

        .progress-text {
          @apply text-sm text-gray-300;
        }
      }
    }
  }

  /* 错误状态 */
  .error-overlay {
    @apply absolute inset-0 flex items-center justify-center;
    background: rgba(26, 26, 26, 0.8);

    .error-content {
      @apply text-center text-white;

      .error-icon {
        @apply text-6xl mb-4;
      }

      .error-text {
        @apply text-lg mb-4;
      }

      .retry-button {
        @apply px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors;
      }
    }
  }

  /* 顶部控制栏（右上额外内容） */
  .pdf-selector {
    @apply px-2 py-1 rounded text-white text-sm max-w-32 truncate;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(10px);
    border: none;
    outline: none;

    option {
      @apply bg-gray-800 text-white;
    }
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .pdf-selector {
      @apply max-w-24 text-xs;
    }
  }

  @media (max-width: 480px) {
    .pdf-selector {
      @apply max-w-20;
    }
  }

  /* 滚动条隐藏 */
  &::-webkit-scrollbar {
    display: none;
  }
}

/* 全屏时的样式调整 */
:fullscreen {
  .pdf-reader {
    background: #000;
  }
}
.progress-bar {
  height: 90%;
  position: absolute;
  right: 20%;
}
</style>
