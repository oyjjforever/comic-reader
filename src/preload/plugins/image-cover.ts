/**
 * 图片封面缩略图缓存功能 IPC 桥接
 */
import { ipcRenderer } from 'electron'

const imageCover = {
  /**
   * 获取缩略图缓存路径，不存在（或源图已变更）返回 null
   */
  get: (imagePath: string): Promise<string | null> =>
    ipcRenderer.invoke('imageCover:get', imagePath),

  /**
   * 渲染层 canvas 生成的缩略图（data URL）写入缓存，返回缓存路径
   */
  saveFromDataUrl: (imagePath: string, dataUrl: string): Promise<string | null> =>
    ipcRenderer.invoke('imageCover:saveFromDataUrl', imagePath, dataUrl),

  /**
   * 删除单个图片的全部缩略图缓存（含历史 mtime 条目）
   */
  delete: (imagePath: string): Promise<boolean> =>
    ipcRenderer.invoke('imageCover:delete', imagePath),

  /**
   * 清空所有图片封面缓存
   */
  clearAll: (): Promise<number> => ipcRenderer.invoke('imageCover:clearAll'),

  /**
   * 获取缩略图缓存目录信息
   */
  getInfo: (): Promise<{ coverDir: string; size: number }> =>
    ipcRenderer.invoke('imageCover:getInfo'),

  /**
   * 批量按路径迁移缩略图缓存（作品移动后同步缓存文件名）
   */
  renameByPaths: (pairs: Array<[string, string]>): Promise<number> =>
    ipcRenderer.invoke('imageCover:renameByPaths', pairs)
}

export default imageCover
