<template>
  <n-modal
    :show="show"
    preset="card"
    :title="title"
    style="width: 760px; max-width: 92vw"
    :bordered="false"
    size="huge"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <n-spin :show="loading">
      <n-data-table
        v-if="links.length"
        :columns="columns"
        :data="links"
        :row-key="(row: BtLink) => row.magnet"
        :max-height="300"
        :row-props="rowProps"
        size="small"
        striped
      />
      <n-empty v-else-if="!loading" description="暂无BT下载链接" style="padding: 40px 0" />
    </n-spin>
  </n-modal>
</template>

<script setup lang="ts" name="BtLinksDialog">
import { h } from 'vue'
import { NButton, NTag } from 'naive-ui'

interface BtLink {
  magnet: string
  name: string
  size: string
  date: string
  isHd: boolean
}

interface Props {
  show: boolean
  dvdId: string
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'BT 下载链接'
})
const emit = defineEmits<{
  (e: 'update:show', v: boolean): void
}>()

const message = useMessage()

const links = ref<BtLink[]>([])
const loading = ref(false)

const columns = [
  {
    title: '文件名',
    key: 'name',
    ellipsis: { tooltip: true },
    render(row: BtLink) {
      const children = [h('span', row.name || '未命名')]
      if (row.isHd) {
        children.unshift(
          h(
            NTag,
            { size: 'tiny', type: 'success', style: 'margin-right: 6px' },
            { default: () => 'HD' }
          )
        )
      }
      return h('div', { style: 'display: flex; align-items: center' }, children)
    }
  },
  { title: '大小', key: 'size', width: 90 },
  { title: '日期', key: 'date', width: 110 }
]

const rowProps = (row: BtLink) => ({
  style: 'cursor: pointer',
  onClick: () => copyText(row.magnet)
})

async function loadLinks() {
  if (!props.dvdId) {
    links.value = []
    return
  }
  loading.value = true
  links.value = []
  try {
    const res = await window.missav.getVideoBTLinks(props.dvdId)
    links.value = Array.isArray(res) ? res : []
    if (!links.value.length) message.warning('未找到BT下载链接')
  } catch (e) {
    console.error(e)
    message.error('BT链接获取失败')
  } finally {
    loading.value = false
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制磁力链接')
  } catch {
    message.error('复制失败')
  }
}

watch(
  () => props.show,
  (v) => {
    if (v) loadLinks()
  }
)
</script>
