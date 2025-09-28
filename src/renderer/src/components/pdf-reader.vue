<template>
  <div
    class="pdf-reader"
    @mousemove="handleMouseMove"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- 主PDF显示区域 -->
    <div class="pdf-container" @wheel="handleWheel">
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

    <!-- 顶部控制栏 -->
    <div class="top-controls" :class="{ 'controls-hidden': !ui.showControls }">
      <!-- 返回按钮 -->
      <button class="control-button back-button" @click="goBack">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
      </button>

      <!-- 页码显示 -->
      <div class="page-indicator">{{ state.currentPageNum }} / {{ state.totalPages }}</div>

      <!-- 功能按钮组 -->
      <div class="function-buttons">
        <!-- 全屏按钮 -->
        <button class="control-button" @click="toggleFullscreen" title="全屏 (双击)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
            />
          </svg>
        </button>

        <!-- 缩放重置按钮 -->
        <button class="control-button" @click="resetZoom" title="适应屏幕">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 5.83L15.17 9l1.41-1.41L12 3 7.41 7.59 8.83 9 12 5.83zm0 12.34L8.83 15l-1.41 1.41L12 21l4.59-4.59L15.17 15 12 18.17z"
            />
          </svg>
        </button>

        <!-- 缩放控制 -->
        <button class="control-button" @click="zoomOut" title="缩小">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13H5v-2h14v2z" />
          </svg>
        </button>

        <span class="zoom-display">{{ Math.round(state.zoomLevel * 100) }}%</span>

        <button class="control-button" @click="zoomIn" title="放大">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
        </button>

        <!-- PDF文件切换 -->
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
      </div>
    </div>

    <!-- 底部进度条 -->
    <div class="bottom-progress" :class="{ 'controls-hidden': !ui.showControls }">
      <div class="progress-bar">
        <div
          class="progress-fill"
          :style="{ width: `${(state.currentPageNum / state.totalPages) * 100}%` }"
        ></div>
        <input
          type="range"
          class="progress-slider"
          :min="1"
          :max="state.totalPages"
          :value="state.currentPageNum"
          @input="handleProgressChange"
          @mousedown="handleProgressMouseDown"
          @mousemove="handleProgressMouseMove"
          @mouseup="handleProgressMouseUp"
          @mouseleave="handleProgressMouseUp"
        />
      </div>
      <div class="progress-info">
        <span class="pdf-name">{{ state.currentPdfFile?.name }}</span>
        <span class="zoom-info">{{ Math.round(state.zoomLevel * 100) }}%</span>
      </div>
    </div>

    <!-- 进度提示框 -->
    <div
      v-if="progressTooltip.show"
      class="progress-tooltip"
      :style="{
        left: `${progressTooltip.x}px`,
        top: `${progressTooltip.y}px`
      }"
    >
      {{ progressTooltip.page }} / {{ state.totalPages }}
    </div>

    <!-- 左右切换按钮 -->
    <button
      class="nav-button nav-left"
      :class="{ 'controls-hidden': !ui.showControls, disabled: state.currentPageNum <= 1 }"
      @click="prevPage"
      :disabled="state.currentPageNum <= 1"
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
      </svg>
    </button>

    <button
      class="nav-button nav-right"
      :class="{
        'controls-hidden': !ui.showControls,
        disabled: state.currentPageNum >= state.totalPages
      }"
      @click="nextPage"
      :disabled="state.currentPageNum >= state.totalPages"
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
      </svg>
    </button>

    <!-- 快捷键提示（桌面端） -->
    <div class="keyboard-hints desktop-only" :class="{ 'controls-hidden': !ui.showControls }">
      <div class="hint-item">← → 切换</div>
      <div class="hint-item">滚轮缩放</div>
      <div class="hint-item">ESC 退出</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import VuePdfEmbed from 'vue-pdf-embed'

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

interface UIState {
  showControls: boolean
  isFullscreen: boolean
  autoHideTimer: NodeJS.Timeout | null
}

interface TouchState {
  startX: number
  startY: number
  startDistance: number
  initialZoom: number
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

// 常量
const AUTO_HIDE_DELAY = 3000

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

const ui = reactive<UIState>({
  showControls: true,
  isFullscreen: false,
  autoHideTimer: null
})

const touch = reactive<TouchState>({
  startX: 0,
  startY: 0,
  startDistance: 0,
  initialZoom: 1
})

// 进度提示框状态
const progressTooltip = ref({
  show: false,
  x: 0,
  y: 0,
  page: 1
})
const isDraggingProgress = ref(false)

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

// 监听容器大小变化，更新PDF尺寸
watch([() => ui.isFullscreen], () => {
  nextTick(() => {
    updatePdfSize()
  })
})

// UI控制函数
const showControlsTemporarily = () => {
  ui.showControls = true
  resetAutoHideTimer()
}

const resetAutoHideTimer = () => {
  if (ui.autoHideTimer) {
    clearTimeout(ui.autoHideTimer)
  }
  ui.autoHideTimer = setTimeout(() => {
    ui.showControls = false
  }, AUTO_HIDE_DELAY)
}

// 更新PDF尺寸
const updatePdfSize = () => {
  const container = document.querySelector('.pdf-container') as HTMLElement
  if (container) {
    state.pdfWidth = container.clientWidth - 40
    state.pdfHeight = container.clientHeight - 40
  }
}

// 事件处理函数
const handleMouseMove = () => {
  showControlsTemporarily()
}

const toggleFullscreen = async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
      ui.isFullscreen = true
    } else {
      await document.exitFullscreen()
      ui.isFullscreen = false
    }
  } catch (err) {
    console.warn('全屏操作失败:', err)
  }
}

// 触摸事件处理
const handleTouchStart = (event: TouchEvent) => {
  showControlsTemporarily()

  if (event.touches.length === 1) {
    touch.startX = event.touches[0].clientX
    touch.startY = event.touches[0].clientY
  } else if (event.touches.length === 2) {
    const touch1 = event.touches[0]
    const touch2 = event.touches[1]
    touch.startDistance = Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    )
    touch.initialZoom = state.zoomLevel
  }
}

const handleTouchMove = (event: TouchEvent) => {
  event.preventDefault()

  if (event.touches.length === 2) {
    const touch1 = event.touches[0]
    const touch2 = event.touches[1]
    const currentDistance = Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    )

    const scale = currentDistance / touch.startDistance
    const newZoom = Math.max(0.5, Math.min(3, touch.initialZoom * scale))
    setZoom(newZoom)
  }
}

const handleTouchEnd = (event: TouchEvent) => {
  if (event.changedTouches.length === 1 && event.touches.length === 0) {
    const touchEndX = event.changedTouches[0].clientX
    const touchEndY = event.changedTouches[0].clientY

    const deltaX = touchEndX - touch.startX
    const deltaY = touchEndY - touch.startY

    // 水平滑动切换页面
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        prevPage()
      } else {
        nextPage()
      }
    }
  }
}

const handleProgressChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const newPageNum = parseInt(target.value)
  jumpToPage(newPageNum)
}

// 进度条拖动事件处理
const handleProgressMouseDown = (event: MouseEvent) => {
  isDraggingProgress.value = true
  updateProgressTooltip(event)
}

const handleProgressMouseMove = (event: MouseEvent) => {
  if (isDraggingProgress.value) {
    updateProgressTooltip(event)
  }
}

const handleProgressMouseUp = () => {
  isDraggingProgress.value = false
  progressTooltip.value.show = false
}

const updateProgressTooltip = (event: MouseEvent) => {
  const target = event.target as HTMLInputElement
  const rect = target.getBoundingClientRect()
  const percentage = (event.clientX - rect.left) / rect.width
  const clampedPercentage = Math.max(0, Math.min(1, percentage))
  const page = Math.round(clampedPercentage * (state.totalPages - 1)) + 1

  progressTooltip.value = {
    show: true,
    x: event.clientX,
    y: rect.top - 40, // 在进度条上方40px显示
    page: Math.max(1, Math.min(state.totalPages, page))
  }
}

const handleWheel = async (event: WheelEvent) => {
  event.preventDefault()
  showControlsTemporarily()

  if (event.deltaY < 0) {
    await zoomIn()
  } else {
    await zoomOut()
  }
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
    showControlsTemporarily()
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
  showControlsTemporarily()
}

const zoomOut = async () => {
  setZoom(state.zoomLevel / 1.2)
  showControlsTemporarily()
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

// 键盘事件
const handleKeydown = async (event: KeyboardEvent) => {
  showControlsTemporarily()

  switch (event.key) {
    case 'ArrowLeft':
      prevPage()
      break
    case 'ArrowRight':
      nextPage()
      break
    case 'Escape':
      if (ui.isFullscreen) {
        toggleFullscreen()
      } else {
        goBack()
      }
      break
    case '+':
    case '=':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        await zoomIn()
      }
      break
    case '-':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        await zoomOut()
      }
      break
    case '0':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        await resetZoom()
      }
      break
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
  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', handleResize)
  resetAutoHideTimer()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleResize)

  if (ui.autoHideTimer) {
    clearTimeout(ui.autoHideTimer)
  }
})
</script>

<style scoped>
.pdf-reader {
  @apply w-full h-full relative overflow-hidden;
  background: #1a1a1a;
  cursor: none;
}

.pdf-reader:hover {
  cursor: default;
}

/* 主PDF容器 */
.pdf-container {
  @apply w-full h-full flex items-center justify-center relative;
}

.pdf-wrapper {
  @apply flex items-center justify-center;
  transform-origin: center center;
}

.pdf-embed {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  background: white;
}

/* 加载状态 */
.loading-overlay {
  @apply absolute inset-0 flex items-center justify-center;
  background: rgba(26, 26, 26, 0.8);
}

.loading-content {
  @apply text-center text-white;
}

.loading-spinner {
  @apply w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4;
}

.loading-text {
  @apply text-lg mb-4;
}

.loading-progress {
  @apply w-64 mx-auto;
}

.progress-bar {
  @apply w-full h-2 bg-gray-700 rounded-full mb-2;
}

.progress-fill {
  @apply h-full bg-blue-500 rounded-full transition-all duration-300;
}

.progress-text {
  @apply text-sm text-gray-300;
}

/* 错误状态 */
.error-overlay {
  @apply absolute inset-0 flex items-center justify-center;
  background: rgba(26, 26, 26, 0.8);
}

.error-content {
  @apply text-center text-white;
}

.error-icon {
  @apply text-6xl mb-4;
}

.error-text {
  @apply text-lg mb-4;
}

.retry-button {
  @apply px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors;
}

/* 顶部控制栏 */
.top-controls {
  @apply absolute top-0 left-0 right-0 flex items-center justify-between p-6 z-10;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), transparent);
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.top-controls.controls-hidden {
  opacity: 0;
  transform: translateY(-100%);
  pointer-events: none;
}

.control-button {
  @apply flex items-center justify-center w-10 h-10 text-white rounded-lg transition-all duration-200;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
}

.control-button:hover {
  background: rgba(0, 0, 0, 0.6);
  transform: scale(1.05);
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

.zoom-display {
  @apply text-white text-sm px-2 py-1 rounded;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  min-width: 50px;
  text-align: center;
}

.pdf-selector {
  @apply px-2 py-1 rounded text-white text-sm max-w-32 truncate;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  border: none;
  outline: none;
}

.pdf-selector option {
  @apply bg-gray-800 text-white;
}

/* 底部进度条 */
.bottom-progress {
  @apply absolute bottom-0 left-0 right-0 p-6 z-10;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.6), transparent);
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.bottom-progress.controls-hidden {
  opacity: 0;
  transform: translateY(100%);
  pointer-events: none;
}

.bottom-progress .progress-bar {
  @apply relative mb-3 h-1 bg-gray-700 rounded-full;
}

.bottom-progress .progress-fill {
  @apply h-full bg-blue-500 rounded-full transition-all duration-300;
}

.progress-slider {
  @apply absolute inset-0 w-full h-1 opacity-0 cursor-pointer;
}

/* 进度提示框 */
.progress-tooltip {
  @apply fixed z-50 px-3 py-2 text-white text-sm font-medium rounded-lg pointer-events-none;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  transform: translateX(-50%);
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.progress-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: rgba(0, 0, 0, 0.8);
}

.progress-info {
  @apply flex items-center justify-between text-white text-sm;
}

.pdf-name {
  @apply truncate max-w-xs;
}

.zoom-info {
  @apply px-2 py-1 rounded;
  background: rgba(0, 0, 0, 0.4);
}

/* 导航按钮 */
.nav-button {
  @apply absolute top-1/2 transform -translate-y-1/2 w-16 h-16 flex items-center justify-center text-white rounded-full transition-all duration-200 z-10;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
}

.nav-button:hover:not(.disabled) {
  background: rgba(0, 0, 0, 0.6);
  transform: translateY(-50%) scale(1.1);
}

.nav-button.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-left {
  left: 2rem;
}

.nav-right {
  right: 2rem;
}

.nav-button.controls-hidden {
  opacity: 0;
  pointer-events: none;
}

/* 快捷键提示 */
.keyboard-hints {
  @apply absolute bottom-6 left-6 flex space-x-4 text-white text-xs z-10;
  transition: opacity 0.3s ease;
}

.keyboard-hints.controls-hidden {
  opacity: 0;
}

.hint-item {
  @apply px-2 py-1 rounded;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
}

/* 响应式设计 */
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

  .nav-left {
    left: 1rem;
  }

  .nav-right {
    right: 1rem;
  }

  .page-indicator {
    @apply text-lg;
  }

  .function-buttons {
    @apply space-x-2;
  }

  .pdf-selector {
    @apply max-w-24 text-xs;
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

  .zoom-display {
    @apply text-xs px-1;
    min-width: 40px;
  }

  .pdf-selector {
    @apply max-w-20;
  }
}

/* 滚动条隐藏 */
::-webkit-scrollbar {
  display: none;
}

/* 全屏时的样式调整 */
:fullscreen .pdf-reader {
  background: #000;
}
</style>
