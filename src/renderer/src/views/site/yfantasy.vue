<template>
  <div class="yfantasy-view">
    <!-- 列表 -->
    <div v-if="loading && !items.length" class="state-tip">加载中...</div>
    <div v-else-if="error" class="state-tip state-tip--error">{{ error }}</div>
    <div v-else-if="!items.length" class="state-tip">暂无数据</div>
    <ResponsiveVirtualGrid
      v-else
      ref="virtualGridRef"
      :items="items"
      :min-item-width="160"
      :max-item-width="220"
      :aspect-ratio="0.6"
      :gap="16"
      key-field="id"
      mode="lazy"
    >
      <template #default="{ item }">
        <div
          class="artwork-item"
          :class="{ 'artwork-item--downloaded': item.downloaded }"
          @click="openDetail(item)"
        >
          <n-image
            v-if="getCover(item)"
            :src="getCover(item)"
            :preview-disabled="true"
            class="cover"
          >
            <template #error>
              <img :src="errorImg" class="cover-img" />
            </template>
          </n-image>
          <img v-else :src="errorImg" class="cover-img" />
          <!-- 悬浮操作 -->
          <div class="hover-ops">
            <button @click.stop="openDetail(item)">
              <n-icon :component="Play24Filled" size="24" />
            </button>
            <button @click.stop="onQuickDownload(item)">
              <n-icon :component="CloudDownload" size="24" />
            </button>
          </div>
          <!-- 标题 -->
          <div class="artwork-title">{{ item.title }}</div>
        </div>
      </template>
    </ResponsiveVirtualGrid>

    <!-- 详情/播放模态层 -->
    <div v-if="detailVisible" class="overlay" @click.self="closeDetail">
      <div class="modal">
        <div class="modal__header">
          <span class="modal__title" :title="currentTitle">{{ currentTitle }}</span>
          <div class="modal__close" @click="closeDetail">×</div>
        </div>
        <div class="modal__body">
          <div v-if="detailLoading" class="state-tip">加载详情中...</div>
          <div v-else-if="detailError" class="state-tip state-tip--error">{{ detailError }}</div>
          <template v-else-if="session">
            <div class="player">
              <video ref="playerRef" :src="currentPlayUrl" controls autoplay @error="onPlayError" />
            </div>
            <div class="segments">
              <div class="segments__list">
                <div
                  v-for="seg in segments"
                  :key="seg.segmentIndex"
                  class="seg"
                  :class="{ 'seg--active': activeSegIndex === seg.segmentIndex }"
                  @click="playSegment(seg)"
                >
                  第{{ seg.segmentIndex + 1 }}段
                </div>
                <n-button
                  class="segments__download"
                  type="primary"
                  size="small"
                  :disabled="!session"
                  @click="onDownload"
                >
                  下载
                </n-button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup name="yfantasy">
import { ref, computed } from 'vue'
import { NButton, NImage, useMessage } from 'naive-ui'
import { Play24Filled } from '@vicons/fluent'
import { CloudDownload } from '@vicons/ionicons5'
import ResponsiveVirtualGrid from '@renderer/components/responsive-virtual-grid.vue'
import errorImg from '@renderer/assets/error.png'
import yfantasy from '@renderer/plugins/site-utils/yfantasy.js'

const message = useMessage()

const items = ref<any[]>([])
const loading = ref(false)
const error = ref('')
const virtualGridRef = ref()

// 详情状态
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const session = ref<any>(null)
const currentTitle = ref('')
const activeSegIndex = ref<number>(0)
const playerRef = ref<HTMLVideoElement | null>(null)

const segments = computed(() => (session.value ? yfantasy.collectSegments(session.value) : []))
const currentPlayUrl = computed(() => {
  const seg = segments.value.find((s) => s.segmentIndex === activeSegIndex.value)
  return seg?.url || ''
})

function getCover(item: any) {
  return item?.publicSegment?.imageUrl || ''
}

async function loadList() {
  loading.value = true
  error.value = ''
  try {
    const list = await yfantasy.fetchFeed(100)
    list.sort(
      (a: any, b: any) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )
    items.value = list.map((it: any) => ({
      ...it,
      downloaded: yfantasy.isLocalDownloaded(it.title)
    }))
  } catch (e: any) {
    error.value = e?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

// 标记某个作品为已下载（按标题匹配）
function markDownloaded(title: string) {
  const it = items.value.find((i: any) => i.title === title)
  if (it) it.downloaded = true
}

async function openDetail(item: any) {
  detailVisible.value = true
  detailLoading.value = true
  detailError.value = ''
  session.value = null
  currentTitle.value = item.title
  activeSegIndex.value = item?.publicSegment?.segmentIndex ?? 0
  try {
    session.value = await yfantasy.fetchSession(item.id)
    currentTitle.value = session.value?.title || item.title
    activeSegIndex.value = session.value?.currentSegment?.segmentIndex ?? 0
  } catch (e: any) {
    detailError.value = e?.message || '获取详情失败'
  } finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  detailVisible.value = false
  session.value = null
  const v = playerRef.value
  if (v) {
    v.pause()
    v.removeAttribute('src')
  }
}

function playSegment(seg: any) {
  activeSegIndex.value = seg.segmentIndex
}

function onPlayError() {
  message.warning('该片段无法播放，可能需要解锁')
}

async function onDownload() {
  if (!session.value) return
  try {
    await yfantasy.downloadVideo(currentTitle.value, session.value)
    markDownloaded(currentTitle.value)
    message.success('已加入下载队列')
  } catch (e: any) {
    message.error(e?.message || '下载失败')
  }
}

// 直接从卡片下载：先获取 session 再加入队列
async function onQuickDownload(item: any) {
  try {
    const sess = await yfantasy.fetchSession(item.id)
    const title = sess?.title || item.title
    await yfantasy.downloadVideo(title, sess)
    item.downloaded = true
    message.success('已加入下载队列')
  } catch (e: any) {
    message.error(e?.message || '下载失败')
  }
}

loadList()
</script>

<style lang="scss" scoped>
.yfantasy-view {
  height: 100%;
  width: 100%;
}

.state-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #888;
  font-size: 14px;

  &--error {
    color: #ef4444;
  }
}

.artwork-item {
  height: 100%;
  border-radius: 8px;
  background: #f5f5f5;
  overflow: hidden;
  transition: box-shadow 0.2s ease;
  display: flex;
  flex-direction: column;
  position: relative;
  cursor: pointer;

  &:hover {
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);

    .hover-ops {
      opacity: 1;
    }
  }

  .cover {
    width: 100%;
    flex: 1;
    min-height: 0;
    :deep(img) {
      height: 100%;
      width: 100%;
      object-fit: cover !important;
    }
  }

  .cover-img {
    height: 100%;
    width: 100%;
    object-fit: cover;
  }

  &--downloaded {
    .cover,
    .cover-img {
      opacity: 0.5;
    }
  }

  .hover-ops {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 8px;
    background: #000000ad;
    color: #fff;
    transition: opacity 0.25s ease;
    z-index: 5;

    button {
      transition-duration: 0.3s;
      color: #fff;

      &:hover {
        transition-duration: 0.3s;
        transform: scale(1.2);
      }
    }
  }

  .artwork-title {
    position: absolute;
    bottom: 0;
    width: 100%;
    font-size: 13px;
    text-align: center;
    font-weight: 700;
    padding: 4px;
    color: #fff;
    background: #0000004d;
    backdrop-filter: blur(10px);
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
    z-index: 4;
  }
}

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.modal {
  width: min(900px, 100%);
  max-height: 90vh;
  background: #fff;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid #eee;
  }

  &__title {
    font-size: 16px;
    font-weight: 600;
    color: #1a1a1a;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__close {
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
    color: #999;
    padding: 0 6px;

    &:hover {
      color: #333;
    }
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 18px;
  }
}

.player {
  width: 100%;
  background: #000;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 14px;
  display: flex;
  justify-content: center;

  video {
    max-width: 100%;
    max-height: 55vh;
  }
}

.segments {
  &__list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  &__download {
    margin-left: auto;
  }
}

.seg {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid #ddd;
  cursor: pointer;
  font-size: 13px;
  color: #333;
  transition: all 0.2s ease;

  &:hover {
    border-color: #60a5fa;
    background: #f5f9ff;
  }

  &--active {
    border-color: #60a5fa;
    background: #60a5fa;
    color: #fff;
  }

  &__lock {
    font-size: 11px;
    padding: 0 5px;
    border-radius: 4px;
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }
}
</style>
