/**
 * 视频封面缓存功能 IPC 桥接
 */
import { ipcRenderer } from 'electron'

const videoCover = {
  /**
   * 获取封面缓存路径，不存在返回 null
   */
  get: (videoPath: string): Promise<string | null> =>
    ipcRenderer.invoke('videoCover:get', videoPath),

  /**
   * 从 data URL（如 canvas.toDataURL）保存封面
   */
  saveFromDataUrl: (videoPath: string, dataUrl: string): Promise<string | null> =>
    ipcRenderer.invoke('videoCover:saveFromDataUrl', videoPath, dataUrl),

  /**
   * 从 base64 字符串保存封面
   */
  saveFromBase64: (videoPath: string, base64: string): Promise<string | null> =>
    ipcRenderer.invoke('videoCover:saveFromBase64', videoPath, base64),

  /**
   * 使用 FFmpeg 生成封面（提取指定时间点的帧）
   */
  generate: (videoPath: string, timeOffset?: number): Promise<string | null> =>
    ipcRenderer.invoke('videoCover:generate', videoPath, timeOffset),

  /**
   * 删除单个封面
   */
  delete: (videoPath: string): Promise<boolean> =>
    ipcRenderer.invoke('videoCover:delete', videoPath),

  /**
   * 清空所有封面
   */
  clearAll: (): Promise<number> =>
    ipcRenderer.invoke('videoCover:clearAll'),

  /**
   * 获取封面缓存目录信息
   */
  getInfo: (): Promise<{ coverDir: string; size: number }> =>
    ipcRenderer.invoke('videoCover:getInfo')
}

export default videoCover
