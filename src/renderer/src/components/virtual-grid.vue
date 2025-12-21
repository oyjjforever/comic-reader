<template>
  <div ref="containerRef" class="virtual-grid-container" @scroll="handleScroll">
    <!-- 虚拟滚动区域 - 用于维持正确的滚动条高度 -->
    <div class="virtual-scroll-area" :style="{ height: totalHeight + 'px' }">
      <!-- 实际渲染的内容区域 -->
      <div class="virtual-content" :style="contentStyle">
        <div class="virtual-grid" :style="gridStyle">
          <div
            v-for="item in visibleItems"
            :key="getItemKey(item.data)"
            class="virtual-grid-item"
            :class="{
              dragging: draggedIndex === item.index,
              'drag-over': draggedOverIndex === item.index && draggedIndex !== item.index
            }"
            @dragstart="handleDragStart(item.index, $event)"
            @dragend="handleDragEnd"
            @dragover.prevent="handleDragOver(item.index, $event)"
            @drop="handleDrop(item.index, $event)"
            @dragenter="handleDragEnter(item.index)"
            @dragleave="handleDragLeave(item.index)"
          >
            <slot :item="item.data" :index="item.index" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { throttle, debounce } from 'lodash'

interface VirtualGridProps {
  items: any[]
  itemWidth: number
  itemHeight: number
  gap: number
  keyField?: string
  overscan?: number // 预渲染的额外行数
  draggable?: boolean // 是否启用拖拽排序
  mode?: 'virtual' | 'lazy' // 虚拟列表模式或懒加载模式
}

interface VirtualItem {
  data: any
  index: number
  row: number
  col: number
  x: number
  y: number
}

const props = withDefaults(defineProps<VirtualGridProps>(), {
  keyField: 'id',
  overscan: 2,
  draggable: false,
  mode: 'virtual'
})

const emit = defineEmits<{
  scroll: [event: Event]
  'sort-change': [fromIndex: number, toIndex: number]
}>()

const containerRef = ref<HTMLElement>()
const scrollTop = ref(0)
const containerWidth = ref(0)
const containerHeight = ref(0)

// 拖拽相关状态
const draggedIndex = ref<number | null>(null)
const draggedOverIndex = ref<number | null>(null)
const dragStartX = ref(0)
const dragStartY = ref(0)
const dragElement = ref<HTMLElement | null>(null)

// keep-alive 状态管理
const savedScrollTop = ref(0)
const isActive = ref(true)
const hasInitialized = ref(false)

// 计算网格布局参数
const columnsCount = computed(() => {
  if (containerWidth.value === 0) return 4
  // 计算理想列数，基于项目宽度
  const idealColumns = Math.floor(
    (containerWidth.value + props.gap) / (props.itemWidth + props.gap)
  )
  return Math.max(1, idealColumns)
})

const rowsCount = computed(() => {
  return Math.ceil(props.items.length / columnsCount.value)
})

const totalHeight = computed(() => {
  let res = rowsCount.value * (props.itemHeight + props.gap) - props.gap
  return res < 0 ? 0 : res
})
let latestEndRow = -1
// 计算可见区域
const visibleRange = computed(() => {
  const itemHeightWithGap = props.itemHeight + props.gap
  const startRow = Math.max(0, Math.floor(scrollTop.value / itemHeightWithGap) - props.overscan)
  const _endRow = Math.min(
    rowsCount.value - 1,
    Math.ceil((scrollTop.value + containerHeight.value) / itemHeightWithGap) + props.overscan
  )

  const endRow = props.mode === 'virtual' ? _endRow : Math.max(_endRow, latestEndRow)
  latestEndRow = endRow
  const res = {
    startRow: props.mode === 'virtual' ? startRow : 0,
    endRow,
    startIndex: props.mode === 'virtual' ? startRow * columnsCount.value : 0,
    endIndex: Math.min(props.items.length - 1, (endRow + 1) * columnsCount.value - 1)
  }
  return res
})

// 计算可见的项目
const visibleItems = computed((): VirtualItem[] => {
  const { startIndex, endIndex } = visibleRange.value
  const items: VirtualItem[] = []

  // 计算实际的列宽，用于定位
  const totalGapWidth = (columnsCount.value - 1) * props.gap
  const availableWidth = containerWidth.value - totalGapWidth
  const actualColumnWidth =
    columnsCount.value > 0 ? availableWidth / columnsCount.value : props.itemWidth

  for (let i = startIndex; i <= endIndex && i < props.items.length; i++) {
    const row = Math.floor(i / columnsCount.value)
    const col = i % columnsCount.value
    const x = col * (actualColumnWidth + props.gap)
    const y = row * (props.itemHeight + props.gap)

    items.push({
      data: props.items[i],
      index: i,
      row,
      col,
      x,
      y
    })
  }

  return items
})

// 内容区域样式
const contentStyle = computed(() => ({
  transform: `translateY(${visibleRange.value.startRow * (props.itemHeight + props.gap)}px)`,
  width: '100%'
}))

// 网格样式
const gridStyle = computed(() => {
  // 计算可用宽度（容器宽度减去所有间隙）
  const totalGapWidth = (columnsCount.value - 1) * props.gap
  const availableWidth = containerWidth.value - totalGapWidth

  // 计算每列的实际宽度，确保所有列能撑满容器
  const columnWidth = columnsCount.value > 0 ? availableWidth / columnsCount.value : props.itemWidth
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${columnsCount.value}, ${columnWidth}px)`,
    gridAutoRows: `${props.itemHeight}px`,
    gap: `${props.gap}px`,
    padding: '10px',
    justifyContent: 'start'
  }
})

// 获取项目的唯一键
const getItemKey = (item: any) => {
  return props.keyField ? item[props.keyField] : item
}

// 拖拽事件处理函数
const handleDragStart = (index: number, event: DragEvent) => {
  if (!props.draggable) return

  draggedIndex.value = index
  dragStartX.value = event.clientX || 0
  dragStartY.value = event.clientY || 0
  dragElement.value = event.target as HTMLElement

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    // 设置拖拽数据
    event.dataTransfer.setData('text/html', (event.target as HTMLElement).innerHTML)
  }
}

const handleDragEnd = () => {
  if (!props.draggable) return

  // 重置拖拽状态
  draggedIndex.value = null
  draggedOverIndex.value = null
  dragElement.value = null
}

const handleDragOver = (index: number, event: DragEvent) => {
  if (!props.draggable || draggedIndex.value === null) return

  // 防止默认行为以允许放置
  event.preventDefault()

  if (draggedIndex.value !== index) {
    draggedOverIndex.value = index
  }
}

const handleDrop = (index: number, event: DragEvent) => {
  if (!props.draggable || draggedIndex.value === null) return

  event.preventDefault()

  const fromIndex = draggedIndex.value
  // 使用 draggedOverIndex 作为目标索引，如果为空则使用传入的 index
  const toIndex = draggedOverIndex.value !== null ? draggedOverIndex.value : index

  // 只有当索引不同时才触发排序事件
  if (fromIndex !== toIndex) {
    emit('sort-change', fromIndex, toIndex)
  }

  // 重置拖拽状态
  handleDragEnd()
}

const handleDragEnter = (index: number) => {
  if (!props.draggable || draggedIndex.value === null) return

  if (draggedIndex.value !== index) {
    draggedOverIndex.value = index
  }
}

const handleDragLeave = (index: number) => {
  if (!props.draggable || draggedIndex.value === null) return

  // 只有当离开的元素不是当前拖拽经过的元素时才重置
  if (draggedOverIndex.value === index) {
    draggedOverIndex.value = null
  }
}

// 滚动处理
const handleScroll = throttle((event: Event) => {
  const target = event.target as HTMLElement
  scrollTop.value = target.scrollTop
  // 向父组件发送滚动事件
  emit('scroll', event)
}, 16) // 约60fps

// 容器尺寸监听
const updateContainerSize = debounce(() => {
  if (containerRef.value && isActive.value) {
    const rect = containerRef.value.getBoundingClientRect()
    containerWidth.value = rect.width - 20
    containerHeight.value = rect.height
  }
}, 100)

// ResizeObserver
let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  await nextTick()
  if (!hasInitialized.value) {
    updateContainerSize()

    // 监听容器尺寸变化
    if (containerRef.value && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(updateContainerSize)
      resizeObserver.observe(containerRef.value)
    }

    // 监听窗口尺寸变化（备用方案）
    window.addEventListener('resize', updateContainerSize)
    hasInitialized.value = true
  }
})

// keep-alive 组件激活时
onActivated(() => {
  isActive.value = true
  nextTick(() => {
    // 恢复滚动位置
    if (containerRef.value && savedScrollTop.value > 0) {
      containerRef.value.scrollTop = savedScrollTop.value
      scrollTop.value = savedScrollTop.value
    }
    // 更新容器尺寸（可能在失活期间窗口大小发生了变化）
    updateContainerSize()
  })
})

// keep-alive 组件失活时
onDeactivated(() => {
  isActive.value = false
  // 保存当前滚动位置
  savedScrollTop.value = scrollTop.value
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  window.removeEventListener('resize', updateContainerSize)
})

// 监听items变化，智能处理滚动位置
watch(
  () => props.items.length,
  (newLength, oldLength) => {
    // 只在组件激活且数据真正变化时处理
    if (isActive.value && newLength !== oldLength) {
      if (newLength === 0) {
        // 数据清空时重置到顶部
        if (containerRef.value) {
          containerRef.value.scrollTop = 0
          scrollTop.value = 0
          savedScrollTop.value = 0
        }
      } else if (oldLength > 0 && newLength < oldLength) {
        // 数据减少时，检查当前滚动位置是否仍然有效
        const maxScrollTop = Math.max(0, totalHeight.value - containerHeight.value)
        if (scrollTop.value > maxScrollTop) {
          const newScrollTop = Math.max(0, maxScrollTop)
          if (containerRef.value) {
            containerRef.value.scrollTop = newScrollTop
            scrollTop.value = newScrollTop
            savedScrollTop.value = newScrollTop
          }
        }
      }
      // 数据增加时保持当前滚动位置，不做任何处理
    }
  }
)

// 监听items引用变化（完全不同的数组）
watch(
  () => props.items,
  (newItems, oldItems) => {
    // 如果是完全不同的数组引用，说明是新的数据集
    if (isActive.value && newItems !== oldItems && Array.isArray(newItems)) {
      // 只有在数据源完全改变时才重置滚动位置
      if (oldItems && oldItems.length > 0 && newItems.length > 0) {
        // 检查是否是相同的数据（通过第一个和最后一个元素的key）
        const oldFirstKey = oldItems[0] && getItemKey(oldItems[0])
        const newFirstKey = newItems[0] && getItemKey(newItems[0])

        if (oldFirstKey !== newFirstKey) {
          // 数据源完全不同，重置滚动位置
          if (containerRef.value) {
            containerRef.value.scrollTop = 0
            scrollTop.value = 0
            savedScrollTop.value = 0
          }
        }
      }
    }
  },
  { deep: false }
)

// 性能统计
const performanceStats = computed(() => ({
  renderedItems: visibleItems.value.length,
  totalItems: props.items.length,
  scrollTop: scrollTop.value,
  visibleRange: {
    start: visibleRange.value.startIndex,
    end: visibleRange.value.endIndex
  }
}))

// 暴露方法给父组件
defineExpose({
  handleDragStart,
  handleDragEnd,
  scrollToTop: () => {
    if (containerRef.value) {
      containerRef.value.scrollTop = 0
      scrollTop.value = 0
      savedScrollTop.value = 0
    }
  },
  scrollToIndex: (index: number) => {
    if (containerRef.value) {
      const row = Math.floor(index / columnsCount.value)
      const targetScrollTop = row * (props.itemHeight + props.gap)
      containerRef.value.scrollTop = targetScrollTop
      scrollTop.value = targetScrollTop
      savedScrollTop.value = targetScrollTop
    }
  },
  // 保存当前滚动位置
  saveScrollPosition: () => {
    savedScrollTop.value = scrollTop.value
  },
  // 恢复滚动位置
  restoreScrollPosition: () => {
    if (containerRef.value && savedScrollTop.value > 0) {
      containerRef.value.scrollTop = savedScrollTop.value
      scrollTop.value = savedScrollTop.value
    }
  },
  // 获取当前滚动位置
  getScrollPosition: () => scrollTop.value,
  // 设置滚动位置
  setScrollPosition: (position: number) => {
    if (containerRef.value) {
      containerRef.value.scrollTop = position
      scrollTop.value = position
      savedScrollTop.value = position
    }
  },
  getStats: () => performanceStats.value
})
</script>

<style scoped>
.virtual-grid-container {
  width: 100%;
  height: 100%;
  overflow: auto;
  position: relative;
}

.virtual-scroll-area {
  position: relative;
  width: 100%;
}

.virtual-content {
  position: relative;
  width: 100%;
}

.virtual-grid {
  width: 100%;
}

.virtual-grid-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  transition:
    opacity 0.2s,
    transform 0.2s;
}

/* 拖拽样式 */
.virtual-grid-item.dragging {
  opacity: 0.5;
  transform: scale(1.05);
  z-index: 1000;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
}

.virtual-grid-item.drag-over {
  border: 2px dashed #4a90e2;
  background-color: rgba(74, 144, 226, 0.1);
}

/* .virtual-grid-item[draggable='true'] {
  cursor: move;
} */

.virtual-grid-item[draggable='true']:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

/* 优化滚动性能 */
.virtual-grid-container {
  /* 启用硬件加速 */
  transform: translateZ(0);
  /* 优化滚动 */
  -webkit-overflow-scrolling: touch;
  /* 减少重绘 */
  will-change: scroll-position;
}

/* 在大屏幕上禁用某些效果以提升性能 */
@media (min-width: 1280px) {
  .virtual-grid-container {
    /* 在大屏幕上进一步优化 */
    contain: layout style paint;
  }
}
</style>
