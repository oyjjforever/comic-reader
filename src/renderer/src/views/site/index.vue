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
const extraState = ref<Record<string, any>>({})

function getCurrentUrl(): string {
  const wv = webviewRef.value
  if (!wv) return ''
  return typeof wv.getURL === 'function' ? wv.getURL() : wv.src
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

async function addSpecialAttention() {
  if (!config.value?.addSpecialAttention) return
  const tip = new Tip()
  try {
    await config.value.addSpecialAttention({ extra: extraState.value, getCurrentUrl, tip })
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
  addSpecialAttention,
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
