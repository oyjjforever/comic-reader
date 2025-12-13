<template>
  <virtual-grid
    ref="virtualGridRef"
    :items="items"
    :item-width="itemWidth"
    :item-height="itemHeight"
    :gap="gap"
    :key-field="keyField"
    :overscan="overscan"
    :draggable="draggable"
    :mode="mode"
    @scroll="$emit('scroll', $event)"
    @sort-change="handleSortChange"
  >
    <template #default="{ item, index }">
      <slot :item="item" :index="index" />
    </template>
  </virtual-grid>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import VirtualGrid from './virtual-grid.vue'
import { debounce } from 'lodash'

interface ResponsiveVirtualGridProps {
  items: any[]
  keyField?: string
  overscan?: number
  minItemWidth?: number
  maxItemWidth?: number
  aspectRatio?: number // 宽高比
  gap?: number
  draggable?: boolean // 是否启用拖拽排序
  mode?: 'virtual' | 'lazy' // 虚拟列表模式或懒加载模式
}

const props = withDefaults(defineProps<ResponsiveVirtualGridProps>(), {
  keyField: 'id',
  overscan: 2,
  minItemWidth: 160,
  maxItemWidth: 240,
  aspectRatio: 0.75, // 3:4 比例
  gap: 24,
  draggable: false,
  mode: 'virtual'
})

const emit = defineEmits<{
  scroll: [event: Event]
  'sort-change': [fromIndex: number, toIndex: number]
}>()

const virtualGridRef = ref()
const screenWidth = ref(window.innerWidth)

// 响应式计算项目尺寸
const itemWidth = computed(() => {
  // 根据屏幕宽度计算合适的项目宽度
  if (screenWidth.value < 640) {
    return Math.max(props.minItemWidth, 140)
  } else if (screenWidth.value < 768) {
    return Math.max(props.minItemWidth, 160)
  } else if (screenWidth.value < 1024) {
    return Math.max(props.minItemWidth, 180)
  } else if (screenWidth.value < 1280) {
    return Math.max(props.minItemWidth, 210)
  } else if (screenWidth.value < 1480) {
    return Math.max(props.minItemWidth, 220)
  } else if (screenWidth.value < 1680) {
    return Math.max(props.minItemWidth, 240)
  } else {
    return Math.min(props.maxItemWidth)
  }
})

const itemHeight = computed(() => {
  return Math.round(itemWidth.value / props.aspectRatio)
})

const gap = computed(() => {
  // 在小屏幕上减少间距
  if (screenWidth.value < 640) {
    return Math.max(12, props.gap - 12)
  } else if (screenWidth.value < 768) {
    return Math.max(16, props.gap - 8)
  }
  return props.gap
})

// 监听窗口大小变化
const handleResize = debounce(() => {
  screenWidth.value = window.innerWidth
}, 150)

function handleSortChange(fromIndex, toIndex) {
  emit('sort-change', fromIndex, toIndex)
}
onMounted(() => {
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

// 暴露方法
defineExpose({
  scrollToTop: () => {
    virtualGridRef.value?.scrollToTop()
  },
  scrollToIndex: (index: number) => {
    virtualGridRef.value?.scrollToIndex(index)
  },
  saveScrollPosition: () => {
    virtualGridRef.value?.saveScrollPosition()
  },
  restoreScrollPosition: () => {
    virtualGridRef.value?.restoreScrollPosition()
  },
  getScrollPosition: () => {
    return virtualGridRef.value?.getScrollPosition() || 0
  },
  setScrollPosition: (position: number) => {
    virtualGridRef.value?.setScrollPosition(position)
  },
  getStats: () => {
    return virtualGridRef.value?.getStats()
  },
  // 暴露 virtual-grid 的拖动方法
  handleDragStart: (index: number, event: DragEvent) => {
    virtualGridRef.value?.handleDragStart(index, event)
  },
  handleDragEnd: () => {
    virtualGridRef.value?.handleDragEnd()
  }
})
</script>
