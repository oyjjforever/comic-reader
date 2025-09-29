<template>
  <div 
    ref="containerRef" 
    class="virtual-grid-container"
    @scroll="handleScroll"
  >
    <!-- 虚拟滚动区域 - 用于维持正确的滚动条高度 -->
    <div 
      class="virtual-scroll-area"
      :style="{ height: totalHeight + 'px' }"
    >
      <!-- 实际渲染的内容区域 -->
      <div 
        class="virtual-content"
        :style="contentStyle"
      >
        <div 
          class="virtual-grid"
          :style="gridStyle"
        >
          <div
            v-for="item in visibleItems"
            :key="getItemKey(item.data)"
            class="virtual-grid-item"
            :style="getItemStyle(item)"
          >
            <slot :item="item.data" :index="item.index" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { throttle, debounce } from 'lodash'

interface VirtualGridProps {
  items: any[]
  itemWidth: number
  itemHeight: number
  gap: number
  keyField?: string
  overscan?: number // 预渲染的额外行数
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
  overscan: 2
})

const containerRef = ref<HTMLElement>()
const scrollTop = ref(0)
const containerWidth = ref(0)
const containerHeight = ref(0)

// 计算网格布局参数
const columnsCount = computed(() => {
  if (containerWidth.value === 0) return 1
  return Math.floor((containerWidth.value + props.gap) / (props.itemWidth + props.gap))
})

const rowsCount = computed(() => {
  return Math.ceil(props.items.length / columnsCount.value)
})

const totalHeight = computed(() => {
  return rowsCount.value * (props.itemHeight + props.gap) - props.gap
})

// 计算可见区域
const visibleRange = computed(() => {
  const itemHeightWithGap = props.itemHeight + props.gap
  const startRow = Math.max(0, Math.floor(scrollTop.value / itemHeightWithGap) - props.overscan)
  const endRow = Math.min(
    rowsCount.value - 1,
    Math.ceil((scrollTop.value + containerHeight.value) / itemHeightWithGap) + props.overscan
  )
  
  return {
    startRow,
    endRow,
    startIndex: startRow * columnsCount.value,
    endIndex: Math.min(props.items.length - 1, (endRow + 1) * columnsCount.value - 1)
  }
})

// 计算可见的项目
const visibleItems = computed((): VirtualItem[] => {
  const { startIndex, endIndex } = visibleRange.value
  const items: VirtualItem[] = []
  
  for (let i = startIndex; i <= endIndex && i < props.items.length; i++) {
    const row = Math.floor(i / columnsCount.value)
    const col = i % columnsCount.value
    const x = col * (props.itemWidth + props.gap)
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
const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(200px, 1fr))`,
  gap: `${props.gap}px`,
  justifyContent: 'start'
}))

// 获取项目的唯一键
const getItemKey = (item: any) => {
  return props.keyField ? item[props.keyField] : item
}

// 获取项目样式（用于绝对定位模式，当前使用grid布局）
const getItemStyle = (item: VirtualItem) => ({
  // 在grid模式下不需要额外样式
})

// 滚动处理
const handleScroll = throttle((event: Event) => {
  const target = event.target as HTMLElement
  scrollTop.value = target.scrollTop
}, 16) // 约60fps

// 容器尺寸监听
const updateContainerSize = debounce(() => {
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect()
    containerWidth.value = rect.width
    containerHeight.value = rect.height
  }
}, 100)

// ResizeObserver
let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  await nextTick()
  updateContainerSize()
  
  // 监听容器尺寸变化
  if (containerRef.value && window.ResizeObserver) {
    resizeObserver = new ResizeObserver(updateContainerSize)
    resizeObserver.observe(containerRef.value)
  }
  
  // 监听窗口尺寸变化（备用方案）
  window.addEventListener('resize', updateContainerSize)
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  window.removeEventListener('resize', updateContainerSize)
})

// 监听items变化，重置滚动位置
watch(() => props.items.length, () => {
  if (containerRef.value) {
    containerRef.value.scrollTop = 0
    scrollTop.value = 0
  }
})

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
  scrollToTop: () => {
    if (containerRef.value) {
      containerRef.value.scrollTop = 0
      scrollTop.value = 0
    }
  },
  scrollToIndex: (index: number) => {
    if (containerRef.value) {
      const row = Math.floor(index / columnsCount.value)
      const targetScrollTop = row * (props.itemHeight + props.gap)
      containerRef.value.scrollTop = targetScrollTop
      scrollTop.value = targetScrollTop
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
  /* 项目样式由父组件通过slot控制 */
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