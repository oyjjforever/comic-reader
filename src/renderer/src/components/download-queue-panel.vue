<template>
  <n-drawer v-bind="$attrs" placement="right" :width="360">
    <n-drawer-content>
      <template #header>
        <div class="drawer-header">
          <span>任务队列</span>
          <n-button size="tiny" quaternary @click="onClearFinished">清除已结束</n-button>
        </div>
      </template>
      <div class="task-list">
        <div v-if="!queue.tasks.length" class="empty">暂无任务</div>
        <div
          v-else
          ref="gridHostRef"
          class="download-virtual-grid-host"
          @wheel="markManual"
          @pointerdown="dragStart"
          @pointermove="dragMove"
        >
          <VirtualGrid
            ref="gridRef"
            :items="queue.tasks"
            :item-width="322"
            :item-height="84"
            :gap="10"
            key-field="id"
            :overscan="2"
            class="download-virtual-grid"
          >
            <template #default="{ item: t }">
              <div class="ticket" :data-task-id="t.id">
                <!-- 右下角站点水印（非站点任务回退移动图标） -->
                <div class="watermark">
                  <img v-if="siteIcon(t.site)" :src="siteIcon(t.site)" alt="" />
                  <n-icon v-else :component="FolderArrowRight24Regular" :size="56" />
                </div>

                <div class="ticket-rail">
                  <div class="tk-ring">
                    <svg width="40" height="40" viewBox="0 0 40 40">
                      <circle class="bg" cx="20" cy="20" r="16" />
                      <circle
                        class="fg"
                        :class="statusCls(t)"
                        cx="20"
                        cy="20"
                        r="16"
                        :stroke-dasharray="RING_C"
                        :stroke-dashoffset="ringOffset(t)"
                      />
                    </svg>
                    <div class="pct">{{ calcPercent(t) }}</div>
                  </div>

                  <!-- 状态胶囊：失败悬浮错误原因（含部分成功路径），完成态悬浮保存位置，均可点击打开 -->
                  <n-tooltip
                    v-if="t.status === 'error' && t.errorMessage"
                    trigger="hover"
                    placement="top"
                  >
                    <template #trigger>
                      <span class="rail-status error">{{ statusLabel(t.status, t) }}</span>
                    </template>
                    <div class="tt-body">
                      <div class="tt-text">{{ t.errorMessage }}</div>
                      <span
                        v-if="t.localFilePath"
                        class="tt-path"
                        @click="onOpenLocalFile(t.localFilePath)"
                      >
                        {{ t.localFilePath }}
                      </span>
                    </div>
                  </n-tooltip>
                  <n-tooltip
                    v-else-if="['success', 'existed'].includes(t.status) && t.localFilePath"
                    trigger="hover"
                    placement="top"
                  >
                    <template #trigger>
                      <span
                        class="rail-status openable"
                        :class="t.status"
                        @click="onOpenLocalFile(t.localFilePath)"
                      >
                        {{ statusLabel(t.status, t) }}
                      </span>
                    </template>
                    <div class="tt-body">
                      <span class="tt-label">下载位置（点击打开）</span>
                      <span class="tt-path" @click="onOpenLocalFile(t.localFilePath)">
                        {{ t.localFilePath }}
                      </span>
                    </div>
                  </n-tooltip>
                  <span v-else class="rail-status" :class="t.status">
                    {{ statusLabel(t.status, t) }}
                  </span>
                </div>

                <div class="divider"></div>

                <div class="ticket-main">
                  <div class="t-head">
                    <n-ellipsis class="t-title">{{ t.title }}</n-ellipsis>
                    <span class="t-no">{{ ticketNo(t) }}</span>
                  </div>
                  <div class="t-bar-row">
                    <div class="t-track">
                      <div class="t-fill" :class="statusCls(t)" :style="{ width: calcPercent(t) + '%' }"></div>
                    </div>
                    <div class="t-acts-slot">
                      <n-button
                        v-if="t.status === 'running'"
                        quaternary
                        circle
                        size="tiny"
                        title="暂停"
                        @click="onPause(t)"
                      >
                        <n-icon size="15"><PauseOutline /></n-icon>
                      </n-button>
                      <n-button
                        v-if="t.status === 'paused'"
                        quaternary
                        circle
                        size="tiny"
                        title="继续"
                        @click="onResume(t)"
                      >
                        <n-icon size="15"><PlayOutline /></n-icon>
                      </n-button>
                      <n-button
                        v-if="['error', 'canceled'].includes(t.status)"
                        quaternary
                        circle
                        size="tiny"
                        title="重试"
                        @click="onRetry(t)"
                      >
                        <n-icon size="15"><RefreshOutline /></n-icon>
                      </n-button>
                      <n-button
                        quaternary
                        circle
                        size="tiny"
                        type="error"
                        title="删除"
                        @click="onDelete(t)"
                      >
                        <n-icon size="15"><TrashOutline /></n-icon>
                      </n-button>
                    </div>
                  </div>
                  <div v-if="t.progress && (t.progress.total || t.progress.value)" class="t-meta">
                    <span class="stat ok">{{ t.progress.success || 0 }}</span>
                    <span class="sep">/</span>
                    <span class="stat fail">{{ t.progress.fail || 0 }}</span>
                    <span class="sep">/</span>
                    <span class="stat total">{{ t.progress.total || 0 }}</span>
                    <span
                      v-if="
                        t.site === 'local-move' &&
                        ['running', 'paused'].includes(t.status) &&
                        t.progress.sizeTotal > 0
                      "
                      class="sz"
                    >
                      {{ formatFileSize(t.progress.sizeDone || 0) }} /
                      {{ formatFileSize(t.progress.sizeTotal) }}
                    </span>
                  </div>
                </div>
              </div>
            </template>
          </VirtualGrid>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import VirtualGrid from './virtual-grid.vue'
import { queue } from '@renderer/plugins/store/downloadQueue'

const gridRef = ref()
const gridHostRef = ref<HTMLElement>()

// ===== 自动追踪下载中卡片：仅用户浏览静默期生效 =====
// 手动浏览 = 滚轮滚动 / 在列表上按住拖动（滚动条）；静默 3s 后恢复自动追踪，
// 期间下载任务切换了就改追最新的 running
const MANUAL_IDLE_MS = 3000
let manualUntil = 0
let listDragging = false
let trackTimer = 0

function markManual() {
  manualUntil = Date.now() + MANUAL_IDLE_MS
}
function dragStart() {
  listDragging = true
  markManual()
}
function dragMove(e: PointerEvent) {
  if (listDragging && e.movementY) markManual()
}

const currentRunningId = () => queue.tasks.find((t) => t.status === 'running')?.id

/** 滚动到正在下载的卡片（已可见时不动；虚拟化离屏时按索引定位） */
function scrollRunningIntoView(taskId: string) {
  const host = gridHostRef.value
  if (!host || !taskId) return
  const card = host.querySelector(`[data-task-id="${CSS.escape(taskId)}"]`)
  if (card) {
    const r = card.getBoundingClientRect()
    const h = host.getBoundingClientRect()
    if (r.bottom <= h.bottom && r.top >= h.top) return
  }
  const idx = queue.tasks.findIndex((t) => t.id === taskId)
  if (idx >= 0) gridRef.value?.scrollToIndex(idx)
}

function trackRunning(taskId?: string) {
  if (!taskId) return
  clearTimeout(trackTimer)
  const attempt = () => {
    if (Date.now() < manualUntil) {
      trackTimer = window.setTimeout(
        () => trackRunning(currentRunningId()),
        manualUntil - Date.now() + 200
      )
      return
    }
    void nextTick(() => scrollRunningIntoView(taskId))
  }
  attempt()
}

watch(currentRunningId, (id) => trackRunning(id), { immediate: true })

let detachWindowListeners: (() => void) | null = null
onMounted(() => {
  const up = () => (listDragging = false)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
  detachWindowListeners = () => {
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
  }
})
onUnmounted(() => {
  detachWindowListeners?.()
  clearTimeout(trackTimer)
})

function statusLabel(s: string, t?: any) {
  // 本地移动任务运行中显示"移动中"
  if (t?.site === 'local-move' && s === 'running') return '移动中'
  const map: Record<string, string> = {
    pending: '队列中',
    running: '下载中',
    paused: '已暂停',
    success: '已完成',
    error: '失败',
    canceled: '已取消',
    existed: '已存在'
  }
  return map[s] || s
}

// 站点图标（任务卡片右下角水印用）
import jmttImg from '@renderer/assets/jmtt.jpg'
import pixivImg from '@renderer/assets/pixiv.jpg'
import twitterImg from '@renderer/assets/twitter.jpg'
import weiboImg from '@renderer/assets/weibo.ico'
import picamanImg from '@renderer/assets/picaman.ico'
import huangguoImg from '@renderer/assets/huangguo.png'
import yfantasyImg from '@renderer/assets/yfantasy.png'
import pornhubImg from '@renderer/assets/pornhub.ico'
import fourkhdImg from '@renderer/assets/4khd.png'
import { PauseOutline, PlayOutline, TrashOutline, RefreshOutline } from '@vicons/ionicons5'
import { FolderArrowRight24Regular } from '@vicons/fluent'
import { formatFileSize } from '@renderer/utils/format'

const SITE_ICONS: Record<string, string> = {
  jmtt: jmttImg,
  pixiv: pixivImg,
  twitter: twitterImg,
  weibo: weiboImg,
  picaman: picamanImg,
  huangguo: huangguoImg,
  yfantasy: yfantasyImg,
  '4khd': fourkhdImg,
  pornhub: pornhubImg
}
function siteIcon(site: string): string | undefined {
  // 本地移动等非站点任务无图标，模板回退为通用移动图标
  return SITE_ICONS[site]
}

// ===== 车票卡片进度 =====
const DONE_STATUS = ['success', 'error', 'existed']
const RING_R = 16
const RING_C = (2 * Math.PI * RING_R).toFixed(2)

function calcPercent(t: any) {
  const p = t?.progress || {}
  if (p.value) return Math.min(100, Math.round(p.value))
  if (!p.total) return 0
  const completed = (p.success || 0) + (p.fail || 0)
  return Math.min(100, Math.floor((completed / p.total) * 100))
}
function ringOffset(t: any) {
  const pc = DONE_STATUS.includes(t.status) ? 100 : calcPercent(t)
  return (Number(RING_C) * (1 - pc / 100)).toFixed(2)
}
/** 状态类：圆环/进度条与状态胶囊共用同一套配色（existed 归入 success 色） */
function statusCls(t: any) {
  if (['success', 'existed'].includes(t.status)) return 'success'
  return t.status
}
function ticketNo(t: any) {
  return 'NO.' + String(t.serial || 0).padStart(4, '0')
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
  height: 100%;
  overflow: hidden;
}
.empty {
  color: #7d7789;
  text-align: center;
  padding: 24px 0;
}

/* 虚拟列表样式 */
.download-virtual-grid-host {
  flex: 1;
  min-height: 0;
}

.download-virtual-grid {
  height: 100%;
  width: 100%;
}

/* 确保虚拟网格中的项目样式正确 */
.download-virtual-grid .virtual-grid-item {
  padding: 0;
  margin: 0;
}

// ============================================================
// 车票任务卡片
// ============================================================
.ticket {
  --hole: #E1DDDB; // 打孔色 ≈ 抽屉玻璃底合成色
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  background: #fffdf8;
  // border: 1px solid rgba(74, 70, 86, 0.12);
  box-shadow: 0 2px 6px -2px rgba(31, 28, 40, 0.12);
  transition:
    transform 0.18s ease,
    box-shadow 0.2s ease,
    border-color 0.2s;
  overflow: hidden;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 146, 5, 0.55);
    box-shadow:
      0 8px 20px -8px rgba(255, 146, 5, 0.45),
      0 2px 6px -2px rgba(31, 28, 40, 0.12);
  }
}

// 左侧分隔线上的上下打孔（半圆咬口）
.ticket::before,
.ticket::after {
  content: '';
  position: absolute;
  left: 58px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--hole);
  transform: translateX(-50%);
  z-index: 4;
  pointer-events: none;
}
.ticket::before {
  top: -8px;
}
.ticket::after {
  bottom: -8px;
}

.ticket .divider {
  position: absolute;
  left: 58px;
  top: 8px;
  bottom: 8px;
  width: 0;
  border-left: 1.5px dashed rgba(74, 70, 86, 0.28);
  transform: translateX(-50%);
  z-index: 2;
  pointer-events: none;
}

// 右下角站点图标水印：保留站点原色，低透明度压暗，悬浮微亮
.ticket .watermark {
  position: absolute;
  right: -6px;
  bottom: -8px;
  width: 64px;
  height: 64px;
  z-index: 0;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3d3949;
  opacity: 0.15;
  transform: rotate(-12deg);
  transition: opacity 0.2s;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
}
.ticket:hover .watermark {
  opacity: 0.22;
}

// ===== 左侧票根：圆环进度 + 状态胶囊 =====
// 圆环类名必须用 tk-ring：项目带 Tailwind，模板里写 class="ring" 会被 JIT
// 识别为 ring 工具类，生成 --tw-ring-shadow 的方形描边套在圆环外
.ticket-rail {
  position: relative;
  z-index: 2;
  flex: 0 0 58px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 4px;
  background:
    repeating-linear-gradient(0deg, rgba(255, 146, 5, 0.04) 0 1px, transparent 1px 4px),
    rgba(255, 250, 240, 0.55);
  border-radius: 12px 0 0 12px;
}
.tk-ring {
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}
.tk-ring svg {
  transform: rotate(-90deg);
  display: block;
}
.tk-ring .bg {
  fill: none;
  stroke: rgba(74, 70, 86, 0.14);
  stroke-width: 4;
}
.tk-ring .fg {
  fill: none;
  stroke: #ff9205;
  stroke-width: 4;
  stroke-linecap: round;
  transition:
    stroke-dashoffset 0.4s ease,
    stroke 0.2s;
}
// 状态配色与 rail-status 胶囊同源：运行蓝、暂停/取消琥珀、等待灰紫、完成绿、失败红
.tk-ring .fg.running {
  stroke: #0b6b9c;
}
.tk-ring .fg.paused,
.tk-ring .fg.canceled {
  stroke: #9a6b00;
}
.tk-ring .fg.pending {
  stroke: #6b6577;
}
.tk-ring .fg.success {
  stroke: #2e9e5b;
}
.tk-ring .fg.error {
  stroke: #b03a3a;
}
.tk-ring .pct {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  color: #3d3949;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.3px;
}

.rail-status {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
  padding: 1px 6px;
  border-radius: 7px;
  white-space: nowrap;
  color: #6b6577;
  background: rgba(74, 70, 86, 0.1);
  line-height: 1.5;
}
.rail-status.running {
  color: #0b6b9c;
  background: rgba(32, 128, 192, 0.15);
}
.rail-status.success,
.rail-status.existed {
  color: #2e9e5b;
  background: rgba(46, 158, 91, 0.15);
}
.rail-status.error {
  color: #b03a3a;
  background: rgba(214, 69, 69, 0.15);
  cursor: help;
}
.rail-status.paused,
.rail-status.canceled {
  color: #9a6b00;
  background: rgba(240, 160, 32, 0.18);
}
.rail-status.openable {
  cursor: pointer;
}

// ===== 右侧主区 =====
.ticket-main {
  position: relative;
  z-index: 2;
  flex: 1 1 auto;
  min-width: 0;
  padding: 9px 10px 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.t-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 22px;
}
.t-title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  font-size: 14px;
  line-height: 22px;
  color: #26232f;
}
.t-no {
  flex-shrink: 0;
  font-size: 11px;
  color: #a29cae;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.4px;
}

// 第二行：进度条 + 操作按钮（同一行，按钮槽固定宽度）
.t-bar-row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 22px;
}
.t-track {
  flex: 1 1 auto;
  min-width: 0;
  height: 4px;
  border-radius: 2px;
  background: rgba(74, 70, 86, 0.12);
  overflow: hidden;
}
.t-fill {
  height: 100%;
  border-radius: 2px;
  background: repeating-linear-gradient(-45deg, #ff9205 0 5px, #ffb04d 5px 10px);
  transition: width 0.3s ease;
}
// 状态配色与 rail-status 胶囊同源（运行中保留条纹示「进行」，亮纹取胶囊底色）
.t-fill.running {
  background: repeating-linear-gradient(-45deg, #0b6b9c 0 5px, #2080c0 5px 10px);
}
.t-fill.paused,
.t-fill.canceled {
  background: #9a6b00;
}
.t-fill.pending {
  background: #6b6577;
}
.t-fill.success {
  background: #2e9e5b;
}
.t-fill.error {
  background: #b03a3a;
}

.t-acts-slot {
  flex: 0 0 48px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  opacity: 0.8;
  transition: opacity 0.18s;

  .n-button {
    width: 22px;
    height: 22px;
    min-width: 22px;
    // 图标加深一档：抽屉级默认 #7d7789 在卡片上偏浅
    --n-icon-color: #5c5668 !important;
    --n-icon-color-hover: #8a5300 !important;
    --n-icon-color-pressed: #7a4800 !important;
    --n-icon-color-focus: #8a5300 !important;
  }
  // 删除按钮保持红色系（抽屉级覆盖会把 error 按钮也染灰）
  .n-button.n-button--error-type {
    --n-icon-color: #c05050 !important;
    --n-icon-color-hover: #d64545 !important;
    --n-icon-color-pressed: #b03a3a !important;
    --n-icon-color-focus: #d64545 !important;
  }
}
.ticket:hover .t-acts-slot {
  opacity: 1;
}

.t-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #7d7789;
  height: 18px;

  .stat {
    font-variant-numeric: tabular-nums;
  }
  .sep {
    color: #a29cae;
  }
  .ok {
    color: #2e9e5b;
  }
  .fail {
    color: #d64545;
  }
  .total {
    color: #5c5668;
  }
  .sz {
    margin-left: auto;
    font-size: 11px;
    color: #5c5668;
    white-space: nowrap;
  }
}

// ===== n-tooltip 内容（tooltip 传送至 body，样式须全局） =====
.tt-body {
  max-width: 240px;
  font-size: 11px;
  line-height: 1.45;
  word-break: break-all;
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
}
.tt-text {
  color: rgba(255, 255, 255, 0.92);
  white-space: pre-wrap;
}
.tt-label {
  font-size: 10px;
  color: #b9b4c2;
}
.tt-path {
  color: #ffd08a;
  text-decoration: underline;
  cursor: pointer;

  &:hover {
    color: #ffb04d;
  }
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
</style>
