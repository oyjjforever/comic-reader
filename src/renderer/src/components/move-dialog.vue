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
    <!-- 工具栏：搜索 + 对选中节点的新建/删除（空文件夹） -->
    <div class="move-dialog-toolbar">
      <n-input
        v-model:value="searchKeyword"
        placeholder="搜索文件夹..."
        size="small"
        clearable
        class="move-dialog-search"
      >
        <template #prefix>
          <n-icon :component="SearchIcon" />
        </template>
      </n-input>
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button
            size="small"
            :disabled="!selectedPath"
            :loading="creating"
            @click="onCreateFolder"
          >
            <template #icon>
              <n-icon :component="FolderAddIcon" />
            </template>
            新建
          </n-button>
        </template>
        在选中的文件夹下创建子文件夹
      </n-tooltip>
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button
            size="small"
            :disabled="!selectedPath || selectedIsRoot"
            :loading="deleting"
            @click="onDeleteFolder"
          >
            <template #icon>
              <n-icon :component="DeleteIcon" />
            </template>
            删除
          </n-button>
        </template>
        删除选中的空文件夹
      </n-tooltip>
    </div>
    <n-spin :show="loading" size="small">
      <div class="move-dialog-tree-wrapper">
        <!-- 全量树（打开时一次性扫盘）：pattern 前端过滤 + 虚拟滚动 -->
        <n-tree
          v-if="displayTree.length"
          :data="displayTree"
          key-field="fullPath"
          label-field="name"
          :render-label="renderTreeLabel"
          :node-props="nodeProps"
          :selected-keys="selectedKeys"
          :expanded-keys="expandedKeys"
          :on-update:expanded-keys="onExpandedKeysUpdate"
          virtual-scroll
          block-line
          class="move-dialog-tree"
        />
        <div v-else-if="!loading" class="move-dialog-empty">
          {{ searchKeyword.trim() ? '未找到匹配的文件夹' : '目录为空' }}
        </div>
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
import {
  NButton,
  NSpin,
  NSpace,
  NInput,
  NIcon,
  NTooltip,
  useDialog,
  useMessage
} from 'naive-ui'
import { Search24Regular, FolderAdd24Regular, Delete24Regular } from '@vicons/fluent'
import { ref, computed, watch, onMounted } from 'vue'

interface MoveDialogProps {
  show: boolean
  resourcePaths: string[]
  provideTree: (rootPath: string) => Promise<any[]>
  items: any[]
  /** 模块标识（book/video），全量树缓存按模块区分 */
  namespace?: string
  // 禁止作为目标的路径（如被移动的文件夹本身）
  invalidDestinations?: string[]
  moving?: boolean
}

const props = withDefaults(defineProps<MoveDialogProps>(), {
  invalidDestinations: () => [],
  moving: false,
  namespace: 'default'
})

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'confirm', destFolderPath: string): void
  /** 弹窗内树结构变化过（新建/删除文件夹）时，关闭弹窗一次性通知父组件刷新 */
  (e: 'tree-changed', parentPaths: string[]): void
}>()

const dialog = useDialog()
const message = useMessage()

// 全量树模块级缓存：同一模块（namespace+资源根）只扫盘一次，
// 弹窗内新建/删除直接改树对象（引用共享，缓存自动同步）
const moduleTreeCache = new Map<string, any[]>()

const loading = ref(false)
// 弹窗内新建/删除涉及的父目录（关闭时一次性汇报，避免逐步刷新外层树）
const dirtyParents = new Set<string>()
const selectedKeys = ref<string[]>([])
const creating = ref(false)
const deleting = ref(false)

const SearchIcon = Search24Regular
const FolderAddIcon = FolderAdd24Regular
const DeleteIcon = Delete24Regular

const rootPaths = computed(() => props.resourcePaths.filter(Boolean))

// 全量目录树（打开弹窗时一次性递归扫盘构建，弹窗生命周期内为唯一数据源；
// 搜索/展开/新建/删除全部操作这份数据，无懒加载）
const fullTree = ref<any[]>([])

const selectedPath = computed(() => selectedKeys.value[0] || '')

// 选中的是否为资源库根节点（根不可删除）
const selectedIsRoot = computed(() => rootPaths.value.includes(selectedPath.value))

const displayNames = computed(() => {
  const names = props.items.map((item) => item.name).filter(Boolean)
  if (names.length <= 3) return names.join('、')
  return `${names.slice(0, 3).join('、')} 等 ${names.length} 项`
})

// ===== 全量树构建（每模块只扫盘一次，之后走缓存） =====

const searchKeyword = ref('')

const cacheKey = computed(
  () => `${props.namespace}|${rootPaths.value.join('||')}`
)

const buildFullTree = async () => {
  loading.value = true
  try {
    // 不复用 props.provideTree：书架模式它会过滤"无子目录"的文件夹，
    // 移动目标树需要显示全部文件夹（含空的最叶节点），固定用不过滤形态
    const buildNode = async (path: string, name?: string, isRoot = false): Promise<any> => {
      let children: any[] = []
      try {
        children = await window.media.getFolderTree(path, false)
      } catch {
        /* 单个分支失败跳过 */
      }
      const built = await Promise.all(
        children.map((c: any) => buildNode(c.fullPath, c.name, false))
      )
      return {
        name: name ?? path,
        fullPath: path,
        isRoot,
        disabled: isNodeDisabled({ fullPath: path }),
        // 无子目录的节点标记为叶子（不显示展开箭头）
        isLeaf: built.length === 0,
        children: built
      }
    }
    fullTree.value = await Promise.all(
      rootPaths.value.map((p) => buildNode(p, p, true))
    )
    moduleTreeCache.set(cacheKey.value, fullTree.value)
  } finally {
    loading.value = false
  }
}

// ===== 搜索过滤与高亮 =====

// 节点匹配：不区分大小写，节点名或完整路径任一命中
const matchNode = (option: any, kw: string) =>
  String(option.name ?? '').toLowerCase().includes(kw) ||
  String(option.fullPath ?? '').toLowerCase().includes(kw)

// 子树过滤：匹配的节点整棵子树保留；未匹配的节点仅在其子树有命中时
// 作为路径祖先保留（裁掉未命中分支）
const filterSubtree = (nodes: any[], kw: string): any[] => {
  const out: any[] = []
  for (const node of nodes) {
    if (matchNode(node, kw)) {
      out.push(node)
    } else {
      const children = Array.isArray(node.children) ? filterSubtree(node.children, kw) : []
      if (children.length > 0) {
        out.push({ ...node, children })
      }
    }
  }
  return out
}

// 过滤结果中需要展开的全部 key（匹配子树全展开）
const collectKeys = (nodes: any[], out: string[] = []): string[] => {
  for (const node of nodes) {
    if (node.fullPath) out.push(node.fullPath)
    if (Array.isArray(node.children) && node.children.length) collectKeys(node.children, out)
  }
  return out
}

// 搜索时显示过滤后的子树；非搜索显示全量树
const displayTree = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) return fullTree.value
  return filterSubtree(fullTree.value, kw)
})

// 受控展开：进入搜索时全展开匹配子树；清除搜索时收起到只展开资源根
const expandedKeys = ref<string[]>([])
const onExpandedKeysUpdate = (keys: any[]) => {
  expandedKeys.value = keys
}
watch(searchKeyword, (kw) => {
  if (kw.trim()) {
    expandedKeys.value = collectKeys(displayTree.value)
  } else {
    // 清除搜索：收起到只展开资源根
    expandedKeys.value = [...rootPaths.value]
  }
})

// 高亮节点名中的匹配片段（render-label）
const renderTreeLabel = ({ option }: { option: any }) => {
  const name = String(option.name ?? '')
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) return name
  const idx = name.toLowerCase().indexOf(kw)
  if (idx < 0) return name
  return h('span', { class: 'md-tree-label' }, [
    name.slice(0, idx),
    h('span', { class: 'md-tree-label__hit' }, name.slice(idx, idx + kw.length)),
    name.slice(idx + kw.length)
  ])
}

// ===== 树节点 =====

// 根节点始终可选；被移动的文件夹本身不可作为目标
const isNodeDisabled = (option: any) => {
  return props.invalidDestinations.includes(option.fullPath)
}

const nodeProps = ({ option }: { option: any }) => {
  return {
    // 文本单行省略后，悬浮显示完整路径
    title: option.fullPath,
    onClick() {
      selectedKeys.value = isNodeDisabled(option) ? [] : [option.fullPath]
    }
  }
}

// 在全量树中查找节点
const findNode = (nodes: any[], fullPath: string): any => {
  for (const node of nodes) {
    if (node.fullPath === fullPath) return node
    if (node.children) {
      const found = findNode(node.children, fullPath)
      if (found) return found
    }
  }
  return null
}

const getParentPath = (fullPath: string): string => {
  const p = fullPath.replace(/[\\/]+$/, '')
  const idx = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return idx > 0 ? p.slice(0, idx) : ''
}

// ===== 新建 / 删除空文件夹 =====

const onCreateFolder = () => {
  const parentPath = selectedPath.value
  if (!parentPath) return
  const folderName = ref('')
  dialog.info({
    title: '创建文件夹',
    content: () =>
      h('div', [
        h(
          'p',
          { style: 'margin: 0 0 8px;font-size: 12px;color: #6b7280;word-break: break-all;' },
          parentPath
        ),
        h(NInput, {
          value: folderName.value,
          'onUpdate:value': (v: string) => (folderName.value = v),
          placeholder: '请输入文件夹名称',
          autofocus: true
        })
      ]),
    positiveText: '创建',
    negativeText: '取消',
    onPositiveClick: async () => {
      const name = folderName.value.trim()
      if (!name) {
        message.error('文件夹名称不能为空')
        return false
      }
      creating.value = true
      try {
        const res = await window.systemInterface.createFolder(parentPath, name)
        if (!res.success) {
          message.error(`创建文件夹失败: ${res.error || '未知错误'}`)
          return false
        }
        message.success(`文件夹"${name}"创建成功`)
        const fullPath = `${parentPath.replace(/[\\/]+$/, '')}\\${name}`
        // 直接写入全量树（书架模式的 provideTree 会过滤空文件夹，重载拿不到它）。注意：
        // - 新节点不能标 isLeaf，否则之后在它下面再建文件夹不会渲染
        // - 补插后父节点必然可展开，清掉其 isLeaf
        const node = findNode(fullTree.value, parentPath)
        if (node) {
          const child = { name, fullPath, disabled: false }
          if (Array.isArray(node.children)) {
            if (!node.children.some((c: any) => c.fullPath === fullPath)) {
              node.children.push(child)
            }
          } else {
            node.children = [child]
          }
          node.isLeaf = false
        }
        dirtyParents.add(parentPath)
        return true
      } finally {
        creating.value = false
      }
    }
  })
}

const onDeleteFolder = () => {
  const target = selectedPath.value
  if (!target || selectedIsRoot.value) return
  dialog.warning({
    title: '删除空文件夹',
    content: `确定删除空文件夹"${target}"？仅允许删除空文件夹。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      deleting.value = true
      try {
        const res = await window.systemInterface.deleteFolderIfEmpty(target)
        if (!res.success) {
          message.error(`删除失败: ${res.error || '未知错误'}`)
          return
        }
        message.success('空文件夹已删除')
        const parentPath = getParentPath(target)
        // 从全量树中移除该节点
        const parent = parentPath ? findNode(fullTree.value, parentPath) : null
        if (parent && Array.isArray(parent.children)) {
          parent.children = parent.children.filter((c: any) => c.fullPath !== target)
        }
        selectedKeys.value = []
        dirtyParents.add(parentPath)
      } finally {
        deleting.value = false
      }
    }
  })
}

// ===== 弹窗生命周期 =====

// 打开弹窗时重置状态：命中缓存秒开，否则扫盘构建；关闭时一次性汇报树结构变化
watch(
  () => props.show,
  (show) => {
    if (show) {
      selectedKeys.value = []
      searchKeyword.value = ''
      expandedKeys.value = [...rootPaths.value]
      dirtyParents.clear()
      const cached = moduleTreeCache.get(cacheKey.value)
      if (cached) {
        fullTree.value = cached
      } else {
        fullTree.value = []
        buildFullTree()
      }
    } else if (dirtyParents.size > 0) {
      const parents = Array.from(dirtyParents)
      dirtyParents.clear()
      emit('tree-changed', parents)
    }
  }
)

// 首次挂载时如果弹窗已打开，也构建目录树
onMounted(() => {
  if (props.show && !moduleTreeCache.has(cacheKey.value)) buildFullTree()
})

// 外层库结构变化（移动/删除作品等）时由父组件调用，丢弃缓存下次重扫
const invalidateCache = () => {
  moduleTreeCache.delete(cacheKey.value)
}
defineExpose({ invalidateCache })

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

.move-dialog-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;

  .move-dialog-search {
    flex: 1;
  }
}

.move-dialog-tree-wrapper {
  height: 320px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 4px;
  position: relative;

  .move-dialog-tree {
    font-size: 13px;
  }

  /* 节点文本单行省略（naive-ui 的文本元素收敛在一行内） */
  :deep(.n-tree-node) {
    overflow: hidden;
  }

  :deep(.n-tree-node-content),
  :deep(.n-tree-node__text),
  :deep(.n-tree-node-content__text) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.md-tree-label) {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
  }

  :deep(.md-tree-label__hit) {
    color: #18a058;
    font-weight: 600;
  }

  .move-dialog-search-hint {
    margin-bottom: 4px;
  }

  .move-dialog-empty {
    padding: 24px 0;
    text-align: center;
    font-size: 12px;
    color: #9ca3af;
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
