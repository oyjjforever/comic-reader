<template>
  <div v-if="showMonitor" class="performance-monitor">
    <div class="monitor-header">
      <h4>性能监控</h4>
      <button @click="toggleMonitor" class="toggle-btn">{{ isExpanded ? '收起' : '展开' }}</button>
    </div>

    <div v-if="isExpanded" class="monitor-content">
      <div class="metric-item">
        <span class="metric-label">渲染项目数:</span>
        <span class="metric-value">{{ stats.renderedItems }}</span>
      </div>

      <div class="metric-item">
        <span class="metric-label">总项目数:</span>
        <span class="metric-value">{{ stats.totalItems }}</span>
      </div>

      <div class="metric-item">
        <span class="metric-label">内存使用:</span>
        <span class="metric-value">{{ memoryUsage }}MB</span>
      </div>

      <div class="metric-item">
        <span class="metric-label">FPS:</span>
        <span class="metric-value" :class="{ 'low-fps': fps < 30 }">{{ fps }}</span>
      </div>

      <div class="metric-item">
        <span class="metric-label">滚动位置:</span>
        <span class="metric-value">{{ stats.scrollTop }}px</span>
      </div>

      <div class="metric-item">
        <span class="metric-label">可见范围:</span>
        <span class="metric-value"
          >{{ stats.visibleRange.start }} - {{ stats.visibleRange.end }}</span
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface PerformanceStats {
  renderedItems: number
  totalItems: number
  scrollTop: number
  visibleRange: {
    start: number
    end: number
  }
}

interface Props {
  stats: PerformanceStats
  enabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  enabled: true
})

const showMonitor = ref(props.enabled)
const isExpanded = ref(false)
const fps = ref(60)
const memoryUsage = ref(0)

let frameCount = 0
let lastTime = performance.now()
let animationId: number

// 计算FPS
const calculateFPS = () => {
  frameCount++
  const currentTime = performance.now()

  if (currentTime - lastTime >= 1000) {
    fps.value = Math.round((frameCount * 1000) / (currentTime - lastTime))
    frameCount = 0
    lastTime = currentTime
  }

  animationId = requestAnimationFrame(calculateFPS)
}

// 获取内存使用情况
const updateMemoryUsage = () => {
  if (performance.memory) {
    memoryUsage.value = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)
  }
}

const toggleMonitor = () => {
  isExpanded.value = !isExpanded.value
}

onMounted(() => {
  if (props.enabled) {
    calculateFPS()
    setInterval(updateMemoryUsage, 1000)
  }
})

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
})

// 暴露控制方法
defineExpose({
  show: () => {
    showMonitor.value = true
  },
  hide: () => {
    showMonitor.value = false
  },
  toggle: () => {
    showMonitor.value = !showMonitor.value
  }
})
</script>

<style scoped>
.performance-monitor {
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 12px;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  z-index: 9999;
  min-width: 200px;
  backdrop-filter: blur(4px);
}

.monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.monitor-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: bold;
}

.toggle-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 10px;
}

.toggle-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.monitor-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.metric-label {
  color: #ccc;
}

.metric-value {
  color: #0f0;
  font-weight: bold;
}

.low-fps {
  color: #f00 !important;
}

/* 在小屏幕上隐藏监控器 */
@media (max-width: 768px) {
  .performance-monitor {
    display: none;
  }
}
</style>
