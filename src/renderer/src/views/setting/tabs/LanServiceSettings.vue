<template>
  <n-form :model="modelValue">
    <n-form-item label="启用局域网中转服务">
      <n-switch
        :value="modelValue.enableLanService"
        @update:value="(value) => updateSetting('enableLanService', value)"
      >
        <template #checked>已开启</template>
        <template #unchecked>已关闭</template>
      </n-switch>
      <template #feedback>
        <n-text depth="3" style="font-size: 12px; margin-left: 8px">
          开启后，同一局域网内的手机/平板可通过本机访问漫画资源
        </n-text>
      </template>
    </n-form-item>

    <n-form-item v-if="modelValue.enableLanService" label="服务端口">
      <n-input-number
        :value="modelValue.lanServicePort || 9527"
        @update:value="(value) => updateSetting('lanServicePort', value)"
        :min="1024"
        :max="65535"
        :step="1"
        placeholder="端口号"
        style="width: 200px"
      />
    </n-form-item>

    <n-form-item v-if="modelValue.enableLanService" label="服务状态">
      <n-space vertical>
        <n-tag :type="serverStatus.running ? 'success' : 'error'" size="small">
          {{ serverStatus.running ? '运行中' : '已停止' }}
        </n-tag>
        <n-text depth="3" style="font-size: 12px">
          {{
            serverStatus.running
              ? `服务运行在端口 ${serverStatus.port}，局域网内其他设备可通过此端口访问您的漫画资源。`
              : '服务未运行'
          }}
        </n-text>
        <n-button size="small" @click="refreshStatus" :loading="statusLoading"> 刷新状态 </n-button>
      </n-space>
    </n-form-item>
  </n-form>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { setting } from '../../../../../typings/setting'

const props = defineProps<{
  modelValue: setting
}>()

const emit = defineEmits(['update:modelValue'])
const message = useMessage()

const serverStatus = ref<{ running: boolean; port: number }>({
  running: false,
  port: 0
})
const statusLoading = ref(false)

const updateSetting = (key: keyof setting, value: any) => {
  const newSetting = { ...props.modelValue }
  newSetting[key] = value
  emit('update:modelValue', newSetting)
}

// 查询服务状态
const refreshStatus = async () => {
  statusLoading.value = true
  try {
    const status = await window.server.status()
    serverStatus.value = status
  } catch (err: any) {
    serverStatus.value = { running: false, port: 0 }
  } finally {
    statusLoading.value = false
  }
}

// 当 enableLanService 变化时，通知主进程启停服务
watch(
  () => props.modelValue.enableLanService,
  async (newVal, oldVal) => {
    if (newVal === oldVal) return
    try {
      if (newVal) {
        // 开启服务
        const result = await window.server.start()
        if (result.success) {
          message.success(`局域网服务已启动，端口: ${result.port}`)
        } else {
          message.error(`启动失败: ${result.error}`)
        }
      } else {
        // 关闭服务
        const result = await window.server.stop()
        if (result.success) {
          message.success('局域网服务已停止')
        } else {
          message.error(`停止失败: ${result.error}`)
        }
      }
      refreshStatus()
    } catch (err: any) {
      message.error(`操作失败: ${err.message}`)
    }
  }
)

// 当端口变化时，重启服务
watch(
  () => props.modelValue.lanServicePort,
  async (newPort, oldPort) => {
    if (newPort === oldPort || !props.modelValue.enableLanService) return
    try {
      // 先停止再以新端口启动
      await window.server.stop()
      const result = await window.server.start()
      if (result.success) {
        message.success(`服务已重启，新端口: ${result.port}`)
      }
      refreshStatus()
    } catch (err: any) {
      message.error(`重启失败: ${err.message}`)
    }
  }
)

onMounted(() => {
  refreshStatus()
})
</script>
