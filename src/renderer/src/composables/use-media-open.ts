import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import type { MediaItem } from '@/typings/media'

interface MediaOpenOptions {
  /** 当前网格过滤后的列表（用于上/下一篇定位） */
  getList: () => MediaItem[]
}

/**
 * 统一的媒体打开分发与阅读器 overlay 状态管理。
 * video/image（单文件）→ reader 单文件模式；comic/pdf/epub → reader 文件夹模式。
 * 站点作品（source !== 'local'）暂由调用方处理，后续接入站点路由。
 */
export function useMediaOpen(options: MediaOpenOptions) {
  const message = useMessage()
  const isOpen = ref(false)
  const currentItem = ref<MediaItem | null>(null)
  const currentIndex = ref(-1)

  /** 视频/单图为文件条目，其余走文件夹模式 */
  const readerMode = computed<'file' | 'folder'>(() =>
    currentItem.value && ['video', 'image'].includes(currentItem.value.kind) ? 'file' : 'folder'
  )
  const hasNext = computed(() => {
    if (currentIndex.value < 0) return false
    return currentIndex.value < options.getList().length - 1
  })
  const hasPrev = computed(() => currentIndex.value > 0)

  function openMedia(item: MediaItem) {
    if (item.state === 'loading') {
      message.warning('内容信息正在加载中，请稍后再试')
      return
    }
    if (item.state === 'empty') {
      message.warning('该文件夹不包含任何文件')
      return
    }
    currentItem.value = item
    currentIndex.value = options.getList().findIndex((i) => i.id === item.id)
    isOpen.value = true
  }

  function closeMedia() {
    isOpen.value = false
    currentItem.value = null
    currentIndex.value = -1
  }

  function jump(step: number) {
    const list = options.getList()
    const target = currentIndex.value + step
    if (target >= 0 && target < list.length) {
      currentItem.value = list[target]
      currentIndex.value = target
    }
  }

  function nextMedia() {
    jump(1)
  }

  function prevMedia() {
    jump(-1)
  }

  return {
    isOpen,
    currentItem,
    readerMode,
    hasNext,
    hasPrev,
    openMedia,
    closeMedia,
    nextMedia,
    prevMedia
  }
}
