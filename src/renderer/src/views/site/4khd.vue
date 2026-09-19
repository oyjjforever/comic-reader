<template>
  <div class="fourkhd-view">
    <!-- 分页控制 -->
    <div v-if="totalPages > 1" class="pager">
      <n-pagination
        :page="page"
        :page-count="totalPages"
        :page-slot="7"
        size="small"
        @update:page="onPageChange"
      />
    </div>
    <!-- 列表 -->
    <div v-if="loading && !items.length" class="state-tip">加载中...</div>
    <div v-else-if="error" class="state-tip state-tip--error">{{ error }}</div>
    <div v-else-if="!items.length" class="state-tip">暂无数据</div>
    <div v-else class="grid-wrap">
      <ResponsiveVirtualGrid
        ref="virtualGridRef"
      :items="items"
      :min-item-width="160"
      :max-item-width="220"
      :aspect-ratio="0.6"
      :gap="16"
      key-field="href"
      mode="lazy"
      @scroll="onGridScroll"
    >
      <template #default="{ item }">
        <div
          class="artwork-item"
          :class="{ 'artwork-item--downloaded': item.downloaded }"
          @click="openDetail(item)"
        >
          <n-image v-if="item.thumb" :src="item.thumb" :preview-disabled="true" class="cover">
            <template #error>
              <img :src="errorImg" class="cover-img" />
            </template>
          </n-image>
          <img v-else :src="errorImg" class="cover-img" />
          <!-- 悬浮操作 -->
          <div class="hover-ops">
            <button @click.stop="openDetail(item)">
              <n-icon :component="ImageOutline" size="24" />
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
    </div>
    <!-- 触底自动加载指示 -->
    <div v-if="items.length && loading" class="load-more">加载中...</div>

    <!-- 详情模态层 -->
    <div v-if="detailVisible" class="overlay" @click.self="closeDetail">
      <div class="modal">
        <div class="modal__header">
          <span class="modal__title" :title="currentTitle">{{ currentTitle }}</span>
          <div class="modal__close" @click="closeDetail">×</div>
        </div>
        <div class="modal__body" @scroll="onModalBodyScroll">
          <div v-if="detailLoading" class="state-tip">加载详情中...</div>
          <div v-else-if="detailError" class="state-tip state-tip--error">{{ detailError }}</div>
          <template v-else-if="detail">
            <!-- 图片 -->
            <div class="images">
              <n-image
                v-for="url in detail.images"
                :key="url"
                :src="url"
                class="images__item"
                lazy
              >
                <template #error>
                  <img :src="errorImg" class="cover-img" />
                </template>
              </n-image>
            </div>
            <div v-if="hasMoreDetail" class="images__more">
              {{ detailLoadingMore ? '加载中...' : '滚动到底部加载更多' }}
            </div>
          </template>
        </div>
        <!-- 底部固定下载栏 -->
        <div v-if="detail" class="modal__footer">
          <span class="modal__pageinfo">
            已加载 {{ detail.images.length }} 张图片（第 {{ detailLoadedPage }}/{{ detailMaxPage }} 页）
          </span>
          <n-button type="primary" size="small" :loading="detailLoadingMore" @click="onDownload">
            下载（{{ hasMoreDetail ? '全部' : detail.images.length + ' 张' }}）
          </n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup name="fourkhd">
import { ref, computed } from 'vue'
import { NButton, NImage, NPagination, useMessage } from 'naive-ui'
import { ImageOutline, CloudDownload } from '@vicons/ionicons5'
import ResponsiveVirtualGrid from '@renderer/components/responsive-virtual-grid.vue'
import errorImg from '@renderer/assets/error.png'
import fourkhd from '@renderer/plugins/site-utils/4khd.js'

const message = useMessage()

const items = ref<any[]>([])
const loading = ref(false)
const error = ref('')
const hasMore = ref(false)
const totalPages = ref(1)
const page = ref(1)
const virtualGridRef = ref()

// 详情状态
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const detail = ref<any>(null)
const currentTitle = ref('')
const currentItem = ref<any>(null)
// 相册分页增量加载状态
const detailMaxPage = ref(1)
const detailLoadedPage = ref(1)
const detailLoadingMore = ref(false)
const detailHref = ref('')

const hasMoreDetail = computed(() => detailLoadedPage.value < detailMaxPage.value)

async function loadList(replace = false) {
  loading.value = true
  error.value = ''
  try {
    const { list, hasMore: more, totalPages: total } = await fourkhd.fetchList(page.value)
    hasMore.value = !!more
    totalPages.value = Math.max(total || 1, page.value)
    const mapped = list.map((it: any) => ({
      ...it,
      downloaded: fourkhd.isLocalDownloaded(it.title)
    }))
    if (replace) {
      // 跳页：整页替换并回到顶部
      items.value = mapped
      virtualGridRef.value?.scrollToTop?.()
    } else {
      // 滚动加载：跨页去重追加
      const seen = new Set(items.value.map((i: any) => i.href))
      items.value = [...items.value, ...mapped.filter((it: any) => !seen.has(it.href))]
    }
  } catch (e: any) {
    error.value = e?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

// 分页控制：直接跳转到指定页码（替换列表）
function onPageChange(p: number) {
  if (p === page.value || p < 1 || p > totalPages.value) return
  page.value = p
  loadList(true)
}

function loadMore() {
  if (loading.value || !hasMore.value) return
  page.value++
  loadList()
}

// 网格内部滚动触底自动加载下一页（按钮位于滚动容器外无法点击）
function onGridScroll(e: Event) {
  const el = e.target as HTMLElement
  if (!el || loading.value || !hasMore.value) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
    loadMore()
  }
}

async function openDetail(item: any) {
  detailVisible.value = true
  detailLoading.value = true
  detailError.value = ''
  detail.value = null
  currentItem.value = item
  currentTitle.value = item.title
  try {
    detail.value = await fourkhd.fetchDetail(item.href, item.title)
    // 标题以列表页为权威，与已下载判断共用同一名称
    currentTitle.value = detail.value?.title || item.title
    // 重置相册分页状态，第 1 页立即可见
    detailMaxPage.value = detail.value?.maxPage || 1
    detailLoadedPage.value = detail.value?.pagesLoaded || 1
    detailHref.value = item.href
  } catch (e: any) {
    detailError.value = e?.message || '获取详情失败'
  } finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  detailVisible.value = false
  detail.value = null
  detailMaxPage.value = 1
  detailLoadedPage.value = 1
  detailHref.value = ''
}

// 相册滚动增量加载：读取下一分页并追加
async function loadMoreDetail() {
  if (!detailVisible.value || detailLoadingMore.value || !hasMoreDetail.value || !detailHref.value) {
    return
  }
  detailLoadingMore.value = true
  try {
    const next = detailLoadedPage.value + 1
    const r = await fourkhd.fetchDetailPage(detailHref.value, next)
    if (detail.value) {
      const seen = new Set(detail.value.images)
      detail.value.images = [...detail.value.images, ...(r?.images || []).filter((u: string) => !seen.has(u))]
      detail.value.pagesLoaded = next
    }
    detailLoadedPage.value = next
  } catch (e: any) {
    message.error(e?.message || '加载更多图片失败')
  } finally {
    detailLoadingMore.value = false
  }
}

// 详情弹窗滚动触底自动加载下一分页
function onModalBodyScroll(e: Event) {
  const el = e.target as HTMLElement
  if (!el || detailLoadingMore.value || !hasMoreDetail.value) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
    loadMoreDetail()
  }
}

async function onDownload() {
  if (!detail.value) return
  try {
    await fourkhd.downloadWork(detail.value)
    // 直接置灰当前卡片，避免标题空格差异导致匹配失败
    if (currentItem.value) currentItem.value.downloaded = true
    message.success('已加入下载队列')
  } catch (e: any) {
    message.error(e?.message || '下载失败')
  }
}

// 直接从卡片下载：先获取详情再加入队列
async function onQuickDownload(item: any) {
  try {
    const d = await fourkhd.fetchDetail(item.href, item.title)
    await fourkhd.downloadWork(d)
    item.downloaded = true
    message.success('已加入下载队列')
  } catch (e: any) {
    message.error(e?.message || '下载失败')
  }
}

loadList()
</script>

<style lang="scss" scoped>
.fourkhd-view {
  height: 100%;
  width: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
}

.pager {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 8px 12px;
  border-bottom: 1px solid #eee;
}

.grid-wrap {
  flex: 1;
  min-height: 0;
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

.load-more {
  position: absolute;
  bottom: 8px;
  left: 0;
  width: 100%;
  text-align: center;
  color: #888;
  font-size: 13px;
  pointer-events: none;
  z-index: 6;
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
    line-height: 1.3;
    text-align: left;
    font-weight: 700;
    padding: 4px 6px;
    color: #fff;
    background: #0000004d;
    backdrop-filter: blur(10px);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    word-break: break-all;
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

  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 18px;
    border-top: 1px solid #eee;
    background: #fff;
  }

  &__pageinfo {
    font-size: 12px;
    color: #888;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.images {
  display: flex;
  flex-direction: column;
  gap: 10px;

  &__item {
    width: 100%;
    border-radius: 8px;
    overflow: hidden;
    background: #f5f5f5;

    :deep(img) {
      width: 100%;
      display: block;
    }
  }

  .cover-img {
    width: 100%;
    height: 300px;
    object-fit: contain;
  }

  &__more {
    text-align: center;
    padding: 10px 0;
    color: #888;
    font-size: 13px;
  }
}
</style>
