<template>
  <div class="special-attention">
    <div class="special-attention__header">
      <h1>特别关注</h1>
      <div class="special-attention__header__toolbar">
        <n-input
          v-model:value="searchQuery"
          type="text"
          size="small"
          placeholder="请输入作者名称进行搜索"
          style="width: 320px"
        />
        <n-select
          v-model:value="sourceFilter"
          :options="sourceOptions"
          size="small"
          placeholder="类型"
          style="width: 120px"
        />
        <n-button type="primary" size="small" @click="toggleSortMode">排序</n-button>
        <n-button type="primary" size="small" @click="refresh">刷新</n-button>
      </div>
    </div>
    <div class="special-attention__grid" ref="gridRef">
      <AuthorCard
        v-for="u in filteredItems.slice(0, displayCount)"
        :key="u.id"
        :item="u"
        @move-up="moveUp"
        @move-down="moveDown"
        @remove="onRemove"
      />
      <div v-if="!filteredItems.length" class="special-attention__grid--empty">暂无特别关注</div>
    </div>
  </div>
</template>

<script setup lang="ts" name="special-attention">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { NButton, NInput, NSelect, useMessage } from 'naive-ui'
import AuthorCard from './author.vue'
import { queue } from '@renderer/plugins/store/downloadQueue'

const message = useMessage()

const items = ref([])

const searchQuery = ref('')
const sourceFilter = ref(null)
const sortMode = ref(false)

const displayCount = ref(3)
const gridRef = ref<HTMLElement | null>(null)

const sourceOptions = [
  { label: '全部', value: null },
  { label: 'pixiv', value: 'pixiv' },
  { label: 'jmtt', value: 'jmtt' },
  { label: 'twitter', value: 'twitter' }
]

const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return items.value.filter((u) => {
    const matchName =
      !q ||
      (u.authorName || '').toLowerCase().includes(q) ||
      (u.authorId || '').toLowerCase().includes(q)
    const matchSource = !sourceFilter.value || u.source === sourceFilter.value
    return matchName && matchSource
  })
})

function toggleSortMode() {
  sortMode.value = !sortMode.value
}

async function refresh() {
  const list = await window.specialAttention.list()
  items.value = list
}

async function onRemove(id: number) {
  await window.specialAttention.remove(id)
  message.success('取消关注成功')
  await refresh()
}

async function getLatest(u) {}

async function moveUp(item) {
  // 使用当前过滤后的顺序来确定相邻项
  const idx = filteredItems.value.findIndex((i) => i.id === item.id)
  if (idx <= 0) return
  const neighbor = filteredItems.value[idx - 1]
  if (!neighbor) return
  // 调用预加载方法交换排序
  await window.specialAttention.swapPriority(item.id, neighbor.id)
  // 交换完成后刷新列表，保持排序一致
  await refresh()
}
async function moveDown(item) {
  // 使用当前过滤后的顺序来确定相邻项
  const idx = filteredItems.value.findIndex((i) => i.id === item.id)
  if (idx < 0 || idx >= filteredItems.value.length - 1) return
  const neighbor = filteredItems.value[idx + 1]
  if (!neighbor) return
  // 调用预加载方法交换排序
  await window.specialAttention.swapPriority(item.id, neighbor.id)
  // 交换完成后刷新列表，保持排序一致
  await refresh()
}

function onLocalCheck(item) {
  // 先占位：本地检测逻辑后续实现
}

function handleScroll() {
  const el = gridRef.value
  if (!el) return
  const threshold = 10
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
    const next = displayCount.value + 3
    displayCount.value = Math.min(next, filteredItems.value.length)
  }
}

onMounted(async () => {
  await refresh()
  const el = gridRef.value
  if (el) el.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  const el = gridRef.value
  if (el) el.removeEventListener('scroll', handleScroll)
})

watch([searchQuery, sourceFilter], () => {
  displayCount.value = 3
  // 回到顶部，避免过滤后仍在底部导致立即触发到底加载
  const el = gridRef.value
  if (el) el.scrollTop = 0
})

watch(filteredItems, () => {
  displayCount.value = Math.min(3, filteredItems.value.length)
})
</script>

<style scoped lang="scss">
.special-attention {
  padding: 12px;
  height: 100%;
  background: black;
  display: flex;
  flex-direction: column;
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    color: #fff;
    h1 {
      font-size: 20px;
      font-weight: 700;
    }
    &__toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  }
  &__grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    overflow: auto;
    border-bottom-left-radius: 15px;
    border-bottom-right-radius: 15px;
    position: relative;
    &--empty {
      text-align: center;
      color: #999;
      padding: 40px 0;
    }
  }
}
</style>
