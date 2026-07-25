/**
 * 视频转码修复 IPC 桥接
 * 修复异常 GOP（keyint=infinite 等）导致的 Chromium 解码掉帧抖动
 */
import { ipcRenderer } from 'electron'

export interface TranscodeProgress {
  currentTime: number
  totalTime: number
  percent: number
  fps: number
  stage: 'probe' | 'encode' | 'done'
}

export interface TranscodeState {
  isRunning: boolean
  percent: number
  fps: number
  stage: 'idle' | 'probe' | 'encode' | 'done' | 'error' | 'cancelled'
  originalPath: string
  outputPath: string
  error?: string
}

export interface TranscodeComplete {
  success: boolean
  outputPath?: string
  originalPath?: string
  error?: string
}

const videoTranscoder = {
  /**
   * 启动转码修复（后台非阻塞，立即返回）
   * 进度通过 onProgress 上报，完成通过 onComplete 上报
   * @returns { success, error? }
   */
  transcode: (
    inputPath: string
  ): Promise<{ success: boolean; outputPath?: string; error?: string }> =>
    ipcRenderer.invoke('video:transcode', inputPath),

  /** 查询当前转码状态（用于恢复 UI） */
  getStatus: (): Promise<TranscodeState> =>
    ipcRenderer.invoke('video:getTranscodeStatus'),

  /** 取消当前转码 */
  cancel: (): Promise<boolean> => ipcRenderer.invoke('video:cancelTranscode'),

  /**
   * 删除原文件并将修复版重命名为原文件名
   * @returns { success, finalPath?, error? }
   */
  replaceWithFixed: (
    originalPath: string,
    fixedPath: string,
    renameToOriginal: boolean
  ): Promise<{ success: boolean; finalPath?: string; error?: string }> =>
    ipcRenderer.invoke('video:replaceWithFixed', originalPath, fixedPath, renameToOriginal),

  /** 监听转码进度 */
  onProgress: (callback: (progress: TranscodeProgress) => void): (() => void) => {
    const handler = (_event: unknown, progress: TranscodeProgress) => callback(progress)
    ipcRenderer.on('video:transcode-progress', handler)
    return () => ipcRenderer.removeListener('video:transcode-progress', handler)
  },

  /** 监听转码完成（后台模式） */
  onComplete: (callback: (result: TranscodeComplete) => void): (() => void) => {
    const handler = (_event: unknown, result: TranscodeComplete) => callback(result)
    ipcRenderer.on('video:transcode-complete', handler)
    return () => ipcRenderer.removeListener('video:transcode-complete', handler)
  }
}

export default videoTranscoder
