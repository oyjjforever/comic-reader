<template>
  <div class="actor-video-container">
    <!-- 左侧演员列表 -->
    <div class="actor-sidebar">
      <div class="actor-sidebar__header">
        <n-input v-model:value="keyword" placeholder="搜索演员..." clearable size="small">
          <template #prefix>
            <n-icon :component="Search24Regular" />
          </template>
        </n-input>
      </div>
      <div class="actor-sidebar__body">
        <div class="actor-list">
          <div
            v-for="item in filteredActresses"
            :key="item.slug"
            class="actor-item"
            :class="{ 'actor-item--active': currentSlug === item.slug }"
            @click="onSelectActress(item)"
          >
            <span class="actor-item__name" :title="item.name">{{ item.name }}</span>
          </div>
          <n-empty
            v-if="!filteredActresses.length && !actressLoading"
            description="暂无演员数据"
            style="margin-top: 40px"
          />
        </div>
      </div>
    </div>

    <!-- 右侧作品列表 -->
    <div class="video-pane">
      <div class="video-pane__header">
        <div class="video-pane__title">
          <template v-if="currentActress"> {{ currentActress.name }} 的作品 </template>
          <template v-else>请选择左侧演员</template>
        </div>
        <div class="video-pane__actions">
          <n-select
            v-model:value="sort"
            :options="sortOptions"
            size="small"
            style="width: 120px"
            @update:value="reloadVideos"
          />
          <n-button size="small" :disabled="!currentSlug" @click="reloadVideos">刷新</n-button>
        </div>
      </div>

      <div class="video-pane__body">
        <n-spin :show="videoLoading && videos.length === 0">
          <template v-if="currentSlug">
            <responsive-virtual-grid
              v-if="videos.length"
              ref="videoListRef"
              :items="videos"
              key-field="url"
              :overscan="3"
              :min-item-width="200"
              :max-item-width="280"
              :aspect-ratio="0.8"
              :gap="12"
              class="video-virtual-grid"
              @scroll="onVideoScroll"
            >
              <template #default="{ item }">
                <div class="video-card" @contextmenu.prevent>
                  <div class="video-card__cover">
                    <img
                      v-if="item.coverUrl"
                      :src="getCoverSrc(item)"
                      referrerpolicy="no-referrer"
                      @error="onVideoCoverError(item, $event)"
                    />
                    <div v-else class="video-card__cover-placeholder">
                      <n-icon :component="VideoClipMultiple24Regular" size="28" color="#cbd5e1" />
                    </div>
                    <div
                      v-if="item.dvdId"
                      class="video-card__badge video-card__badge--left"
                      @click.stop="copyText(item.dvdId)"
                    >
                      {{ item.dvdId }}
                    </div>
                    <div
                      v-if="item.isUncensored"
                      class="video-card__badge video-card__badge--right"
                    >
                      无码
                    </div>
                  </div>
                  <div class="video-card__info">
                    <div class="video-card__title" :title="item.title">{{ item.title }}</div>
                    <div class="video-card__actions">
                      <n-button
                        size="tiny"
                        secondary
                        :loading="item._ptLoading"
                        @click="openBtDialog(item)"
                      >
                        <template #icon>
                          <n-icon :component="CloudDownload" />
                        </template>
                        BT
                      </n-button>
                      <n-button size="tiny" secondary @click="openVideo(item)">
                        <template #icon>
                          <n-icon :component="Open24Regular" />
                        </template>
                      </n-button>
                    </div>
                  </div>
                </div>
              </template>
            </responsive-virtual-grid>
            <n-empty v-else-if="!videoLoading" description="暂无作品" style="margin-top: 60px" />
            <div v-if="videoLoading && videos.length > 0" class="load-more-tip">
              <n-spin size="small" /> 加载更多...
            </div>
            <div v-else-if="!hasMore && videos.length > 0" class="load-more-tip">没有更多了</div>
          </template>
          <n-empty v-else description="请选择左侧演员查看作品" style="margin-top: 60px" />
        </n-spin>
      </div>
    </div>

    <bt-links-dialog v-model:show="btDialog.show" :dvdId="btDialog.dvdId" :title="btDialog.title" />
  </div>
</template>

<script setup lang="ts" name="actorVideo">
import {
  Search24Regular,
  Person24Regular,
  Open24Regular,
  VideoClipMultiple24Regular
} from '@vicons/fluent'
import { CloudDownload } from '@vicons/ionicons5'
import ResponsiveVirtualGrid from '@renderer/components/responsive-virtual-grid.vue'
import BtLinksDialog from '@renderer/components/bt-links-dialog.vue'

interface Actress {
  name: string
  slug: string
  coverUrl: string
}
interface VideoItem {
  title: string
  href: string
  url: string
  coverUrl: string
  dvdId?: string
  isUncensored?: boolean
  _ptLoading?: boolean
  _retry?: number
}

const message = useMessage()

const actresses = ref<Actress[]>([])
const actressLoading = ref(false)
const keyword = ref('')

const filteredActresses = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return actresses.value
  return actresses.value.filter(
    (a) => a.name.toLowerCase().includes(kw) || a.slug.toLowerCase().includes(kw)
  )
})

const currentSlug = ref('')
const currentActress = computed(() => actresses.value.find((a) => a.slug === currentSlug.value))

const videos = ref<VideoItem[]>([])
const videoLoading = ref(false)
const page = ref(1)
const hasMore = ref(false)
const sort = ref('views')
const videoListRef = ref<any>(null)

const btDialog = reactive({
  show: false,
  dvdId: '',
  title: 'BT 下载链接'
})

const sortOptions = [
  { label: '播放量', value: 'views' },
  { label: '最新', value: 'released_at' },
  { label: '收藏', value: 'bookmarks' }
]

async function loadActresses() {
  actressLoading.value = true
  try {
    actresses.value = await window.missav.getActresses()
  } catch (e) {
    console.error(e)
    message.error('演员列表获取失败')
  } finally {
    actressLoading.value = false
  }
}

async function onSelectActress(item: Actress) {
  if (currentSlug.value === item.slug) return
  currentSlug.value = item.slug
  await reloadVideos()
}

function reloadVideos() {
  videos.value = []
  page.value = 1
  hasMore.value = false
  loadVideos()
}

async function loadVideos() {
  if (!currentSlug.value || videoLoading.value) return
  videoLoading.value = true
  try {
    const res = await window.missav.getVideos(currentSlug.value, page.value, sort.value)
    videos.value = videos.value.concat(res.list)
    hasMore.value = res.hasMore
  } catch (e) {
    console.error(e)
    message.error('作品列表获取失败')
    hasMore.value = false
  } finally {
    videoLoading.value = false
  }
}

function onVideoScroll(e: Event) {
  const target = e.target as HTMLElement
  if (!target) return
  const bottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 200
  if (bottom && hasMore.value && !videoLoading.value) {
    page.value += 1
    loadVideos()
  }
}

function openVideo(item: VideoItem) {
  window.open(item.url)
}

const MAX_COVER_RETRY = 3
const COVER_RETRY_DELAY = 800

function getCoverSrc(item: VideoItem) {
  const base = item.coverUrl
  if (!base) return base
  if (!item._retry) return base
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}_retry=${item._retry}`
}

function onCoverError(e: Event) {
  const img = e.target as HTMLImageElement
  if (img) img.style.display = 'none'
}

function onVideoCoverError(item: VideoItem, e: Event) {
  const img = e.target as HTMLImageElement
  const retry = item._retry || 0
  if (retry < MAX_COVER_RETRY) {
    setTimeout(() => {
      item._retry = retry + 1
    }, COVER_RETRY_DELAY)
  } else if (img?.parentElement) {
    img.parentElement.classList.add('cover-error')
  }
}

function openBtDialog(item: VideoItem) {
  btDialog.dvdId = item.dvdId
  btDialog.title = item.title || 'BT 下载链接'
  btDialog.show = true
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

onMounted(() => {
  loadActresses()
})
</script>

<style lang="scss" scoped>
.actor-video-container {
  display: flex;
  height: 100%;
  width: 100%;
  background: #fff;
  overflow: hidden;
}

/* 左侧演员列表 */
.actor-sidebar {
  width: 240px;
  min-width: 240px;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #eee;
  background: #fafafa;

  &__header {
    padding: 10px;
    border-bottom: 1px solid #eee;
  }

  &__body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
}

.actor-list {
  height: 100%;
  overflow-y: auto;
  scrollbar-gutter: stable;

  :deep(.n-spin-content) {
    height: 100%;
  }

  &__footer {
    padding: 8px 12px;
    font-size: 12px;
    color: #9ca3af;
    border-top: 1px solid #eee;
    text-align: center;
  }
}

.actor-virtual-list {
  height: 100%;
}

.actor-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #f0f0f0;
  }

  &--active {
    background: #e6f4ff;

    .actor-item__name {
      color: #1677ff;
      font-weight: 600;
    }
  }

  &__avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    background: #ececec;
    display: flex;
    align-items: center;
    justify-content: center;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__name {
    font-size: 13px;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

/* 右侧作品区 */
.video-pane {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;

  &__header {
    height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #eee;
  }

  &__title {
    font-size: 15px;
    font-weight: 600;
    color: #1a1a1a;
  }

  &__actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  &__body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;

    :deep(.n-spin-container) {
      height: 100%;
    }

    :deep(.n-spin-content) {
      height: 100%;
    }
  }
}

.video-virtual-grid {
  height: 100%;
  padding: 12px;
  box-sizing: border-box;
}

.video-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  border: 1px solid #eee;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  &__cover {
    width: 100%;
    flex: 1 1 0%;
    min-height: 0;
    overflow: hidden;
    background: #f0f0f0;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    &.cover-error img {
      display: none;
    }
  }

  &__badge {
    position: absolute;
    top: 6px;
    padding: 2px 6px;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
    border-radius: 4px;
    line-height: 1.4;
    max-width: 70%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    backdrop-filter: blur(2px);

    &--left {
      left: 6px;
      background: rgba(0, 0, 0, 0.6);
      cursor: pointer;

      &:hover {
        background: rgba(0, 0, 0, 0.8);
      }
    }

    &--right {
      right: 6px;
      background: rgba(220, 38, 38, 0.85);
    }
  }

  &__cover-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  &__info {
    flex-shrink: 0;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: #fff;
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
    color: #1a1a1a;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__actions {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
}

.load-more-tip {
  text-align: center;
  padding: 12px;
  font-size: 12px;
  color: #9ca3af;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
</style>
