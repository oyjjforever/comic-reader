<template>
  <n-form :model="modelValue">
    <n-float-button
      :right="30"
      :top="100"
      shape="square"
      type="default"
      width="100px"
      size="small"
      @click="createBackup"
      :loading="isCreatingBackup"
    >
      立即备份
    </n-float-button>
    <n-space>
      <n-form-item path="enableScheduledBackup" label="定时备份" label-placement="left">
        <n-switch
          :value="modelValue.enableScheduledBackup"
          @update:value="(value) => updateSetting('enableScheduledBackup', value)"
        />
      </n-form-item>
      <n-select
        v-if="modelValue.enableScheduledBackup"
        style="width: 200px"
        :value="modelValue.backupInterval"
        @update:value="(value) => updateSetting('backupInterval', value)"
        :disabled="!modelValue.enableScheduledBackup"
        :options="[
          { label: '1周', value: 1 },
          { label: '2周', value: 2 },
          { label: '3周', value: 3 },
          { label: '4周', value: 4 }
        ]"
        placeholder="请选择备份周期"
      />
    </n-space>
    <n-form-item
      path="backupPath"
      label="备份文件保存路径"
      :show-feedback="modelValue.enableScheduledBackup"
    >
      <n-input-group>
        <n-input
          :value="modelValue.backupPath"
          @update:value="(value) => updateSetting('backupPath', value)"
          placeholder="请选择备份文件保存路径"
          readonly
        />
        <n-button type="primary" @click="selectBackupPath"> 选择文件夹 </n-button>
      </n-input-group>
    </n-form-item>
  </n-form>

  <!-- 备份文件列表 -->
  <n-divider />
  <h3>备份文件列表</h3>
  <n-data-table
    :columns="backupListColumns"
    :data="backupList"
    :pagination="false"
    :max-height="350"
  />
</template>

<script setup lang="ts">
import { ref, defineProps, defineEmits, onMounted, h } from 'vue'
import { useMessage, useDialog, NButton } from 'naive-ui'
import { setting } from '../../../../../typings/setting'

const props = defineProps<{
  modelValue: setting
}>()

const emit = defineEmits(['update:modelValue'])

const message = useMessage()
const dialog = useDialog()

// 数据库备份相关状态
const isCreatingBackup = ref(false)
const isRestoring = ref(false)
const showRestoreDialog = ref(false)
const backupList = ref<
  Array<{ fileName: string; filePath: string; size: number; createdAt: Date }>
>([])
const selectedBackup = ref<{
  fileName: string
  filePath: string
  size: number
  createdAt: Date
} | null>(null)

const updateSetting = (key: keyof setting, value: any) => {
  const newSetting = { ...props.modelValue }
  newSetting[key] = value
  emit('update:modelValue', newSetting)
}

// 选择备份路径
const selectBackupPath = async () => {
  try {
    // 调用 Electron 的文件选择器
    const result = await window.electron.ipcRenderer.invoke('dialog:openDirectory')
    if (result && !result.canceled && result.filePaths.length > 0) {
      updateSetting('backupPath', result.filePaths[0])
    }
  } catch (error) {
    message.error('选择备份文件夹失败')
  }
}

// 刷新备份列表
const refreshBackupList = async () => {
  try {
    const backups = await window.databaseBackup.getBackupList(props.modelValue.backupPath)
    backupList.value = backups
  } catch (error) {
    message.error('获取备份列表失败')
  }
}

// 组件挂载时获取备份列表
onMounted(() => {
  refreshBackupList()
})

// 创建备份
const createBackup = async () => {
  if (!props.modelValue.backupPath) {
    message.error('请先选择备份文件保存路径')
    return
  }
  isCreatingBackup.value = true
  try {
    const backupPath = await window.databaseBackup.createBackup(props.modelValue.backupPath)
    message.success('数据库备份成功')
    refreshBackupList()
  } catch (error) {
    message.error('数据库备份失败')
  } finally {
    isCreatingBackup.value = false
  }
}
// 确认恢复
const restoreBackup = async (backup: {
  fileName: string
  filePath: string
  size: number
  createdAt: Date
}) => {
  dialog.success({
    title: '确认恢复',
    content: `确定要从备份文件 ${backup.fileName} 恢复数据库吗？`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await window.databaseBackup.restoreBackup(backup.filePath)
        showRestoreDialog.value = false
        message.success('数据库恢复成功')
      } catch (error) {
        message.error(`数据库恢复失败: ${error}`)
      } finally {
        isRestoring.value = false
      }
    }
  })
  isRestoring.value = true
}

// 删除备份
const deleteBackup = async (backup: {
  fileName: string
  filePath: string
  size: number
  createdAt: Date
}) => {
  dialog.error({
    title: '确认删除',
    content: `确定要删除备份文件 ${backup.fileName} 吗？此操作不可撤销。`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await window.databaseBackup.deleteBackup(backup.filePath)
        message.success('备份文件删除成功')
        refreshBackupList()
      } catch (error) {
        message.error(`删除备份文件失败: ${error}`)
      }
    }
  })
}

// 备份列表表格列定义
const backupListColumns = [
  { title: '文件名', key: 'fileName', align: 'center' },
  {
    title: '大小',
    key: 'size',
    width: '100',
    align: 'center',
    render: (row: any) => `${(row.size / 1024 / 1024).toFixed(2)} MB`
  },
  {
    title: '创建时间',
    key: 'createdAt',
    width: '300',
    align: 'center',
    render: (row: any) => new Date(row.createdAt).toLocaleString()
  },
  {
    title: '操作',
    key: 'actions',
    width: '160',
    align: 'center',
    render: (row: any) => {
      return [
        h(
          NButton,
          {
            size: 'small',
            type: 'success',
            style: { marginRight: '8px' },
            onClick: () => restoreBackup(row)
          },
          '恢复'
        ),
        h(
          NButton,
          {
            size: 'small',
            type: 'error',
            onClick: () => deleteBackup(row)
          },
          '删除'
        )
      ]
    }
  }
]
</script>
