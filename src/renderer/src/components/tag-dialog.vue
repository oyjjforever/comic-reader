<template>
  <div>
    <n-modal
      :show="showModal"
      @update:show="(value) => (showModal = value)"
      :mask-closable="false"
      preset="dialog"
      :title="dialogTitle"
      style="width: 500px; max-width: 90vw"
    >
      <template #header>
        <div class="dialog-header">
          <span>{{ dialogTitle }}</span>
          <span v-if="mode === 'assign'" class="media-name">{{ mediaName }}</span>
        </div>
      </template>

      <div class="tag-container">
        <div class="tag-list">
          <div v-if="tags.length === 0" class="empty-tags">暂无标签，请先添加标签</div>
          <div v-else class="tag-items">
            <div v-for="tag in tags" :key="tag.id" class="tag-item">
              <div class="tag-content">
                <!-- 标签显示/编辑部分 -->
                <div class="tag-display">
                  <template v-if="mode === 'manage'">
                    <span v-if="!editingTagId || editingTagId !== tag.id" class="tag-label">{{
                      tag.label
                    }}</span>
                    <n-tooltip v-else trigger="hover">
                      回车保存
                      <template #trigger>
                        <n-input
                          :value="editingTagName"
                          @input="(value) => (editingTagName = value)"
                          size="small"
                          style="width: 120px"
                          @blur="cancelEdit"
                          @keyup.enter="saveEdit"
                          @keyup.esc="cancelEdit"
                        />
                      </template>
                    </n-tooltip>
                  </template>
                  <template v-else>
                    <n-checkbox
                      :checked="selectedTagIds.includes(tag.id)"
                      @update:checked="(checked) => handleTagCheck(tag.id, checked)"
                    >
                      <span v-if="!editingTagId || editingTagId !== tag.id">{{ tag.label }}</span>
                      <n-tooltip v-else trigger="hover">
                        回车保存
                        <template #trigger>
                          <n-input
                            :value="editingTagName"
                            @input="(value) => (editingTagName = value)"
                            size="small"
                            style="width: 120px"
                            @blur="cancelEdit"
                            @keyup.enter="saveEdit"
                            @keyup.esc="cancelEdit"
                          />
                        </template>
                      </n-tooltip>
                    </n-checkbox>
                  </template>
                </div>

                <!-- 标签操作按钮 -->
                <div class="tag-actions">
                  <template v-if="tag.type !== 'folder'">
                    <n-button
                      v-if="!editingTagId || editingTagId !== tag.id"
                      size="small"
                      quaternary
                      circle
                      @click="startEdit(tag)"
                    >
                      <template #icon>
                        <n-icon><edit-icon /></n-icon>
                      </template>
                    </n-button>
                    <n-button
                      v-if="editingTagId === tag.id"
                      size="small"
                      quaternary
                      circle
                      @click="cancelEdit"
                    >
                      <template #icon>
                        <n-icon><close-icon /></n-icon>
                      </template>
                    </n-button>
                  </template>
                  <n-button
                    v-if="!editingTagId || editingTagId !== tag.id"
                    size="small"
                    quaternary
                    circle
                    type="error"
                    @click="confirmDeleteTag(tag)"
                  >
                    <template #icon>
                      <n-icon><delete-icon /></n-icon>
                    </template>
                  </n-button>
                  <n-button
                    size="small"
                    quaternary
                    circle
                    :disabled="isFirstTag(tag)"
                    @click="moveTagUp(tag)"
                  >
                    <template #icon>
                      <n-icon><arrow-up-icon /></n-icon>
                    </template>
                  </n-button>
                  <n-button
                    size="small"
                    quaternary
                    circle
                    :disabled="isLastTag(tag)"
                    @click="moveTagDown(tag)"
                  >
                    <template #icon>
                      <n-icon><arrow-down-icon /></n-icon>
                    </template>
                  </n-button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="add-tag-section">
          <n-input
            :value="newTagName"
            @input="(value) => (newTagName = value)"
            placeholder="输入新标签名称"
            @keyup.enter="addNewTag"
          />
          <n-button
            type="primary"
            :disabled="!newTagName.trim()"
            @click="addNewTag"
            style="margin-left: 8px"
          >
            新增标签
          </n-button>
        </div>
      </div>

      <!-- 只在给作品添加标签模式显示底部按钮 -->
      <template v-if="mode === 'assign'" #action>
        <n-button @click="closeModal">取消</n-button>
        <n-button type="primary" @click="confirmSelection">确定</n-button>
      </template>
    </n-modal>

    <!-- 删除确认对话框 -->
    <n-modal
      :show="showDeleteDialog"
      @update:show="(value) => (showDeleteDialog = value)"
      preset="dialog"
      type="warning"
      title="删除标签"
      style="width: 400px; max-width: 90vw"
    >
      确定要删除标签 "{{ tagToDelete && tagToDelete.label }}" 吗？
      <template #action>
        <n-button @click="showDeleteDialog = false">取消</n-button>
        <n-button type="error" @click="deleteTag">删除</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  NModal,
  NCheckbox,
  NButton,
  NInput,
  useMessage,
  NIcon,
  useDialog,
  NTooltip
} from 'naive-ui'
import {
  Create as EditIcon,
  Checkmark as CheckIcon,
  Close as CloseIcon,
  Trash as DeleteIcon,
  ChevronUpOutline as ArrowUpIcon,
  ChevronDownOutline as ArrowDownIcon
} from '@vicons/ionicons5'

interface Tag {
  id: number
  label: string
  sort_order?: number
  created_at?: Date
}

interface Props {
  show: boolean
  mediaPath: string
  mediaName: string
  mode?: 'manage' | 'assign' // manage: 标签维护模式, assign: 给作品添加标签模式
  namespace?: string // 命名空间，用于区分不同模块的标签集合
}

interface Emits {
  (e: 'update:show', value: boolean): void
  (e: 'confirm'): void
  (e: 'change', tags: Tag[]): void
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'assign', // 默认为给作品添加标签模式
  namespace: 'default' // 默认命名空间
})
const emit = defineEmits<Emits>()
const message = useMessage()
const dialog = useDialog()

const showModal = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value)
})

// 根据模式确定对话框标题
const dialogTitle = computed(() => {
  return props.mode === 'manage' ? '管理标签' : '设置标签'
})

const tags = ref<Tag[]>([])
const selectedTagIds = ref<number[]>([])
const newTagName = ref('')
const favoriteId = ref<number | null>(null)
const isLoading = ref(false)
const editingTagId = ref<number | null>(null)
const editingTagName = ref('')
const showDeleteDialog = ref(false)
const tagToDelete = ref<Tag | null>(null)

// 加载所有标签
const loadTags = async () => {
  try {
    const res = await window.tag.getTags(undefined, props.namespace)
    tags.value = props.mode === 'manage' ? res : res.filter((_) => _.type !== 'folder')
  } catch (error) {
    message.error('加载标签失败')
  }
}

// 加载当前媒体文件的收藏信息和标签（仅在给作品添加标签模式）
const loadFavoriteTags = async () => {
  // 如果是标签维护模式，不需要加载收藏标签
  if (props.mode === 'manage') return

  try {
    // 检查是否已收藏
    const isFavorited = await window.favorite.isFavorited(props.mediaPath, props.namespace)

    if (isFavorited) {
      // 获取收藏信息
      const favorites = await window.favorite.getFavorites('id DESC', props.namespace)
      const currentFavorite = favorites.find((fav) => fav.fullPath === props.mediaPath)

      if (currentFavorite && currentFavorite.id) {
        favoriteId.value = currentFavorite.id
        // 获取收藏的标签
        const favoriteTags = await window.favorite.getFavoriteTags(currentFavorite.id)
        selectedTagIds.value = favoriteTags.map((tag) => tag.id)
      }
    }
  } catch (error) {
    message.error('加载收藏标签失败')
  }
}

// 处理标签选择
const handleTagCheck = (tagId: number, checked: boolean) => {
  if (checked) {
    if (!selectedTagIds.value.includes(tagId)) {
      selectedTagIds.value.push(tagId)
    }
  } else {
    const index = selectedTagIds.value.indexOf(tagId)
    if (index > -1) {
      selectedTagIds.value.splice(index, 1)
    }
  }
}

// 添加新标签
const addNewTag = async () => {
  const tagName = newTagName.value.trim()
  if (!tagName) return

  try {
    isLoading.value = true
    const newTagId = await window.tag.addTag(tagName, props.namespace)
    // 重新加载标签列表
    await loadTags()
    // 自动选中新添加的标签
    selectedTagIds.value.push(newTagId)
    newTagName.value = ''
    message.success('标签添加成功')
  } catch (error) {
    message.error(`添加标签失败: ${error}`)
  } finally {
    isLoading.value = false
  }
}

// 确认选择
const confirmSelection = async () => {
  // 检查是否已选择标签
  if (selectedTagIds.value.length === 0) {
    message.warning('请至少选择一个标签')
    return
  }

  try {
    if (favoriteId.value) {
      // 已收藏，更新标签
      await window.favorite.updateFavoriteTags(favoriteId.value, selectedTagIds.value.toString())
      message.success('标签更新成功')
    } else {
      // 未收藏，添加收藏和标签
      await window.favorite.addFavorite(
        props.mediaPath,
        props.namespace,
        selectedTagIds.value.toString()
      )
      message.success('添加收藏成功')
    }

    emit('confirm')
    closeModal()
  } catch (error) {
    message.error(`操作失败: ${error}`)
  }
}

// 关闭弹窗
const closeModal = () => {
  showModal.value = false
}

// 开始编辑标签
const startEdit = (tag: Tag) => {
  editingTagId.value = tag.id
  editingTagName.value = tag.label
}

// 保存编辑
const saveEdit = async () => {
  if (!editingTagId.value || !editingTagName.value.trim()) {
    return
  }

  try {
    await window.tag.updateTag(editingTagId.value, editingTagName.value.trim())

    // 更新标签列表中的标签名称
    const tagIndex = tags.value.findIndex((tag) => tag.id === editingTagId.value)
    if (tagIndex !== -1) {
      tags.value[tagIndex].label = editingTagName.value.trim()
    }

    // 如果编辑的标签是当前选中的标签，不需要做额外处理，因为ID没有改变

    editingTagId.value = null
    editingTagName.value = ''
    message.success('标签更新成功')
  } catch (error) {
    message.error(`更新标签失败: ${error}`)
  }
}

// 取消编辑
const cancelEdit = () => {
  editingTagId.value = null
  editingTagName.value = ''
}

// 确认删除标签
const confirmDeleteTag = (tag: Tag) => {
  tagToDelete.value = tag
  showDeleteDialog.value = true
}

// 删除标签
const deleteTag = async () => {
  if (!tagToDelete.value) return

  try {
    // 检查标签是否被收藏使用
    const favorites = await window.favorite.getFavorites('id DESC', props.namespace)
    const favoritesUsingTag = favorites.filter((fav) => {
      if (!fav.tags) return false
      const tagIds = fav.tags
        .split(',')
        .map((id) => parseInt(id.trim()))
        .filter((id) => !isNaN(id))
      return tagIds.includes(tagToDelete.value!.id)
    })

    if (favoritesUsingTag.length > 0) {
      // 如果有收藏使用该标签，显示二次确认对话框
      const confirmed = await showSecondConfirmDialog(favoritesUsingTag.length)
      if (!confirmed) {
        showDeleteDialog.value = false
        return
      }
    }

    // 删除标签
    await window.tag.deleteTag(tagToDelete.value.id)

    // 从标签列表中移除
    const index = tags.value.findIndex((tag) => tag.id === tagToDelete.value!.id)
    if (index !== -1) {
      tags.value.splice(index, 1)
    }

    // 从选中的标签中移除
    const selectedIndex = selectedTagIds.value.indexOf(tagToDelete.value.id)
    if (selectedIndex > -1) {
      selectedTagIds.value.splice(selectedIndex, 1)
    }

    showDeleteDialog.value = false
    tagToDelete.value = null
    message.success('标签删除成功')
  } catch (error) {
    message.error(`删除标签失败: ${error}`)
  }
}

// 显示二次确认对话框
const showSecondConfirmDialog = (count: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const d = dialog.warning({
      title: '删除确认',
      content: `该标签已被 ${count} 个收藏使用，删除后将从这些收藏中移除此标签。确定要删除吗？`,
      positiveText: '确定删除',
      negativeText: '取消',
      onPositiveClick: () => {
        resolve(true)
      },
      onNegativeClick: () => {
        resolve(false)
      }
    })
  })
}

// 检查是否为第一个标签
const isFirstTag = (tag: Tag): boolean => {
  const sortedTags = [...tags.value].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  return sortedTags[0]?.id === tag.id
}

// 检查是否为最后一个标签
const isLastTag = (tag: Tag): boolean => {
  const sortedTags = [...tags.value].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  return sortedTags[sortedTags.length - 1]?.id === tag.id
}

// 上移标签
const moveTagUp = async (tag: Tag) => {
  try {
    const sortedTags = [...tags.value].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    const currentIndex = sortedTags.findIndex((t) => t.id === tag.id)

    if (currentIndex <= 0) return // 已经是第一个了

    const previousTag = sortedTags[currentIndex - 1]

    // 交换排序值
    const tagSorts = [
      { id: tag.id, sortOrder: previousTag.sort_order || 0 },
      { id: previousTag.id, sortOrder: tag.sort_order || 0 }
    ]

    await window.tag.updateTagsSortOrder(tagSorts)

    // 重新加载标签列表
    await loadTags()

    message.success('标签上移成功')
  } catch (error) {
    message.error(`标签上移失败: ${error}`)
  }
}

// 下移标签
const moveTagDown = async (tag: Tag) => {
  try {
    const sortedTags = [...tags.value].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    const currentIndex = sortedTags.findIndex((t) => t.id === tag.id)

    if (currentIndex >= sortedTags.length - 1) return // 已经是最后一个了

    const nextTag = sortedTags[currentIndex + 1]

    // 交换排序值
    const tagSorts = [
      { id: tag.id, sortOrder: nextTag.sort_order || 0 },
      { id: nextTag.id, sortOrder: tag.sort_order || 0 }
    ]

    await window.tag.updateTagsSortOrder(tagSorts)

    // 重新加载标签列表
    await loadTags()

    message.success('标签下移成功')
  } catch (error) {
    message.error(`标签下移失败: ${error}`)
  }
}

onMounted(async () => {
  selectedTagIds.value = []
  favoriteId.value = null
  newTagName.value = ''
  editingTagId.value = null
  editingTagName.value = ''
  await loadTags()
  await loadFavoriteTags()
  watch(
    () => tags.value,
    (newTags) => {
      emit('change', newTags)
    },
    { deep: true }
  )
})
</script>

<style scoped>
.dialog-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.media-name {
  font-size: 12px;
  color: #666;
  font-weight: normal;
}

.tag-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 400px;
}

.tag-list {
  flex: 1;
  overflow-y: auto;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 12px;
  min-height: 200px;
}

.empty-tags {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100px;
  color: #999;
  font-style: italic;
}

.tag-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tag-display {
  flex: 1;
  display: flex;
  align-items: center;
}

.tag-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.add-tag-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag-label {
  flex: 1;
  font-size: 14px;
  line-height: 1.5;
}
</style>
