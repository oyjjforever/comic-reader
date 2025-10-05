<template>
  <div class="pdf-reader">
    <ReaderControls
      :current-page="state.currentPageNum"
      :total-pages="state.totalPages"
      :show-auto-play="false"
      :show-zoom-controls="true"
      :zoom-percent="state.zoomLevel * 100"
      @back="goBack"
      @resetZoom="resetZoom"
      @zoomIn="zoomIn"
      @zoomOut="zoomOut"
      @prev="prevPage"
      @next="nextPage"
      @progress-input="handleProgressChange"
    >
      <!-- 主PDF显示区域（通过插槽渲染） -->
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

        <!-- 加载状态 -->
        <div v-if="state.loading" class="loading-overlay">
          <div class="loading-content">
            <div class="loading-spinner"></div>
            <p class="loading-text">{{ state.loadingText }}</p>
            <div v-if="state.loadingProgress > 0" class="loading-progress">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: `${state.loadingProgress}%` }"></div>
              </div>
              <span class="progress-text">{{ Math.round(state.loadingProgress) }}%</span>
            </div>
          </div>
        </div>

        <!-- 错误状态 -->
        <div v-if="state.error" class="error-overlay">
          <div class="error-content">
            <div class="error-icon">⚠️</div>
            <p class="error-text">{{ state.errorMessage }}</p>
            <button @click="retryLoad" class="retry-button">重试</button>
          </div>
        </div>
      </div>

      <template #right-extra>
        <select
          v-if="state.pdfFiles.length > 1"
          v-model="state.currentPdfIndex"
          @change="switchPdfFile"
          class="pdf-selector"
        >
          <option v-for="(file, index) in state.pdfFiles" :key="index" :value="index">
            {{ file.name }}
          </option>
        </select>
      </template>
    </ReaderControls>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import VuePdfEmbed from 'vue-pdf-embed'
import ReaderControls from './reader-controls.vue'

// 类型定义
interface PdfFile {
  name: string
  path: string
}

interface PdfState {
  pdfFiles: PdfFile[]
  currentPdfIndex: number
  currentPageNum: number
  totalPages: number
  zoomLevel: number
  loading: boolean
  error: boolean
  errorMessage: string
  loadingText: string
  loadingProgress: number
  currentPdfFile: PdfFile | null
  pdfSource: string | ArrayBuffer | null
  pdfWidth: number
  pdfHeight: number
}

// Props 和 Emits
const props = defineProps<{
  folderPath: string
  currentPage?: number
}>()

const emits = defineEmits<{
  'update:currentPage': [page: number]
}>()

// 路由
const router = useRouter()

// 响应式状态
const state = reactive<PdfState>({
  pdfFiles: [],
  currentPdfIndex: 0,
  currentPageNum: 1,
  totalPages: 0,
  zoomLevel: 1,
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

// 监听当前PDF文件变化
watch(
  () => state.currentPdfIndex,
  (newIndex) => {
    state.currentPdfFile = state.pdfFiles[newIndex] || null
  }
)

// 监听页码变化
watch(
  () => state.currentPageNum,
  (newPageNum) => {
    emits('update:currentPage', newPageNum)
  }
)

// 更新PDF尺寸
const updatePdfSize = () => {
  const container = document.querySelector('.pdf-container') as HTMLElement
  if (container) {
    state.pdfWidth = container.clientWidth - 40
    state.pdfHeight = container.clientHeight - 40
  }
}

const handleProgressChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const newPageNum = parseInt(target.value)
  jumpToPage(newPageNum)
}
// PDF加载相关函数
const loadPdfList = async () => {
  try {
    state.loading = true
    state.error = false
    state.loadingText = '加载PDF文件列表...'

    const files = await window.book.getFiles(props.folderPath)

    if (files.length === 0) {
      state.errorMessage = '该文件夹中没有找到PDF文件'
      state.error = true
      state.loading = false
      return
    }

    state.pdfFiles = files.map((file: any) => ({
      name: file.name,
      path: file.fullPath
    }))

    // 加载第一个PDF文件
    await loadPdfDocument(0)

    if (props.currentPage && props.currentPage > 0 && props.currentPage <= state.totalPages) {
      state.currentPageNum = props.currentPage
    }
  } catch (err: any) {
    console.error('加载PDF列表失败:', err)
    state.errorMessage = '加载PDF文件列表失败'
    state.error = true
    state.loading = false
  }
}

const loadPdfDocument = async (index: number) => {
  try {
    state.loading = true
    state.error = false
    state.loadingText = '加载PDF文档...'
    state.loadingProgress = 0

    state.currentPdfIndex = index
    const pdfFile = state.pdfFiles[index]

    if (!pdfFile) {
      throw new Error('PDF文件不存在')
    }
    // 设置PDF源数据
    state.pdfSource = `file://${pdfFile.path}` //arrayBuffer
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

// PDF文件切换
const switchPdfFile = async () => {
  await loadPdfDocument(state.currentPdfIndex)
  state.currentPageNum = 1
}

// 重试加载
const retryLoad = () => {
  if (state.pdfFiles.length > 0) {
    loadPdfDocument(state.currentPdfIndex)
  } else {
    loadPdfList()
  }
}
// 返回功能
const goBack = () => {
  router.back()
}

// 窗口大小变化时重新渲染
const handleResize = async () => {
  updatePdfSize()
}

// 生命周期钩子
onMounted(() => {
  loadPdfList()
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
</style>
