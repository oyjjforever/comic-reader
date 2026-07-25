/**
 * 全局后台转码任务 composable
 * 使用模块级响应式状态，确保用户导航离开 video 组件后进度仍可更新
 * IPC 监听只注册一次（全局）
 */
import { reactive } from 'vue'

export interface TranscodeTaskState {
  isRunning: boolean
  percent: number
  fps: number
  stage: 'idle' | 'probe' | 'encode' | 'done' | 'error' | 'cancelled'
  originalPath: string
  outputPath: string
  error?: string
}

// 模块级单例状态（跨组件/导航持久）
const state = reactive<TranscodeTaskState>({
  isRunning: false,
  percent: 0,
  fps: 0,
  stage: 'idle',
  originalPath: '',
  outputPath: ''
})

// IPC 监听只注册一次
let listenersInitialized = false
let removeProgressListener: (() => void) | null = null
let removeCompleteListener: (() => void) | null = null

function ensureListeners(): void {
  if (listenersInitialized) return
  listenersInitialized = true

  removeProgressListener = window.videoTranscoder.onProgress((progress) => {
    state.percent = progress.percent
    state.fps = progress.fps
    if (progress.stage === 'done') {
      state.stage = 'done'
    } else {
      state.stage = progress.stage
    }
  })

  removeCompleteListener = window.videoTranscoder.onComplete((result) => {
    state.isRunning = false
    state.percent = result.success ? 100 : state.percent
    if (result.success) {
      state.stage = 'done'
      state.outputPath = result.outputPath || state.outputPath
    } else if (result.error === '已取消') {
      state.stage = 'cancelled'
    } else {
      state.stage = 'error'
      state.error = result.error
    }
  })
}

/**
 * 启动后台转码
 * @returns { success, error? }
 */
async function startTranscode(inputPath: string): Promise<{ success: boolean; error?: string }> {
  ensureListeners()
  // 重置状态
  state.isRunning = true
  state.percent = 0
  state.fps = 0
  state.stage = 'probe'
  state.originalPath = inputPath
  state.outputPath = ''
  state.error = undefined

  return window.videoTranscoder.transcode(inputPath)
}

/** 取消转码 */
async function cancelTranscode(): Promise<boolean> {
  return window.videoTranscoder.cancel()
}

/**
 * 从主进程同步当前状态（用于刷新/导航恢复）
 */
async function syncStatus(): Promise<void> {
  ensureListeners()
  const remote = await window.videoTranscoder.getStatus()
  state.isRunning = remote.isRunning
  state.percent = remote.percent
  state.fps = remote.fps
  state.stage = remote.stage
  state.originalPath = remote.originalPath
  state.outputPath = remote.outputPath
  state.error = remote.error
}

/** 重置状态为 idle（UI 处理完完成事件后调用） */
function resetState(): void {
  state.isRunning = false
  state.percent = 0
  state.fps = 0
  state.stage = 'idle'
  state.originalPath = ''
  state.outputPath = ''
  state.error = undefined
}

export function useTranscodeTask() {
  return {
    state,
    startTranscode,
    cancelTranscode,
    syncStatus,
    resetState
  }
}
