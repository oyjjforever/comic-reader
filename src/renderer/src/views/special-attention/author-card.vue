<template>
  <div class="author-card" :class="{ 'has-new-artwork': hasNewArtwork }">
    <!-- 作者头部信息 -->
    <div class="author-header">
      <img class="author-avatar" :src="siteIcon(item.source)" />
      <div class="author-info">
        <h3 class="author-name">{{ item.authorName || item.authorId }}({{ item.authorId }})</h3>
        <p class="works-count">{{ page.total ? page.total : '--' }} 个作品</p>
      </div>
      <div
        class="author-move"
        draggable="true"
        @dragstart="handleDragStart"
        @dragend="handleDragEnd"
      >
        <n-icon :component="ArrowMove24Regular" size="16" />
      </div>
    </div>
    <!-- 作品预览区域 -->
    <div class="works-section">
      <div class="works-container">
        <!-- Loading遮罩 -->
        <div v-if="grid.loading" class="loading-overlay">
          <n-spin size="medium" />
          <span class="loading-text">作品获取中...</span>
        </div>
        <n-carousel
          class="artwork-carousel"
          :slides-per-view="6"
          :space-between="10"
          :loop="false"
          :show-dots="false"
          :show-arrows="false"
          :style="{ opacity: grid.loading ? 0.3 : 1 }"
        >
          <div
            v-for="row in grid.rows"
            :key="row.artworkId"
            class="artwork-item"
            :class="{ 'artwork-item--downloaded': row.downloaded }"
          >
            <!-- <img :src="row.cover" /> -->
            <n-image v-if="row.artworkId" :src="row.cover">
              <template #error>
                <img :src="errorImg" />
              </template>
            </n-image>
            <n-image v-else :src="errorImg" />
            <div v-if="row.artworkId" class="hover-ops">
              <div class="artwork-item__pages">
                <n-icon :component="SlideMultiple24Regular" size="12" />{{ row.pages }}
              </div>
              <button size="small" @click="onDownload(row)">
                <n-icon :component="CloudDownload" size="24" />
              </button>
              <button size="small" @click="onPreview(row)">
                <n-icon :component="InformationCircle" size="24" />
              </button>
            </div>
            <!-- <div class="artwork-title">{{ row.title || '作品' }}</div> -->
          </div>
        </n-carousel>
      </div>
    </div>
    <!-- 操作按钮区域 -->
    <div class="action-buttons">
      <div class="button-group">
        <button @click="$emit('remove', item.id)" class="action-button unfollow-button">
          取消关注
        </button>
        <button @click="onDownloadAll" class="action-button download-all-button">全部下载</button>
        <button @click="$emit('set-tag', item)" class="action-button tag-button">设置标签</button>
      </div>
      <div class="pagination-buttons">
        <div class="pagination-info">
          {{ page.index + 1 }} /
          {{ page.total ? Math.ceil(page.total / page.size) : '--' }}
        </div>
        <button @click="prevPage" class="pagination-button">
          <n-icon :component="ChevronLeft24Filled" size="12" />
        </button>
        <button @click="nextPage" class="pagination-button">
          <n-icon :component="ChevronRight24Filled" size="12" />
        </button>
      </div>
    </div>
    <preview-dialog
      v-if="previewer.show"
      :dialog="previewer"
      @download="onDownload"
    ></preview-dialog>
  </div>
</template>

<script lang="ts" setup>
import { queue } from '@renderer/plugins/store/downloadQueue'
import { useNewArtworkDetectorStore } from '@renderer/plugins/store/newArtworkDetector'
import { getDefaultDownloadPath } from '../site/utils'
import previewDialog from './preview-dialog.vue'
import errorImg from '@renderer/assets/error.png'
import siteUtils from './site-utils.js'
import {
  SlideMultiple24Regular,
  ArrowUp24Regular,
  ArrowDown24Regular,
  ChevronLeft24Filled,
  ChevronRight24Filled,
  ArrowMove24Regular
} from '@vicons/fluent'
import { CloudDownload, InformationCircle } from '@vicons/ionicons5'
import { reactive, computed, onMounted, ref } from 'vue'
const props = defineProps<{
  item: { type: Object; required: true }
}>()

// 拖动事件处理
const emit = defineEmits(['dragstart', 'dragend', 'set-tag'])

// 使用新作品检测store
const newArtworkDetector = useNewArtworkDetectorStore()

function handleDragStart(event: DragEvent) {
  emit('dragstart', event)
}

function handleDragEnd(event: DragEvent) {
  emit('dragend', event)
}
function siteIcon(site) {
  return siteUtils.getSiteIcon(site)
}
const page = reactive({
  total: 0,
  index: 0,
  size: 6
})
const grid = reactive({
  allRows: [],
  rows: [],
  loading: false
})

// 检查是否有新作品
const hasNewArtwork = computed(() => {
  return newArtworkDetector.hasNewArtwork(props.item.source, props.item.authorId)
})

onMounted(async () => {
  await fetchData()
  await pagingImage()
})
async function fetchData() {
  const { source, authorId } = props.item
  const data = await siteUtils.fetchArtworks(source, authorId)
  if (!data) {
    grid.allRows = []
    page.total = null
  } else {
    grid.allRows = data
    page.total = data.length
  }
}
async function pagingImage() {
  grid.loading = true
  const { source, authorName, authorId } = props.item
  grid.rows = await siteUtils.pagingImage(source, authorName, authorId, grid, page)
  grid.loading = false
}
async function onDownload(row) {
  await siteUtils.downloadArtwork(props.item.source, row, props.item)
  row.downloaded = true
}
async function onDownloadAll() {
  await siteUtils.downloadAll(props.item.source, props.item)
}
function prevPage() {
  if (page.index > 0) page.index -= 1
  pagingImage()
}
function nextPage() {
  if (!page.total || (page.index + 1) * page.size < page.total) page.index += 1
  pagingImage()
}

const previewer = reactive({
  show: false,
  data: {}
})
function onPreview(row) {
  row.source = props.item.source
  previewer.data = row
  previewer.show = true
}
</script>

<style lang="scss">
.author-card {
  width: 100%;
  height: 100%;
  background-color: white;
  border-radius: 0.75rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  border: 1px solid #e5e7eb;
  transition: box-shadow 0.2s;
  display: flex;
  flex-direction: column;

  &:hover {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  }
}

// 作者头部信息
.author-header {
  padding: 4px;
  border-bottom: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.author-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.author-info {
  flex: 1;
  min-width: 0; // 允许文本截断
}

.author-name {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.author-move {
  cursor: move;
  color: #6b7280;
  padding-bottom: 20px;
}
.works-count {
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0;
}

// 作品预览区域
.works-section {
  padding: 4px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; // 允许内容区域收缩
}

.works-container {
  position: relative;
  flex: 1;
  min-height: 0; // 允许内容区域收缩
}

.works-list {
  display: grid;
  grid-template-columns: repeat(5, 100px);
  gap: 0.5rem;
  padding-bottom: 0.5rem;
  min-height: 0; // 允许内容区域收缩

  // 隐藏滚动条
  &::-webkit-scrollbar {
    display: none;
  }

  -ms-overflow-style: none;
  scrollbar-width: none;
}

.artwork-carousel {
  padding: 0 10px;
}
.artwork-item {
  height: 100%;
  border-radius: 8px;
  background: #f5f5f5;
  overflow: hidden;
  transition: box-shadow 0.2s ease;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
  &:hover {
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
    .hover-ops {
      opacity: 1;
    }
  }
  .n-image {
    width: 100%;
    height: 100%;
  }
  img {
    height: 100%;
    width: 100%;
    object-fit: cover !important;
  }
  &--downloaded img {
    opacity: 0.5;
  }
  &__pages {
    width: fit-content;
    display: flex;
    justify-content: space-around;
    align-items: center;
    gap: 2px;
    position: absolute;
    top: 5px;
    right: 5px;
    color: #fff;
    background: #00000071;
    backdrop-filter: blur(10px);
    border-radius: 5px;
    font-size: 12px;
    padding: 0px 4px;
  }
  /* 悬浮操作栏 */
  .hover-ops {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    display: flex;
    flex-direction: column;
    padding-bottom: 10%;
    gap: 5px;
    justify-content: flex-end;
    align-items: center;
    background: #000000ad;
    color: #fff;
    transition: opacity 0.25s ease;
    z-index: 9999;
    button {
      transition-duration: 0.3s;
      &:hover {
        transition-duration: 0.3s;
        transform: scale(1.2);
      }
    }
  }
  .artwork-title {
    position: absolute;
    bottom: 0px;
    width: 100%;
    font-size: 14px;
    text-align: center;
    font-weight: 700;
    padding: 5px;
    color: #fff;
    background: #0000004d;
    backdrop-filter: blur(10px);
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
  }
}

.pagination-buttons {
  display: flex;
  gap: 0.25rem;
  .pagination-info {
    color: #6b7280;
    margin-right: 10px;
  }
}

.pagination-button {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #00000029; //#f3f4f6;
  cursor: pointer;
  font-size: 0.75rem;
  transition-duration: 0.3s;
  &:hover {
    background-color: #e5e7eb;
    transition-duration: 0.3s;
  }
}

// 操作按钮区域
.action-buttons {
  padding: 0.5rem;
  background-color: #f9fafb;
  display: flex;
  justify-content: space-between;
  border-top: 1px solid #f3f4f6;
  flex-shrink: 0;
  .button-group {
    display: flex;
    gap: 20px;
  }
}

.action-button {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.2s;
}

.unfollow-button {
  color: #ef4444;

  &:hover {
    color: #dc2626;
  }
}

.download-all-button {
  color: #10b981;

  &:hover {
    color: #059669;
  }
}

.tag-button {
  color: #8b5cf6;

  &:hover {
    color: #7c3aed;
  }
}

.drag-button {
  color: #3b82f6;
  cursor: move;

  &:hover {
    color: #2563eb;
  }
}

// 新作品提示样式
.has-new-artwork {
  border: 2px solid #ef4444;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.3);
}

// Loading遮罩样式
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.8);
  z-index: 10;
  border-radius: 0.5rem;

  .loading-text {
    margin-top: 12px;
    color: #6b7280;
    font-size: 0.875rem;
  }
}
</style>
