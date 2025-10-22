<template>
  <n-drawer v-bind="$attrs" placement="right" :width="360">
    <n-drawer-content title="下载队列">
      <div class="task-list">
        <div v-if="!queue.tasks.length" class="empty">暂无任务</div>
        <div v-for="t in queue.tasks" :key="t.id" class="task-item">
          <div class="task-main">
            <div class="title">
              <img :src="siteIcon(t.site)" class="site-icon" />
              <span class="name">{{ t.title }}</span>
            </div>
          </div>

          <div class="progress-actions" v-if="t.progress">
            <n-progress
              class="progress-flex"
              type="line"
              :show-indicator="false"
              :percentage="['success','existed'].includes(t.status) ? 100 : calcPercent(t)"
              :show-info="false"
              :status="progressStatus(t)"
              :height="6"
            />
            <div class="actions-inline">
              <n-button
                v-if="t.status === 'running'"
                quaternary
                circle
                size="tiny"
                @click="onPause(t)"
                title="暂停"
              >
                <n-icon size="16"><PauseOutline /></n-icon>
              </n-button>
              <n-button
                v-if="t.status === 'paused'"
                quaternary
                circle
                size="tiny"
                @click="onResume(t)"
                title="继续"
              >
                <n-icon size="16"><PlayOutline /></n-icon>
              </n-button>
              <!-- <n-button
                v-if="t.status === 'running'"
                quaternary
                circle
                size="tiny"
                type="warning"
                @click="onCancel(t)"
                title="取消"
              >
                <n-icon size="16"><CloseCircleOutline /></n-icon>
              </n-button> -->
              <n-button
                quaternary
                circle
                size="tiny"
                type="error"
                @click="onDelete(t)"
                title="删除"
              >
                <n-icon size="16"><TrashOutline /></n-icon>
              </n-button>
            </div>
          </div>
          <div class="progress-text" v-if="t.progress">
            <template v-if="t.progress.chapter">
              章节 {{ t.progress.chapter.index }}/{{ t.progress.chapter.total }}
            </template>
            <template v-if="t.progress.image">
              图片 {{ t.progress.image.index }}/{{ t.progress.image.total }}
            </template>
            <n-tag size="small" :type="statusType(t.status)" class="status-tag">{{ statusLabel(t.status) }}</n-tag>
          </div>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { NDrawer, NDrawerContent, NButton, NTag, NProgress, NIcon } from 'naive-ui'
import { queue } from '@renderer/plugins/store/downloadQueue'

function statusLabel(s: string) {
  const map: Record<string, string> = {
    pending: '排队中',
    running: '进行中',
    paused: '已暂停',
    success: '已完成',
    error: '错误',
    canceled: '已取消',
    existed: '已存在'
  }
  return map[s] || s
}

function statusType(s: string) {
  const map: Record<string, any> = {
    pending: 'info',
    running: 'success',
    paused: 'warning',
    success: 'success',
    error: 'error',
    canceled: 'default',
    existed: 'default'
  }
  return map[s] || 'default'
}

// 站点图标（与 layout 中相同资源）
import jmttImg from '@renderer/assets/jmtt.jpg'
import pixivImg from '@renderer/assets/pixiv.jpg'
import twitterImg from '@renderer/assets/twitter.jpg'
import { PauseOutline, PlayOutline, CloseCircleOutline, TrashOutline } from '@vicons/ionicons5'

function siteIcon(site: 'jmtt' | 'pixiv' | 'twitter') {
  if (site === 'jmtt') return jmttImg
  if (site === 'pixiv') return pixivImg
  return twitterImg
}

function calcPercent(t: any) {
  const p = t?.progress
  if (!p?.image?.total) return 0
  const idx = p.image.index || 0
  const total = p.image.total || 0
  if (total <= 0) return 0
  return Math.min(100, Math.floor((idx / total) * 100))
}
function progressStatus(t: any) {
  if (t.status === 'success') return 'success'
  if (t.status === 'error') return 'error'
  return 'info'
}

function onPause(t: any) {
  queue.pauseTask(t.id)
}
function onResume(t: any) {
  queue.resumeTask(t.id)
}
function onCancel(t: any) {
  queue.cancelTask(t.id)
}
function onDelete(t: any) {
  queue.deleteTask(t.id)
}
</script>

<style lang="scss">
.n-drawer.n-drawer--right-placement {
  top: 30px !important;
  bottom: 5px !important;
  right: 6px !important;
  border-radius: 20px;
}
.n-drawer-body-content-wrapper {
  padding: 5px !important;
}
.task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.empty {
  color: #999;
  text-align: center;
  padding: 24px 0;
}
.task-item {
  background: #f7f7f7;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 0px;
}
.task-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.site-icon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: cover;
}
.name {
  font-weight: 500;
}
.progress {
  font-size: 12px;
  color: #666;
}
.progress-bar {
  margin-top: 4px;
}
.progress-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.progress-flex {
  flex: 1 1 auto;
  min-width: 0;
}
.actions-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.progress-text {
  font-size: 12px;
  color: #666;
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.status-tag {
  margin-left: auto;
}
.actions {
  display: flex;
  gap: 6px;
}
</style>
