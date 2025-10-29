<template>
  <div class="general-reader">
    <reader-controls
      :current-page="page.index + 1"
      :total-pages="page.total"
      :show-auto-play="true"
      :is-auto-playing="isAutoPlaying"
      :show-zoom-controls="false"
      :zoom-percent="zoomLevel * 100"
      @back="goBack"
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
  list: [],
  index: 0,
  total: 0
})
let currentFile = ref({})
onMounted(() => {
  fetchData()
})
onUnmounted(() => {
  stopAutoPlay()
})
const fetchData = async () => {
  try {
    page.list = await window.book.getFiles(decodeURIComponent(route.query.folderPath))
    page.total = page.list.length
    jumpToPage(0)
  } catch (error) {
    message.error(error.message)
    // 返回上一页
    router.back()
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
  }
}
const prevPage = async () => {
  if (page.index > 0) {
    await jumpToPage(page.index - 1)
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
// 返回功能
const goBack = () => {
  stopAutoPlay()
  router.back()
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
