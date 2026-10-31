import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import type { MediaItem } from '@/typings/media'

interface MediaOpenOptions {
  /** 当前网格过滤后的列表（用于上/下一篇定位） */
  getList: () => MediaItem[]
  /** 随机抽一部作品（如两级目录游走）；不提供时从 getList() 里随机 */
  getRandomItem?: () => Promise<MediaItem | null>
}

/**
 * 统一的媒体打开分发与阅读器 overlay 状态管理。
 * video/image（单文件）→ reader 单文件模式；comic/pdf/epub → reader 文件夹模式。
 * 站点作品（source !== 'local'）暂由调用方处理，后续接入站点路由。
 * 随机模式（openRandomMedia）下上一篇/下一篇均重新随机抽取。
 */
export function useMediaOpen(options: MediaOpenOptions) {
  const message = useMessage()
  const isOpen = ref(false)
  const currentItem = ref<MediaItem | null>(null)
  const currentIndex = ref(-1)

  // ===== 随机模式 =====
  // 随机打开后进入随机模式：上一篇/下一篇不再沿网格顺序，而是各自重新随机抽一部
  const isRandomMode = ref(false)
  /** 随机抽取进行中（防重入） */
  const randomLoading = ref(false)

  /** 可参与随机抽取的条目（排除加载中/空内容） */
  const eligibleList = (list: MediaItem[]) => list.filter((i) => !i.state)

  function pickFrom(list: MediaItem[]) {
    const eligible = eligibleList(list)
    if (eligible.length === 0) return null
    return eligible[Math.floor(Math.random() * eligible.length)]
  }

  async function drawRandomItem(): Promise<MediaItem | null> {
    if (options.getRandomItem) return await options.getRandomItem()
    return pickFrom(options.getList())
  }

  async function openRandomMedia() {
    if (randomLoading.value) return
    randomLoading.value = true
    try {
      const item = await drawRandomItem()
      if (!item) {
        message.warning('当前范围没有可随机打开的内容')
        return
      }
      isRandomMode.value = true
      currentItem.value = item
      currentIndex.value = -1
      isOpen.value = true
    } finally {
      randomLoading.value = false
    }
  }

  /** 随机模式下的上/下一篇：重新抽一部（尽量避开当前部） */
  async function drawRandom() {
    if (randomLoading.value) return
    randomLoading.value = true
    try {
      let item = await drawRandomItem()
      if (item && currentItem.value && item.id === currentItem.value.id) {
        item = await drawRandomItem()
      }
      if (!item) {
        message.warning('没有其他可随机打开的内容')
        return
      }
      currentItem.value = item
      currentIndex.value = -1
    } finally {
      randomLoading.value = false
    }
  }

  /** 视频/单图为文件条目，其余走文件夹模式 */
  const readerMode = computed<'file' | 'folder'>(() =>
    currentItem.value && ['video', 'image'].includes(currentItem.value.kind) ? 'file' : 'folder'
  )
  // 随机模式恒可切换（每次都是重新抽取）
  const hasNext = computed(() =>
    isRandomMode.value ? true : currentIndex.value >= 0 && currentIndex.value < options.getList().length - 1
  )
  const hasPrev = computed(() => (isRandomMode.value ? true : currentIndex.value > 0))

  function openMedia(item: MediaItem) {
    if (item.state === 'loading') {
      message.warning('内容信息正在加载中，请稍后再试')
      return
    }
    if (item.state === 'empty') {
      message.warning('该文件夹不包含任何文件')
      return
    }
    // 顺序模式
    isRandomMode.value = false
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
    if (isRandomMode.value) {
      drawRandom()
      return
    }
    jump(1)
  }

  function prevMedia() {
    if (isRandomMode.value) {
      drawRandom()
      return
    }
    jump(-1)
  }

  return {
    isOpen,
    currentItem,
    readerMode,
    hasNext,
    hasPrev,
    openMedia,
    openRandomMedia,
    randomLoading,
    closeMedia,
    nextMedia,
    prevMedia
  }
}
