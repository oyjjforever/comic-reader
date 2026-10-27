<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" allowpopups />
  </div>
</template>

<script setup lang="ts" name="site-view">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import siteUtils from '@renderer/plugins/site-utils/index.js'
import { Tip } from '@renderer/plugins/site-utils/utils.js'

const props = defineProps<{
  site: string
}>()

const config = computed(() => {
  return siteUtils.getSiteViewConfig(props.site)
})

const url = computed(() => {
  return config.value?.url || ''
})
const webviewRef = ref<any>(null)
const canDownload = ref(false)
const canAttention = ref(false)
// 当前页面作者已在特别关注中（星标高亮）
const isAttentioned = ref(false)
// 匹配到的特别关注记录 id，供再次点击时取消收藏
const attentionedId = ref<number | null>(null)
const extraState = ref<Record<string, any>>({})

function getCurrentUrl(): string {
  const wv = webviewRef.value
  if (!wv) return ''
  try {
    return typeof wv.getURL === 'function' ? wv.getURL() : wv.src
  } catch {
    // webview 挂载后 dom-ready 前调用 getURL 会抛错，此时退回初始 src
    return wv.src || ''
  }
}

function updateCanDownload() {
  try {
    const currentUrl = getCurrentUrl()
    if (!currentUrl || !config.value?.updateStatus) return
    const result = config.value.updateStatus(currentUrl)
    canDownload.value = result.canDownload
    canAttention.value = result.canAttention
    extraState.value = result.extra || {}
  } catch {
    canDownload.value = false
    canAttention.value = false
  }
  checkAttention()
}

// 当前页面作者是否已加入特别关注：站点配置提供 getAttentionKey 从 URL 解析作者标识，
// 与 special_attention 表按 authorId 优先、authorName 兜底匹配
async function checkAttention() {
  const currentUrl = getCurrentUrl()
  if (!canAttention.value || !config.value?.getAttentionKey || !currentUrl) {
    isAttentioned.value = false
    attentionedId.value = null
    return
  }
  let key: { authorId?: string; authorName?: string } | null = null
  try {
    key = config.value.getAttentionKey({ extra: extraState.value, getCurrentUrl })
  } catch {
    key = null
  }
  if (!key || (!key.authorId && !key.authorName)) {
    isAttentioned.value = false
    attentionedId.value = null
    return
  }
  try {
    const rows = await window.specialAttention.list()
    const source = props.site
    const row = rows.find(
      (r: any) =>
        r.source === source &&
        ((key!.authorId && r.authorId === key!.authorId) ||
          (key!.authorName && r.authorName === key!.authorName))
    )
    isAttentioned.value = !!row
    attentionedId.value = row?.id ?? null
  } catch {
    isAttentioned.value = false
    attentionedId.value = null
  }
}

async function download() {
  if (!config.value?.download) return
  const tip = new Tip()
  try {
    await config.value.download({ extra: extraState.value, getCurrentUrl, tip })
  } catch (error) {
    tip.error(error)
  }
}

// 星标点击：已收藏则取消，未收藏则走站点配置的添加流程
async function toggleSpecialAttention() {
  if (!config.value?.addSpecialAttention) return
  const tip = new Tip()
  try {
    if (isAttentioned.value && attentionedId.value != null) {
      await window.specialAttention.remove(attentionedId.value)
      tip.success('已取消特别关注')
    } else {
      await config.value.addSpecialAttention({ extra: extraState.value, getCurrentUrl, tip })
    }
    // 操作完成后立即刷新高亮状态
    await checkAttention()
  } catch (e) {
    tip.error(e)
  }
}

let cleanupFn: (() => void) | null = null

onMounted(() => {
  const wv = webviewRef.value
  if (!wv) return
  updateCanDownload()
  // 监听导航事件以动态更新可下载状态
  wv.addEventListener('did-navigate', updateCanDownload)
  wv.addEventListener('did-navigate-in-page', updateCanDownload)
  wv.addEventListener('dom-ready', updateCanDownload)
  // 调用站点特定的 onMounted
  if (config.value?.onMounted) {
    const result = config.value.onMounted(wv)
    if (typeof result === 'function') {
      cleanupFn = result
    }
  }
})

onUnmounted(() => {
  if (cleanupFn) {
    cleanupFn()
    cleanupFn = null
  }
  if (config.value?.onUnmounted) {
    config.value.onUnmounted()
  }
})

// 暴露方法和属性
defineExpose({
  download,
  canDownload,
  canAttention,
  isAttentioned,
  checkAttention,
  toggleSpecialAttention,
  webviewRef
})
</script>

<style lang="scss">
.site {
  padding: 10px;
  height: 100%;
  width: 100%;
  webview {
    width: 100%;
    height: 100%;
    background: #fff;
    border-radius: 14px;
    overflow: hidden;
  }
}
</style>
