<template>
  <n-modal v-model:show="show" preset="card" title="选择投屏设备" style="width: 520px">
    <div class="device-list">
      <n-spin :show="loading">
        <n-empty v-if="!loading && devices.length === 0" description="未发现设备，确保设备在同一局域网并支持 DLNA" />
        <n-list v-else>
          <n-list-item v-for="d in devices" :key="d.name">
            <div class="row">
              <div class="name">{{ d.name }}</div>
              <div class="actions">
                <n-button size="small" @click="onPlay(d)">投屏此设备</n-button>
              </div>
            </div>
          </n-list-item>
        </n-list>
      </n-spin>
    </div>
    <template #footer>
      <div class="footer">
        <n-button @click="refresh" secondary>重新搜索</n-button>
        <n-button @click="close">关闭</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useMessage } from 'naive-ui'

const props = defineProps<{
  videoUrl: string
  contentType?: string
}>()
const emit = defineEmits<{
  (e: 'update:show', v: boolean): void
  (e: 'played'): void
}>()
const show =ref(false)
const message = useMessage()
const devices = ref<Array<{ name: string }>>([])
const loading = ref(false)

async function refresh() {
  loading.value = true
  try {
    const list = await (window as any).dlna?.getDevices?.()
    console.log(list)
    devices.value = Array.isArray(list) ? list : []
  } catch (e: any) {
    message.error(e?.message || '获取设备失败')
  } finally {
    loading.value = false
  }
}
function open() {
  show.value = true
  refresh()
}
function close() {
  emit('update:show', false)
}

async function onPlay(d: { name: string }) {
  try {
    await (window as any).dlna?.serveAndPlay?.(d.name, props.videoUrl)
    message.success(`已投屏到设备：${d.name}`)
    emit('played')
    close()
  } catch (e: any) {
    message.error(e?.message || '投屏失败')
  }
}
// 暴露方法
defineExpose({
  open,
  close
})
</script>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.name {
  font-weight: 600;
}
.footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>