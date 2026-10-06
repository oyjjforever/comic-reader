<template>
  <n-modal
    :show="show"
    preset="card"
    title="移动到..."
    style="width: 520px"
    :bordered="false"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <div class="move-dialog-summary">
      <span class="move-dialog-count">共 {{ items.length }} 项</span>
      <span class="move-dialog-names" :title="displayNames">{{ displayNames }}</span>
    </div>
    <n-spin :show="loading" size="small">
      <div class="move-dialog-tree-wrapper">
        <n-tree
          :data="treeData"
          key-field="fullPath"
          label-field="name"
          :on-load="handleLoad"
          :node-props="nodeProps"
          :selected-keys="selectedKeys"
          :default-expanded-keys="rootPaths"
          block-line
          class="move-dialog-tree"
        />
      </div>
    </n-spin>
    <template #footer>
      <div class="move-dialog-footer">
        <span class="move-dialog-dest" :title="selectedPath">
          目标：{{ selectedPath || '请选择目标文件夹' }}
        </span>
        <n-space :size="8">
          <n-button size="small" @click="emit('update:show', false)">取消</n-button>
          <n-button
            size="small"
            type="primary"
            :disabled="!selectedPath"
            :loading="moving"
            @click="handleConfirm"
          >
            移动
          </n-button>
        </n-space>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { NButton, NSpin, NSpace } from 'naive-ui'
import { ref, computed, watch, onMounted } from 'vue'

interface MoveDialogProps {
  show: boolean
  resourcePaths: string[]
  provideTree: (rootPath: string) => Promise<any[]>
  items: any[]
  // 禁止作为目标的路径（如被移动的文件夹本身）
  invalidDestinations?: string[]
  moving?: boolean
}

const props = withDefaults(defineProps<MoveDialogProps>(), {
  invalidDestinations: () => [],
  moving: false
})

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'confirm', destFolderPath: string): void
}>()

const loading = ref(false)
const selectedKeys = ref<string[]>([])

const rootPaths = computed(() => props.resourcePaths.filter(Boolean))

const treeData = ref<any[]>([])

const selectedPath = computed(() => selectedKeys.value[0] || '')

const displayNames = computed(() => {
  const names = props.items.map((item) => item.name).filter(Boolean)
  if (names.length <= 3) return names.join('、')
  return `${names.slice(0, 3).join('、')} 等 ${names.length} 项`
})

// 构建根节点并预加载其子目录（与侧边栏文件夹树一致的加载方式）
const buildTreeData = async () => {
  loading.value = true
  try {
    treeData.value = await Promise.all(
      rootPaths.value.map(async (p) => {
        try {
          const children = await props.provideTree(p)
          return {
            name: p,
            fullPath: p,
            isRoot: true,
            disabled: isNodeDisabled({ fullPath: p }),
            children: withDisabled(children)
          }
        } catch (error) {
          console.warn(`Failed to load tree for path ${p}:`, error)
          return { name: p, fullPath: p, isRoot: true, disabled: false, children: [] }
        }
      })
    )
  } finally {
    loading.value = false
  }
}

// 根节点始终可选；被移动的文件夹本身不可作为目标
const isNodeDisabled = (option: any) => {
  return props.invalidDestinations.includes(option.fullPath)
}

// 为节点标记 disabled 字段（n-tree 按节点字段识别禁用状态）
const withDisabled = (nodes: any[]) =>
  nodes.map((node) => ({ ...node, disabled: isNodeDisabled(node) }))

const nodeProps = ({ option }: { option: any }) => {
  return {
    onClick() {
      selectedKeys.value = isNodeDisabled(option) ? [] : [option.fullPath]
    }
  }
}

// 懒加载更深层的子节点
const handleLoad = async (node: any) => {
  try {
    loading.value = true
    node.children = withDisabled(await props.provideTree(node.fullPath))
  } finally {
    loading.value = false
  }
}

// 打开弹窗时重置选择状态并构建目录树
watch(
  () => props.show,
  (show) => {
    if (show) {
      selectedKeys.value = []
      buildTreeData()
    }
  }
)

// 首次挂载时如果弹窗已打开，也构建目录树
onMounted(() => {
  if (props.show) buildTreeData()
})

const handleConfirm = () => {
  if (!selectedPath.value) return
  emit('confirm', selectedPath.value)
}
</script>

<style lang="scss" scoped>
.move-dialog-summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  color: #6b7280;

  .move-dialog-count {
    flex-shrink: 0;
  }

  .move-dialog-names {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.move-dialog-tree-wrapper {
  height: 320px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 4px;

  .move-dialog-tree {
    font-size: 13px;
  }
}

.move-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  .move-dialog-dest {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: #374151;
  }
}
</style>
