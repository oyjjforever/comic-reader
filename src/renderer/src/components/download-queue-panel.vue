<template>
  <n-drawer v-bind="$attrs" placement="right" :width="360">
    <n-drawer-content>
      <template #header>
        <div class="drawer-header">
          <span>任务队列</span>
          <n-button size="tiny" quaternary @click="onClearFinished">清除已完成</n-button>
        </div>
      </template>
      <div class="task-list">
        <div v-if="!queue.tasks.length" class="empty">暂无任务</div>
        <VirtualGrid
          v-else
          :items="queue.tasks"
          :item-width="322"
          :item-height="90"
          :gap="8"
          key-field="id"
          :overscan="2"
          class="download-virtual-grid"
        >
          <template #default="{ item: t }">
            <div class="task-item">
              <div class="task-main">
                <div class="title">
                  <img v-if="siteIcon(t.site)" :src="siteIcon(t.site)" class="site-icon" />
                  <n-icon
                    v-else
                    :component="FolderArrowRight24Regular"
                    size="20"
                    class="site-icon-fallback"
                  />
                  <n-ellipsis class="name" style="max-width: 250px">
                    {{ t.title }}
                  </n-ellipsis>
                  <n-tag
                    size="small"
                    :bordered="false"
                    :type="statusType(t.status)"
                    class="status-tag"
                    >{{ statusLabel(t.status, t) }}</n-tag
                  >
                </div>
              </div>

              <div class="progress-actions">
                <n-progress
                  v-if="t.progress"
                  class="progress-flex"
                  type="line"
                  :show-indicator="false"
                  :percentage="
                    ['success', 'error', 'existed'].includes(t.status) ? 100 : calcPercent(t)
                  "
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
                  <n-button
                    v-if="['error', 'canceled'].includes(t.status)"
                    quaternary
                    circle
                    size="tiny"
                    @click="onRetry(t)"
                    title="重试"
                  >
                    <n-icon size="16"><RefreshOutline /></n-icon>
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
              <div class="progress-text">
                <template v-if="['success', 'running'].includes(t.status) && t.progress">
                  <div style="color: green">{{ t.progress.success || 0 }}</div>
                  /
                  <div style="color: red">{{ t.progress.fail || 0 }}</div>
                  /
                  <div>{{ t.progress.total || 0 }}</div>
                  <div
                    v-if="
                      t.site === 'local-move' &&
                      ['running', 'paused'].includes(t.status) &&
                      t.progress.value !== undefined
                    "
                    class="move-percent"
                  >
                    <span v-if="t.progress.sizeTotal > 0" class="move-size">
                      {{ formatFileSize(t.progress.sizeDone || 0) }} /
                      {{ formatFileSize(t.progress.sizeTotal) }}
                    </span>
                  </div>
                </template>
                <div v-if="t.status === 'error' && t.errorMessage" class="error-msg">
                  {{ t.errorMessage }}
                </div>
                <n-ellipsis v-if="t.localFilePath" style="max-width: 100%; cursor: pointer">
                  <span @click="onOpenLocalFile(t.localFilePath)">{{ t.localFilePath }}</span>
                </n-ellipsis>
              </div>
            </div>
          </template>
        </VirtualGrid>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import VirtualGrid from './virtual-grid.vue'
import { queue } from '@renderer/plugins/store/downloadQueue'

function statusLabel(s: string, t?: any) {
  // 本地移动任务运行中显示"移动中"
  if (t?.site === 'local-move' && s === 'running') return '移动中'
  const map: Record<string, string> = {
    pending: '队列中',
    running: '下载中',
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
    pending: 'default',
    running: 'info',
    paused: 'warning',
    success: 'success',
    error: 'error',
    canceled: 'warning',
    existed: 'success'
  }
  return map[s] || 'default'
}

// 站点图标（与 layout 中相同资源）
import jmttImg from '@renderer/assets/jmtt.jpg'
import pixivImg from '@renderer/assets/pixiv.jpg'
import twitterImg from '@renderer/assets/twitter.jpg'
import weiboImg from '@renderer/assets/weibo.ico'
import picamanImg from '@renderer/assets/picaman.ico'
import huangguoImg from '@renderer/assets/huangguo.png'
import yfantasyImg from '@renderer/assets/yfantasy.png'
import pornhubImg from '@renderer/assets/pornhub.ico'
import fourkhdImg from '@renderer/assets/4khd.png'
import {
  PauseOutline,
  PlayOutline,
  CloseCircleOutline,
  TrashOutline,
  RefreshOutline
} from '@vicons/ionicons5'
import { FolderArrowRight24Regular } from '@vicons/fluent'
import { formatFileSize } from '@renderer/utils/format'

function siteIcon(site: string): string | undefined {
  // 本地移动等非站点任务无图标，模板回退为通用图标
  if (site === 'local-move') return undefined
  if (site === 'jmtt') return jmttImg
  if (site === 'pixiv') return pixivImg
  if (site === 'twitter') return twitterImg
  if (site === 'weibo') return weiboImg
  if (site === 'picaman') return picamanImg
  if (site === 'huangguo') return huangguoImg
  if (site === 'yfantasy') return yfantasyImg
  if (site === '4khd') return fourkhdImg
  if (site === 'pornhub') return pornhubImg
  return undefined
}

function calcPercent(t: any) {
  const p = t?.progress || {}
  if (p.value) return p.value
  if (!p.total) return 0
  const completed = (p.success || 0) + (p.fail || 0)
  return Math.min(100, Math.floor((completed / p.total) * 100))
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
function onRetry(t: any) {
  queue.retryTask(t.id)
}
function onCancel(t: any) {
  queue.cancelTask(t.id)
}
function onDelete(t: any) {
  queue.deleteTask(t.id)
}
function onClearFinished() {
  queue.clearCompletedTask()
}
function onOpenLocalFile(path) {
  window.systemInterface.openExplorer(path)
}
</script>

<style lang="scss">
// 任务队列抽屉：悬浮右侧的白色毛玻璃面板，与全局弹窗/右键菜单琉璃白同族
// （斜向白反光 + 0.78 白底 + 强模糊高饱和，暗调发丝边 + 内嵌白高光）
.n-drawer.n-drawer--right-placement {
  top: 30px !important;
  bottom: 5px !important;
  right: 6px !important;
  border-radius: 16px !important;
  background: linear-gradient(115deg, transparent 0%, rgba(255, 255, 255, 0.35) 100%, transparent 50%),
    rgba(255, 255, 255, 0.78) !important;
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(31, 28, 40, 0.1) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 12px 32px -8px rgba(31, 28, 40, 0.45) !important;
  color: #3d3949;

  // 白色玻璃上的 naive 组件适配（交互色以内联 CSS 变量下发，需 !important；
  // 白底上的悬停叠层用暗紫灰，文字 hover 用深琥珀与菜单/弹窗同语言）
  .n-button {
    --n-color: transparent !important;
    --n-color-hover: rgba(74, 70, 86, 0.08) !important;
    --n-color-pressed: rgba(74, 70, 86, 0.14) !important;
    --n-color-focus: rgba(74, 70, 86, 0.08) !important;
    --n-text-color: #3d3949 !important;
    --n-text-color-hover: #8a5300 !important;
    --n-text-color-pressed: #7a4800 !important;
    --n-text-color-focus: #8a5300 !important;
    --n-border: 1px solid transparent !important;
    --n-border-hover: 1px solid rgba(255, 146, 5, 0.55) !important;
    --n-border-pressed: 1px solid rgba(255, 146, 5, 0.75) !important;
    --n-border-focus: 1px solid rgba(255, 146, 5, 0.55) !important;
    --n-icon-color: #7d7789 !important;
    --n-icon-color-hover: #8a5300 !important;
    --n-icon-color-pressed: #7a4800 !important;
    --n-icon-color-focus: #8a5300 !important;
  }

  .n-progress {
    --n-rail-color: rgba(74, 70, 86, 0.12) !important;
    /* 默认态（进行中）的填充换品牌橙；success/error 状态色不受影响 */
    --n-color: #ff9205 !important;
  }

  .n-drawer-header {
    border-bottom: 1px solid rgba(74, 70, 86, 0.12) !important;
  }

  // 暗色滚动条：橙色胶囊滑块，槽完全透明
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background: rgba(255, 146, 5, 0.45);
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px rgba(255, 220, 170, 0.25);

    &:hover {
      background: rgba(255, 146, 5, 0.7);
    }
  }

  ::-webkit-scrollbar-track,
  ::-webkit-scrollbar-track-piece,
  ::-webkit-scrollbar-corner {
    background: transparent;
    border: none;
    box-shadow: none;
  }
}

// 抽屉 body 留出左右/底部内边距（任务卡片不贴边；列宽 322 已为 8px
// 滚动条让位：360 - 2 边框 - 24 内边距 - 8 滚动条 = 326 ≥ 322）
.n-drawer-body-content-wrapper {
  padding: 4px 8px !important;
}
.task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  overflow: hidden;
}
.empty {
  color: #7d7789;
  text-align: center;
  padding: 24px 0;
}
// 任务条：浅色玻璃 chip，悬停描边泛橙
.task-item {
  background: rgba(74, 70, 86, 0.06);
  border: 1px solid rgba(74, 70, 86, 0.1);
  border-radius: 10px;
  transition:
    border-color 0.2s,
    background-color 0.2s;

  &:hover {
    border-color: rgba(255, 146, 5, 0.4);
    background-color: rgba(255, 146, 5, 0.08);
  }
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}
.task-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.title {
  width: 100%;
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
.site-icon-fallback {
  flex-shrink: 0;
  color: #7d7789;
}
.name {
  font-weight: 700;
  width: 100%;
  color: #26232f;
}
.progress {
  font-size: 12px;
  color: #7d7789;
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
  color: #5c5668;
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 2px;
  div {
    white-space: nowrap;
    &:nth-child(3) {
      margin-right: 20px;
    }
  }
}
.status-tag {
  margin-left: auto;
}
.actions {
  display: flex;
  gap: 6px;
}
.error-msg {
  color: #d64545;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.move-percent {
  margin-left: 12px;
  font-weight: 600;
  white-space: nowrap;
  color: #3d3949;
}
.move-size {
  margin-left: 6px;
  color: #7d7789;
  font-weight: 400;
}
.n-drawer-header__main {
  width: 100%;
}
.drawer-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;

  span {
    color: #26232f;
    font-weight: 600;
  }
}

/* 虚拟列表样式 */
.download-virtual-grid {
  height: 100%;
  width: 100%;
}

/* 确保虚拟网格中的项目样式正确 */
.download-virtual-grid .virtual-grid-item {
  padding: 0;
  margin: 0;
}

/* 覆盖虚拟网格的默认样式以适应下载队列 */
.download-virtual-grid .virtual-grid {
  padding: 0;
  gap: 8px;
}
</style>
