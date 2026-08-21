/**
 * huangguo HLS 加密视频下载 IPC 桥接
 * 主进程负责 M3U8 解析、AES-128 解密、片段合并，此处仅做 invoke 转发
 */
import { ipcRenderer } from 'electron'

export interface HlsProgressData {
  type: string
  [key: string]: unknown
}

export interface HlsStartDownloadPayload {
  /** master.m3u8 地址 */
  m3u8Url: string
  /** 目标清晰度，如 1080p / 720p / 480p */
  quality?: string
  /** 输出 mp4 完整路径 */
  savePath: string
  /** 视频所在页面地址（用于读取同源 Cookie / Referer） */
  siteUrl?: string
}

export interface HlsStartDownloadResult {
  success: boolean
  error?: string
  outputPath?: string
  quality?: string
  segments?: number
  duration?: number
}

export interface HlsVideoInfoResult {
  success: boolean
  error?: string
  title?: string
  contentId?: string
  m3u8Url?: string
}

const huangguo = {
  /** 解析视频页 HTML，返回真实内容 ID 与 master.m3u8 地址 */
  getVideoInfo: (pageUrl: string): Promise<HlsVideoInfoResult> =>
    ipcRenderer.invoke('huangguo:getVideoInfo', { pageUrl }),
  /** 调用 play 接口获取指定集的实时播放地址（auth_key 有时效） */
  getPlayUrl: (
    videoId: string | number,
    ep?: string | number
  ): Promise<{ success: boolean; videoUrl?: string; duration?: number; title?: string; error?: string }> =>
    ipcRenderer.invoke('huangguo:getPlayUrl', { videoId, ep }),
  startDownload: (payload: HlsStartDownloadPayload): Promise<HlsStartDownloadResult> =>
    ipcRenderer.invoke('huangguo:startDownload', payload),
  cancelDownload: (): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('huangguo:cancelDownload'),
  /** 订阅下载进度，返回取消订阅函数 */
  onProgress: (callback: (progress: HlsProgressData) => void): (() => void) => {
    const handler = (_event: unknown, data: HlsProgressData): void => callback(data)
    ipcRenderer.on('huangguo:download-progress', handler)
    return () => ipcRenderer.removeListener('huangguo:download-progress', handler)
  }
}

export default huangguo
