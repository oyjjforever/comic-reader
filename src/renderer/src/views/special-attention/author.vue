<template>
  <n-card title="卡片插槽示例">
    <template #header>
      <div class="title">
        <span class="source-badge">{{ item.source }}</span>
        <span class="author-name">{{ item.authorName || item.authorId }}</span>
        <span class="author-id">({{ item.authorId }})</span>
      </div>
    </template>
    <template #header-extra>
      <div class="header-actions">
        <n-button size="small" type="error" @click="emit('remove', item.id)">取消关注</n-button>
        <n-button size="small" @click="emit('get-latest', item)">增量更新</n-button>
        <n-button size="small" @click="emit('local-check', item)" tertiary>本地检测</n-button>
      </div>
    </template>
    <!-- 排序模式左侧上下箭头 -->
    <div class="sort-controls" v-if="sortMode">
      <n-button size="tiny" tertiary @click="emit('move-up', item)">上箭头</n-button>
      <n-button size="tiny" tertiary @click="emit('move-down', item)">上箭头</n-button>
    </div>
    <!-- 作品分页 -->
    <n-carousel
      :slides-per-view="5"
      :space-between="20"
      :loop="false"
      :show-dots="false"
      show-arrow
    >
      <div
        v-for="w in pagedWorks"
        :key="w.artworkId"
        class="artwork-item"
        :class="{ 'artwork-item--downloaded': w.downloaded }"
      >
        <div class="artwork-item__image">
          <img src="https://naive-ui.oss-cn-beijing.aliyuncs.com/carousel-img/carousel1.jpeg" />
          <div class="hover-ops">
            <n-button-group size="small">
              <n-button size="small">下载</n-button>
              <n-button size="small">预览</n-button>
              <n-button size="small">忽略</n-button>
            </n-button-group>
          </div>
        </div>
        <div class="artwork-title">{{ w.title || '作品' }}</div>
      </div>
      <!-- <template #arrow="{ prev, next }">
        <div class="custom-arrow">
          <button type="button" class="custom-arrow--left" @click="prevPage">
            <n-icon><ArrowBack /></n-icon>
          </button>
          <button type="button" class="custom-arrow--right" @click="nextPage">
            <n-icon><ArrowForward /></n-icon>
          </button>
        </div>
      </template> -->
    </n-carousel>
  </n-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton } from 'naive-ui'
const { pixiv, file } = window as any
// 运行时 props 定义
const props = defineProps({
  item: { type: Object, required: true },
  sortMode: { type: Boolean, default: false },
  pageSize: { type: Number, default: 5 }
})

// 事件定义（占位）
const emit = defineEmits(['move-up', 'move-down', 'get-latest', 'local-check', 'remove'])

const pageIndex = ref(0)
const grid = reactive({
  rows: []
})
watch(
  () => props.item && props.item._latest,
  () => {
    pageIndex.value = 0
  }
)
onMounted(async () => {
  grid.rows = await fetchPixiv(props.item.authorId)
  console.log('grid.rows', grid.rows)
})
const pagedWorks = computed(() => {
  const list = (props.item && props.item._latest) || []
  const start = pageIndex.value * props.pageSize
  return list.slice(start, start + props.pageSize)
})
async function fetchPixiv(userId) {
  // 获取作品集
  const profile = await pixiv.getArtworksByUserId(userId)
  console.log('🚀 ~ fetchPixiv ~ profile:', profile)
  // 作品ID为递增，使用 latest_work_id 判断下载状态：
  // id > latest_work_id => 未下载；否则 => 已下载
  const latestWorkId =
    props.item && props.item.latestWorkId ? Number(props.item.latestWorkId) : null
  const latestList = profile.illusts
    .map((id) => {
      const info = profile.illusts[String(id)] || {}
      const downloaded = latestWorkId != null ? id <= latestWorkId : false
      return {
        artworkId: id,
        title: info.title || '',
        downloaded
      }
    })
    .reverse() // 显示时按最新在前
}
function prevPage() {
  if (pageIndex.value > 0) pageIndex.value -= 1
}
function nextPage() {
  const total = (props.item && props.item._latest && props.item._latest.length) || 0
  if ((pageIndex.value + 1) * props.pageSize < total) pageIndex.value += 1
}
</script>

<style scoped lang="scss">
.author-card {
  display: flex;
  gap: 8px;
  justify-content: center;
  align-items: center;
}

.sort-controls {
  border-radius: 8px;
  background: #f2f2f2;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 8px;
}
.title {
  display: flex;
  gap: 8px;
  align-items: center;
  font-weight: 600;
}
.source-badge {
  display: inline-block;
  font-size: 12px;
  color: #1976d2;
  background: #e3f2fd;
  border-radius: 4px;
  padding: 2px 6px;
}
.author-id {
  color: #888;
  font-size: 12px;
}

.artwork-item {
  height: 100%;
  border-radius: 8px;
  background: #f5f5f5;
  overflow: hidden;
  transition: box-shadow 0.2s ease;
  display: flex;
  flex-direction: column;
  &:hover {
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
    .hover-ops {
      opacity: 1;
    }
  }
  &--downloaded img {
    opacity: 0.5;
  }
  &__image {
    position: relative;
    img {
      max-height: 100%;
    }
    /* 悬浮操作栏 */
    .hover-ops {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      opacity: 0;
      display: flex;
      justify-content: space-around;
      padding: 6px 8px;
      background: rgba(224, 223, 223, 0.75);
      transition: opacity 0.25s ease;
    }
  }
  .artwork-title {
    width: 100%;
    font-size: 14px;
    text-align: center;
    font-weight: 700;
    padding: 5px;
    color: #3c3c3c;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }
}
</style>
