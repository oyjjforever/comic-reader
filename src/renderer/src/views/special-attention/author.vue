<template>
  <n-card title="卡片插槽示例">
    <template #header>
      <div class="title">
        <img class="source-badge" :src="siteIcon(item.source)" />
        <span class="author-name">{{ item.authorName || item.authorId }}</span>
        <span class="author-id">({{ item.authorId }})</span>
      </div>
    </template>
    <template #header-extra>
      <div class="header-actions">
        <n-button size="small" type="error" @click="emit('remove', item.id)">取消关注</n-button>
        <n-button size="small" @click="emit('get-latest', item)">增量更新</n-button>
        <!-- <n-button size="small" @click="scanDownloaded" tertiary>本地检测</n-button> -->
      </div>
    </template>
    <div class="artwork-list">
      <!-- 排序模式左侧上下箭头 -->
      <div class="sort-controls" v-if="sortMode">
        <n-button size="tiny" tertiary @click="emit('move-up', item)">上箭头</n-button>
        <n-button size="tiny" tertiary @click="emit('move-down', item)">上箭头</n-button>
      </div>
      <n-button class="page-button" type="default" tertiary @click="prevPage">上一页</n-button>
      <div v-if="grid.loading" class="artwork-list--loading">
        <n-skeleton width="100%" height="30vh" :repeat="6" />
      </div>
      <n-carousel
        v-else
        class="artwork-carousel"
        :slides-per-view="6"
        :space-between="20"
        :loop="false"
        :show-dots="false"
        :show-arrows="false"
      >
        <div
          v-for="row in grid.rows"
          :key="row.artworkId"
          class="artwork-item"
          :class="{ 'artwork-item--downloaded': row.downloaded }"
        >
          <div class="artwork-item__pages">
            <n-icon :component="SlideMultiple24Regular" size="12" />{{ row.pages }}
          </div>
          <img :src="row.cover" />
          <div class="hover-ops">
            <n-button-group size="small">
              <n-button size="small" @click="onDownload(row)">下载</n-button>
              <n-button size="small">预览</n-button>
              <!-- <n-button size="small">忽略</n-button> -->
            </n-button-group>
          </div>
          <div class="artwork-title">{{ row.title || '作品' }}</div>
        </div>
      </n-carousel>
      <n-button class="page-button" type="default" tertiary @click="nextPage">下一页</n-button>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { computed, ref, watch, reactive } from 'vue'
import PixivUtil from './pixiv.js'
import { queue } from '@renderer/plugins/store/downloadQueue'
import { getDefaultDownloadPath } from '../site/utils'
import jmttImg from '@renderer/assets/jmtt.jpg'
import pixivImg from '@renderer/assets/pixiv.jpg'
import twitterImg from '@renderer/assets/twitter.jpg'
import TwitterUtil from './twitter.js'
import { SlideMultiple24Regular } from '@vicons/fluent'
// 运行时 props 定义
const props = defineProps({
  item: { type: Object, required: true },
  sortMode: { type: Boolean, default: false }
})

// 事件定义（占位）
const emit = defineEmits(['move-up', 'move-down', 'get-latest', 'local-check', 'remove'])
function siteIcon(site: 'jmtt' | 'pixiv' | 'twitter') {
  if (site === 'jmtt') return jmttImg
  if (site === 'pixiv') return pixivImg
  return twitterImg
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

onMounted(async () => {
  await fetchData()
  await pagingImage()
})
async function fetchData() {
  if (props.item.source === 'pixiv') {
    const artworks = await PixivUtil.fetchArtworks(props.item.authorId)
    grid.allRows = artworks
    page.total = artworks.length
  } else if (props.item.source === 'twitter') {
    page.total = 1000000
  }
}
async function pagingImage() {
  grid.loading = true
  try {
    if (props.item.source === 'pixiv') {
      grid.rows = await PixivUtil.pagingImage(props.item.authorName, grid, page)
    } else if (props.item.source === 'twitter') {
      grid.rows = await TwitterUtil.pagingImage(
        props.item.authorName,
        props.item.authorId,
        grid,
        page
      )
    }
  } finally {
    grid.loading = false
  }
}
async function onDownload(row) {
  if (props.item.source === 'pixiv') {
    const defaultDownloadPath = await getDefaultDownloadPath('downloadPathPixiv')
    queue.addTask({
      site: 'pixiv',
      title: `[${row.author}]${row.title}`,
      payload: {
        artworkId: row.artworkId,
        artworkInfo: {
          author: row.author,
          title: row.title
        },
        baseDir: defaultDownloadPath
      },
      onSuccess() {
        row.downloaded = true
      }
    })
  } else if (props.item.source === 'twitter') {
    const defaultDownloadPath = await getDefaultDownloadPath('downloadPathTwitter')
    const author = props.item.authorName
    queue.addTask({
      site: 'twitter',
      title: `[${author}]${row.title}`,
      payload: {
        author,
        userId: props.item.authorId,
        artworkInfo: {
          author,
          title: row.title,
          url: row.url
        },
        baseDir: defaultDownloadPath
      },
      onSuccess() {
        row.downloaded = true
      }
    })
  }
}
function prevPage() {
  if (page.index > 0) page.index -= 1
  pagingImage()
}
function nextPage() {
  if ((page.index + 1) * page.size < page.total) page.index += 1
  pagingImage()
}
</script>

<style lang="scss">
.n-card > .n-card-header {
  padding: 10px !important;
}
.n-card > .n-card__content {
  padding: 5px 10px !important;
}
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
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: cover;
}
.author-id {
  color: #888;
  font-size: 12px;
}
.page-button {
  width: 10px;
  height: 160px;
  writing-mode: vertical-rl;
}
.artwork-list {
  display: flex;
  justify-content: center;
  align-items: center;
  &--loading {
    flex: 1;
    display: flex;
    gap: 20px;
    justify-content: center;
    align-items: center;
    padding: 0 10px;
  }
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
  img {
    height: 30vh;
    width: 100%;
    object-fit: cover;
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
    left: 0;
    right: 0;
    bottom: 0;
    opacity: 0;
    display: flex;
    padding: 2px;
    justify-content: space-around;
    background: rgba(224, 223, 223, 1);
    transition: opacity 0.25s ease;
    z-index: 9999;
    .n-button-group {
      width: 100%;
      .n-button {
        flex: 1;
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
</style>
