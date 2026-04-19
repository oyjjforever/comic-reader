<template>
  <div class="general-reader">
    <reader-controls
      :current-page="page.index + 1"
      :total-pages="page.total"
      :show-auto-play="true"
      :is-auto-playing="isAutoPlaying"
      :show-zoom-controls="false"
      :zoom-percent="zoomLevel * 100"
      :disabled-prev="page.index <= 0 && !props.hasPrev"
      :disabled-next="page.index >= page.total - 1 && !props.hasNext"
      :has-next="props.hasNext"
      :has-prev="props.hasPrev"
      @back="goBack"
      @toggleFullscreen="toggleFullscreen"
      @toggleAutoPlay="toggleAutoPlay"
      @prev="prevPage"
      @next="nextPage"
      @progress-input="handleProgressChange"
    >
      <div class="reader-container">
        <component :is="readerComponent" :file="currentFile"></component>
      </div>
    </reader-controls>
  </div>
</template>

<script setup lang="ts">
import epubReader from './type/epub.vue'
import imageReader from './type/image.vue'
import pdfReader from './type/pdf.vue'
import videoReader from './type/video/index.vue'
import readerControls from './reader-controls.vue'
import { useMessage } from 'naive-ui'
import { reactive } from 'vue'

interface ReaderProps {
  folderPath?: string
  filePath?: string
  hasNext?: boolean
  hasPrev?: boolean
}

const props = withDefaults(defineProps<ReaderProps>(), {
  hasNext: false,
  hasPrev: false
})
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'next'): void
  (e: 'prev'): void
}>()

const route = useRoute()
const router = useRouter()
const message = useMessage()
const AUTO_PLAY_INTERVAL = 3000
const readerComponent = computed(() => {
  const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico']
  if (IMAGE_EXTENSIONS.includes(currentFile.value.extension)) return imageReader
  else if (currentFile.value.extension === '.pdf') return pdfReader
  else if (currentFile.value.extension === '.mp4') return videoReader
  else if (currentFile.value.extension === '.epub') return epubReader
})
const isAutoPlaying = ref(false)
const zoomLevel = ref(1)
const page = reactive({
  list: [] as any[],
  index: 0,
  total: 0
})
let currentFile = ref<any>({})
onMounted(() => {
  fetchData()
})
onUnmounted(() => {
  stopAutoPlay()
})
const fetchData = async () => {
  try {
    // 优先使用 props，其次使用 route query（兼容路由模式）
    const folderPath = props.folderPath || (route.query.folderPath as string)
    const filePath = props.filePath || (route.query.filePath as string)

    if (folderPath) {
      page.list = await window.media.getFiles(decodeURIComponent(folderPath))
      page.total = page.list.length
    }
    if (filePath) {
      page.list = [await window.file.getFileInfo(decodeURIComponent(filePath))]
      page.total = 1
    }
    jumpToPage(0)
  } catch (error: any) {
    message.error(error.message)
    // 返回上一页
    goBack()
  }
}

const autoPlayTimer = ref<NodeJS.Timeout | null>(null)

const jumpToPage = async (index: number) => {
  if (index < 0 || index >= page.total) return
  page.index = index
  currentFile.value = page.list[index]
}
const nextPage = async () => {
  if (page.index < page.total - 1) {
    await jumpToPage(page.index + 1)
  } else if (props.hasNext) {
    // 已是最后一页，且有下一篇，通知父组件切换
    emit('next')
  }
}
const prevPage = async () => {
  if (page.index > 0) {
    await jumpToPage(page.index - 1)
  } else if (props.hasPrev) {
    // 已是第一页，且有上一篇，通知父组件切换
    emit('prev')
  }
}
// 进度条变化处理
const handleProgressChange = (event: Event) => {
  const target = event.target
  const newIndex = parseInt(target.value) - 1
  jumpToPage(newIndex)
}
// 自动播放功能
const toggleAutoPlay = () => {
  if (isAutoPlaying.value) {
    stopAutoPlay()
  } else {
    startAutoPlay()
  }
}
const startAutoPlay = () => {
  if (page.index >= page.total - 1) {
    page.index = 0
  }

  isAutoPlaying.value = true
  autoPlayTimer.value = setInterval(() => {
    if (page.index < page.total - 1) {
      nextPage()
    } else {
      stopAutoPlay()
    }
  }, AUTO_PLAY_INTERVAL)
}
const stopAutoPlay = () => {
  isAutoPlaying.value = false
  if (autoPlayTimer.value) {
    clearInterval(autoPlayTimer.value)
    autoPlayTimer.value = null
  }
}
// 全屏功能
const toggleFullscreen = () => {
  const readerElement = document.querySelector('.general-reader')
  if (!document.fullscreenElement) {
    readerElement.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

// 返回功能
const goBack = () => {
  stopAutoPlay()
  // 优先使用 emit close（覆盖层模式），其次使用 router.back()（路由模式）
  emit('close')
  // 如果不是通过 props 传入的路径，说明是路由模式，需要返回
  if (!props.folderPath && !props.filePath) {
    router.back()
  }
}
</script>

<style lang="scss" scoped>
.general-reader {
  height: 100%;
  width: 100%;
  .reader-container {
    height: 100%;
    width: 100%;
  }
}
</style>
