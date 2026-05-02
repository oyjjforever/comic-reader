<template>
  <n-form :model="modelValue">
    <n-form-item label="漫画书资源路径">
      <div class="path-list">
        <div v-for="(path, index) in modelValue.resourcePaths" :key="index" class="path-item">
          <n-input-group>
            <n-input
              :value="path"
              @update:value="(value) => updatePath('resourcePaths', index, value)"
              placeholder="请选择资源文件夹路径"
              readonly
            />
            <n-button type="primary" @click="selectPath('resourcePaths', index)">
              选择文件夹
            </n-button>
            <n-button quaternary type="error" @click="removePath('resourcePaths', index)">
              <template #icon>
                <n-icon :component="CloseSharp" />
              </template>
            </n-button>
          </n-input-group>
        </div>
        <n-button dashed block @click="addPath('resourcePaths')"> + 添加资源路径 </n-button>
      </div>
    </n-form-item>

    <n-form-item label="电影资源路径">
      <div class="path-list">
        <div v-for="(path, index) in modelValue.videoResourcePaths" :key="index" class="path-item">
          <n-input-group>
            <n-input
              :value="path"
              @update:value="(value) => updatePath('videoResourcePaths', index, value)"
              placeholder="请选择资源文件夹路径"
              readonly
            />
            <n-button type="primary" @click="selectPath('videoResourcePaths', index)">
              选择文件夹
            </n-button>
            <n-button quaternary type="error" @click="removePath('videoResourcePaths', index)">
              <template #icon>
                <n-icon :component="CloseSharp" />
              </template>
            </n-button>
          </n-input-group>
        </div>
        <n-button dashed block @click="addPath('videoResourcePaths')"> + 添加资源路径 </n-button>
      </div>
    </n-form-item>
  </n-form>
</template>

<script setup lang="ts">
import { defineProps, defineEmits } from 'vue'
import { useMessage } from 'naive-ui'
import { CloseSharp } from '@vicons/ionicons5'
import { setting } from '../../../../../typings/setting'

const props = defineProps<{
  modelValue: setting
}>()

const emit = defineEmits(['update:modelValue'])

const message = useMessage()

const updateSetting = (key: keyof setting, value: any) => {
  const newSetting = { ...props.modelValue }
  newSetting[key] = value
  emit('update:modelValue', newSetting)
}

// 更新指定路径数组中某个索引的值
const updatePath = (key: 'resourcePaths' | 'videoResourcePaths', index: number, value: string) => {
  const newPaths = [...(props.modelValue[key] || [])]
  newPaths[index] = value
  updateSetting(key, newPaths)
}

// 添加路径
const addPath = (key: 'resourcePaths' | 'videoResourcePaths') => {
  const newPaths = [...(props.modelValue[key] || []), '']
  updateSetting(key, newPaths)
}

// 删除路径
const removePath = (key: 'resourcePaths' | 'videoResourcePaths', index: number) => {
  const newPaths = [...(props.modelValue[key] || [])]
  newPaths.splice(index, 1)
  updateSetting(key, newPaths)
}

// 选择资源路径
const selectPath = async (key: 'resourcePaths' | 'videoResourcePaths', index: number) => {
  try {
    const result = await window.electron.ipcRenderer.invoke('dialog:openDirectory')
    if (result && !result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0]
      // 检查是否重复
      const currentPaths = props.modelValue[key] || []
      if (currentPaths.includes(selectedPath)) {
        message.warning('该路径已存在')
        return
      }
      updatePath(key, index, selectedPath)
    }
  } catch (error) {
    message.error('选择文件夹失败')
  }
}
</script>

<style lang="scss" scoped>
.path-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.path-item {
  width: 100%;
}
</style>
