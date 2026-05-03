/**
 * 字幕功能 IPC 桥接
 * 暴露给渲染进程的字幕 API
 */
import { ipcRenderer } from 'electron'
import type {
    SubtitleCacheInfo,
    GenerateOptions,
    ModelInfo,
    SubtitleSettings,
    GenerateProgress,
    SubtitleSegment,
    SubtitleLanguage,
    WhisperModelName
} from '../../typings/subtitle'

const subtitle = {
    /**
     * 检查字幕缓存
     */
    checkCache: (videoPath: string): Promise<SubtitleCacheInfo> =>
        ipcRenderer.invoke('subtitle:check-cache', videoPath),

    /**
     * 渐进式生成字幕
     */
    generate: (videoPath: string, options?: GenerateOptions): Promise<string> =>
        ipcRenderer.invoke('subtitle:generate', videoPath, options),

    /**
     * 取消生成
     */
    cancelGenerate: (): Promise<void> =>
        ipcRenderer.invoke('subtitle:cancel-generate'),

    /**
     * 解析 VTT 文件为段落列表
     */
    parseVtt: (vttPath: string): Promise<SubtitleSegment[]> =>
        ipcRenderer.invoke('subtitle:parse-vtt', vttPath),

    /**
     * 获取所有模型信息
     */
    getModels: (): Promise<ModelInfo[]> =>
        ipcRenderer.invoke('subtitle:get-models'),

    /**
     * 下载模型
     */
    downloadModel: (modelName: WhisperModelName): Promise<void> =>
        ipcRenderer.invoke('subtitle:download-model', modelName),

    /**
     * 删除模型
     */
    deleteModel: (modelName: WhisperModelName): Promise<void> =>
        ipcRenderer.invoke('subtitle:delete-model', modelName),

    /**
     * 获取字幕设置
     */
    getSettings: (): Promise<SubtitleSettings> =>
        ipcRenderer.invoke('subtitle:get-settings'),

    /**
     * 更新字幕设置
     */
    updateSettings: (settings: Partial<SubtitleSettings>): Promise<void> =>
        ipcRenderer.invoke('subtitle:update-settings', settings),

    /**
     * 清理字幕缓存
     */
    clearCache: (): Promise<void> =>
        ipcRenderer.invoke('subtitle:clear-cache'),

    /**
     * 获取生成状态
     */
    getStatus: (): Promise<{ isGenerating: boolean }> =>
        ipcRenderer.invoke('subtitle:get-status'),

    /**
     * 获取字幕数据目录和占用空间
     */
    getDataInfo: (): Promise<{ dataDir: string; dataSize: number; dataSizeFormatted: string }> =>
        ipcRenderer.invoke('subtitle:get-data-info'),

    /**
     * 选择字幕数据存储目录
     */
    selectDataDir: (): Promise<string | null> =>
        ipcRenderer.invoke('subtitle:select-data-dir'),

    /**
     * 迁移字幕数据到新目录
     */
    migrateData: (newPath: string): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('subtitle:migrate-data', newPath),

    /**
     * 监听生成进度
     */
    onGenerateProgress: (callback: (progress: GenerateProgress) => void): (() => void) => {
        const handler = (_event: any, progress: GenerateProgress) => callback(progress)
        ipcRenderer.on('subtitle:generate-progress', handler)
        return () => ipcRenderer.removeListener('subtitle:generate-progress', handler)
    },

    /**
     * 监听模型下载进度
     */
    onDownloadProgress: (callback: (progress: { model: string; percent: number; receivedBytes: number; totalBytes: number }) => void): (() => void) => {
        const handler = (_event: any, progress: any) => callback(progress)
        ipcRenderer.on('subtitle:download-progress', handler)
        return () => ipcRenderer.removeListener('subtitle:download-progress', handler)
    },

    /**
     * 监听实时字幕文本
     */
    onRealtimeText: (callback: (text: string, isFinal: boolean) => void): (() => void) => {
        const handler = (_event: any, text: string, isFinal: boolean) => callback(text, isFinal)
        ipcRenderer.on('subtitle:realtime-text', handler)
        return () => ipcRenderer.removeListener('subtitle:realtime-text', handler)
    },

    /**
     * 获取二进制文件状态
     */
    getBinaryStatus: (): Promise<{
        whisperInstalled: boolean
        ffmpegInstalled: boolean
        whisperPath: string
        ffmpegPath: string
    }> => ipcRenderer.invoke('subtitle:get-binary-status'),

    /**
     * 下载 whisper.cpp
     */
    downloadWhisper: (): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('subtitle:download-whisper'),

    /**
     * 下载 FFmpeg
     */
    downloadFfmpeg: (): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('subtitle:download-ffmpeg'),

    /**
     * 监听二进制文件下载进度
     */
    onBinaryDownloadProgress: (callback: (progress: {
        binary: 'whisper' | 'ffmpeg'
        percent: number
        status: 'downloading' | 'extracting' | 'done'
    }) => void): (() => void) => {
        const handler = (_event: any, progress: any) => callback(progress)
        ipcRenderer.on('subtitle:binary-download-progress', handler)
        return () => ipcRenderer.removeListener('subtitle:binary-download-progress', handler)
    }
}

export default subtitle
