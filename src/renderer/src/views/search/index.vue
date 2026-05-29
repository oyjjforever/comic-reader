<template>
  <div class="search-container">
    <!-- 搜索表单 -->
    <div class="search-form">
      <div class="search-form-row">
        <n-select
          v-model:value="searchType"
          :options="typeOptions"
          placeholder="选择网站类型"
          style="width: 120px; flex-shrink: 0"
        />
        <n-input
          v-model:value="keyword"
          type="textarea"
          placeholder="输入搜索关键字（每行一条记录）"
          :autosize="{ minRows: 1, maxRows: 4 }"
          clearable
        />
        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button
              :type="autoExtract ? 'primary' : 'default'"
              @click="autoExtract = !autoExtract"
              style="flex-shrink: 0"
            >
              <template #icon>
                <n-icon :component="NumberSymbol24Regular" />
              </template>
              {{ autoExtract ? '提取' : '原文' }}
            </n-button>
          </template>
          {{
            autoExtract
              ? '当前为自动提取数字（切换到原文搜索）'
              : '当前为原文搜索（切换到自动提取数字）'
          }}
        </n-tooltip>
        <n-button type="success" @click="onSearch" :loading="loading" :disabled="!keyword">
          <template #icon>
            <n-icon :component="Search24Regular" />
          </template>
          搜索
        </n-button>
      </div>
      <!-- 数字提取提示 -->
      <div v-if="autoExtract" class="number-extract-hint">
        <n-icon :component="NumberSymbol24Regular" size="16" />
        <span>已提取 {{ extractedKeywords.length }} 个搜索关键字：</span>
        <n-tag v-for="(kw, idx) in extractedKeywords" :key="idx" size="small" round type="info">
          {{ kw }}
        </n-tag>
      </div>
    </div>

    <!-- 搜索结果 -->
    <div v-if="searchResults.length > 0" class="search-results">
      <div class="results-header">
        <span class="results-count">找到 {{ searchResults.length }} 个结果</span>
      </div>
      <responsive-virtual-grid
        ref="virtualGridRef"
        :items="searchResults"
        key-field="id"
        :min-item-width="100"
        :max-item-width="100"
        :aspect-ratio="0.75"
        :gap="10"
        mode="lazy"
        @scroll="handleScroll"
        @ready="onGridReady"
      >
        <template #default="{ item }">
          <div class="search-item" :class="{ 'search-item--downloaded': item.downloaded }">
            <div class="item-cover">
              <!-- 加载中状态 -->
              <div v-if="item.loading" class="loading-placeholder">
                <n-spin size="small" />
              </div>
              <!-- 已加载状态 -->
              <template v-else-if="item.loaded">
                <n-image v-if="item.cover" :src="item.cover" class="cover-image">
                  <template #error>
                    <img :src="errorImg" />
                  </template>
                </n-image>
                <div v-else class="default-cover">
                  <n-icon :component="Image24Regular" size="48" />
                </div>
                <!-- 悬浮操作栏 -->
                <div v-if="item.artworkId" class="hover-ops">
                  <div v-if="item.pages" class="item-pages">
                    <n-icon :component="SlideMultiple24Regular" size="12" />{{ item.pages }}
                  </div>
                  <button size="small" @click.stop="onDownload(item)">
                    <n-icon :component="CloudDownload" size="24" />
                  </button>
                  <button size="small" @click.stop="onPreview(item)">
                    <n-icon :component="InformationCircle" size="24" />
                  </button>
                </div>
              </template>
              <!-- 未加载状态 -->
              <div v-else class="default-cover">
                <n-icon :component="Image24Regular" size="48" />
              </div>
            </div>
            <div class="item-info">
              <h3 class="item-title" :title="item.title">{{ item.title || '加载中...' }}</h3>
              <div class="item-meta">
                <span v-if="item.author" class="item-author">{{ item.author }}</span>
              </div>
            </div>
          </div>
        </template>
      </responsive-virtual-grid>
      <!-- 加载更多指示器 -->
      <div v-if="isLoadingMore" class="load-more-indicator">
        <n-spin size="small" />
        <span>加载更多中...</span>
      </div>
      <div v-else-if="!hasMore" class="load-more-indicator no-more">
        <span>没有更多结果了</span>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="hasSearched && !loading" class="empty-state">
      <n-icon :component="Search24Regular" size="64" color="#ccc" />
      <p class="empty-text">未找到相关结果</p>
    </div>

    <!-- 初始状态 -->
    <div v-else-if="!hasSearched" class="initial-state">
      <n-icon :component="Search24Regular" size="64" color="#e0e0e0" />
      <p class="initial-text">请输入关键字开始搜索</p>
    </div>

    <!-- 预览弹窗 -->
    <preview-dialog
      v-if="previewer.show"
      :dialog="previewer"
      @download="onDownload"
    ></preview-dialog>
  </div>
</template>

<script setup lang="ts" name="search">
import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { NSelect, NInput, NButton, NIcon, NImage, NSpin, NTag, NTooltip } from 'naive-ui'
import {
  Search24Regular,
  Image24Regular,
  SlideMultiple24Regular,
  NumberSymbol24Regular
} from '@vicons/fluent'
import { CloudDownload, InformationCircle } from '@vicons/ionicons5'
import ResponsiveVirtualGrid from '../../components/responsive-virtual-grid.vue'
import previewDialog from '../special-attention/preview-dialog.vue'
import errorImg from '@renderer/assets/error.png'
import siteUtils from '@renderer/plugins/site-utils/index.js'
import { useSettingStore } from '@renderer/plugins/store'

// 网站类型选项
const typeOptions = [
  { label: '全部', value: 'all' },
  { label: 'JM', value: 'jmtt' },
  { label: 'Pixiv', value: 'pixiv' },
  { label: 'Picaman', value: 'picaman' }
]

// 搜索表单状态
const searchType = ref('all')
const keyword = ref('')
const loading = ref(false)
const hasSearched = ref(false)
const autoExtract = ref(false) // 是否自动提取数字关键字

// 分页状态
const currentPage = ref(1)
const hasMore = ref(true)
const isLoadingMore = ref(false)

// 搜索结果（占位符数组，每项包含 {id, artworkId, source, loaded, loading, ...details}）
const searchResults = ref<any[]>([])

// 虚拟网格引用
const virtualGridRef = ref()

// 预览弹窗状态
const previewer = reactive({
  show: false,
  data: {}
})

// 正在加载详情的ID集合，防止重复请求
const loadingDetailIds = new Set<string>()

// 当前搜索使用的关键字列表（用于加载更多时保持一致）
const activeSearchKeywords = ref<string[]>([])

/**
 * 从文本中提取数字关键字
 * 按行分割，每行提取所有连续数字拼接成一个搜索关键字
 * 例如："今天和网友桜湯ハル14月3日97局对战胜率达到百分之90的比赛录像" → "1439790"
 * 纯数字行直接作为关键字，如 "361413" → "361413"
 */
const extractKeywordsFromText = (text: string): string[] => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const keywords: string[] = []

  for (const line of lines) {
    // 提取所有连续数字
    const numbers = line.match(/\d+/g)
    if (numbers && numbers.length > 0) {
      // 将所有数字拼接为一个搜索关键字
      const combined = numbers.join('')
      if (combined) {
        keywords.push(combined)
      }
    }
  }

  // 去重，并过滤掉长度小于5的关键字（太短的数字没有搜索意义）
  return [...new Set(keywords)].filter((kw) => kw.length >= 5)
}

// 计算属性：实时显示从当前输入中提取的关键字（仅在自动提取模式下显示）
const extractedKeywords = computed(() => {
  if (!autoExtract.value || !keyword.value.trim()) return []
  return extractKeywordsFromText(keyword.value)
})

/**
 * 获取搜索关键字列表
 * 自动提取模式：按行提取数字
 * 原文模式：按行直接使用原文
 */
const getSearchKeywords = (): string[] => {
  const text = keyword.value.trim()
  if (!text) return []

  if (autoExtract.value) {
    return extractKeywordsFromText(text)
  }

  // 原文模式：按行分割，每行作为一个关键字
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return [...new Set<string>(lines)]
}

// 获取当前需要搜索的站点列表
const getTypesToSearch = () => {
  return searchType.value === 'all' ? ['jmtt', 'pixiv', 'picaman'] : [searchType.value]
}
const onSearch = () => {
  currentPage.value = 1
  fetchData()
}
// 统一搜索函数，根据 currentPage 判断是首次搜索还是加载更多
const fetchData = async () => {
  const isFirstPage = currentPage.value === 1

  if (isFirstPage) {
    if (!keyword.value.trim()) return
    const keywords = getSearchKeywords()
    if (keywords.length === 0) return
    activeSearchKeywords.value = keywords
    loading.value = true
    hasSearched.value = true
    searchResults.value = []
    hasMore.value = true
    loadingDetailIds.clear()
  } else {
    if (isLoadingMore.value || !hasMore.value || !hasSearched.value) return
    isLoadingMore.value = true
  }

  try {
    const keywords = activeSearchKeywords.value
    const seenIds = isFirstPage
      ? new Set<string>()
      : new Set<string>(searchResults.value.map((r) => r.id))
    const typesToSearch = getTypesToSearch()

    const newResults = (
      await Promise.all(
        keywords.map(async (kw) =>
          Promise.all(
            typesToSearch.map(async (type) => {
              try {
                const ids = await siteUtils.searchArtworks(type, kw, currentPage.value)
                if (!ids || !Array.isArray(ids)) return []
                return ids.map((id: any) => {
                  const uniqueId =
                    currentPage.value === 1
                      ? `${type}_${id}`
                      : `${type}_${id}_p${currentPage.value}`
                  if (seenIds.has(uniqueId)) return null
                  seenIds.add(uniqueId)
                  return {
                    id: uniqueId,
                    artworkId: id,
                    source: type,
                    loaded: false,
                    loading: false,
                    title: '',
                    author: '',
                    cover: '',
                    pages: 0,
                    downloaded: false,
                    searchKeyword: kw
                  }
                })
              } catch (error) {
                console.error(`搜索 ${type} 关键字 ${kw} 第${currentPage.value}页失败:`, error)
                return []
              }
            })
          )
        )
      )
    )
      .flat()
      .flat()
      .filter(Boolean)

    // 第一页直接赋值，后续页追加
    if (isFirstPage) {
      searchResults.value = newResults
    } else {
      searchResults.value.push(...newResults)
    }

    if (newResults.length === 0) {
      hasMore.value = false
    }
  } catch (error) {
    console.error('搜索失败:', error)
    if (!isFirstPage) currentPage.value--
  } finally {
    if (isFirstPage) {
      loading.value = false
    } else {
      isLoadingMore.value = false
    }
  }
}

// 加载可视区域内未加载项的详情
const loadVisibleDetails = async () => {
  const stats = virtualGridRef.value?.getStats()
  if (!stats || searchResults.value.length === 0) return

  const { start, end } = stats.visibleRange
  const itemsToLoad: any[] = []

  for (let i = start; i <= end && i < searchResults.value.length; i++) {
    const item = searchResults.value[i]
    if (item && !item.loaded && !item.loading && !loadingDetailIds.has(item.id)) {
      itemsToLoad.push(item)
      loadingDetailIds.add(item.id)
    }
  }

  if (itemsToLoad.length === 0) return

  // 标记为加载中
  itemsToLoad.forEach((item) => {
    item.loading = true
  })

  // 并行加载详情
  await Promise.all(
    itemsToLoad.map(async (item) => {
      try {
        const details = await siteUtils.getArtworkInfo(item.source, item.artworkId)
        if (details) {
          Object.assign(item, details, { loaded: true, loading: false })
        } else {
          item.loading = false
        }
      } catch (error) {
        console.error(`获取 ${item.artworkId} 详情失败:`, error)
        item.loading = false
      } finally {
        loadingDetailIds.delete(item.id)
      }
    })
  )
}

// 检测是否滚动到底部
const checkScrollBottom = () => {
  const stats = virtualGridRef.value?.getStats()
  if (!stats) return

  const { end } = stats.visibleRange
  const totalItems = searchResults.value.length

  // 当可见区域接近底部（距离底部不到10个item）时触发加载更多
  if (end >= totalItems - 10 && hasMore.value && !isLoadingMore.value) {
    currentPage.value++
    fetchData()
  }
}

// 网格滚动事件处理
const handleScroll = () => {
  loadVisibleDetails()
  checkScrollBottom()
}

// 网格就绪后加载首批可见项
const onGridReady = async () => {
  await nextTick()
  loadVisibleDetails()
}

// 下载单个作品
const onDownload = async (row: any) => {
  await siteUtils.downloadArtwork(row.source, row, {})
  row.downloaded = true
}

// 预览作品
const onPreview = (row: any) => {
  previewer.data = row
  previewer.show = true
}

// 剪切板内容变化时更新搜索关键字
const settingStore = useSettingStore()
const getClipboardContent = async () => {
  if (!settingStore.setting.autoFillClipboard) return
  // 通过 IPC 从主进程读取当前剪切板内容
  const text = await window.clipboard.readText()
  if (text) {
    keyword.value = text.trim()
  }
}

onMounted(async () => {
  getClipboardContent()
  window.electron.ipcRenderer.on('clipboard-content', getClipboardContent)
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeListener('clipboard-content', getClipboardContent)
})
</script>

<style lang="scss" scoped>
.search-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px;
  background: #f5f5f5;
}

.search-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.search-form-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.number-extract-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #f0f7ff;
  border-radius: 8px;
  font-size: 13px;
  color: #666;
  flex-wrap: wrap;
}

.search-results {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.results-header {
  margin: 10px;
}

.results-count {
  font-size: 14px;
  color: #666;
  font-weight: 500;
}

.search-item {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);

    .hover-ops {
      opacity: 1;
    }
  }

  &--downloaded {
    .cover-image,
    .default-cover {
      opacity: 0.5;
    }
  }
}

.item-cover {
  width: 100%;
  flex: 1;
  min-height: 0;
  background: #f0f0f0;
  overflow: hidden;
  position: relative;
}

.cover-image {
  width: 100%;
  height: 100%;

  :deep(img) {
    width: 100%;
    height: 100%;
    object-fit: cover !important;
  }
}

.default-cover {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

/* 加载中占位 */
.loading-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;
}

/* 页数指示器 */
.item-pages {
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
  z-index: 1;
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

.item-info {
  padding: 12px;
}

.item-title {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 8px 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.item-type {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #e3f2fd;
  color: #1976d2;
  font-weight: 500;
}

.item-author {
  font-size: 12px;
  color: #999;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state,
.initial-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
}

.empty-text,
.initial-text {
  margin-top: 16px;
  font-size: 16px;
  color: #999;
}

/* 加载更多指示器 */
.load-more-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 0;
  font-size: 13px;
  color: #999;

  &.no-more {
    color: #ccc;
  }
}

@media (max-width: 768px) {
  .search-container {
    padding: 16px;
  }

  .search-form {
    padding: 16px;
  }

  .search-form-row {
    flex-direction: column;
    gap: 8px;
  }

  .item-info {
    padding: 10px;
  }

  .item-title {
    font-size: 13px;
  }
}
</style>
