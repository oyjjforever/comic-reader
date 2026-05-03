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
    WhisperModelName,
    TranslateTarget
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
    },

    /**
     * 翻译字幕段落（批量）
     */
    translate: (segments: SubtitleSegment[], from: string, to: string): Promise<{
        success: boolean
        segments?: SubtitleSegment[]
        error?: string
    }> => ipcRenderer.invoke('subtitle:translate', segments, from, to),

    /**
     * 翻译单条文本（按需翻译）
     */
    translateSingle: (text: string, from: string, to: string): Promise<{
        success: boolean
        translated?: string
        error?: string
    }> => ipcRenderer.invoke('subtitle:translate-single', text, from, to),

    /**
     * 清理翻译缓存
     */
    clearTranslateCache: (): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('subtitle:clear-translate-cache'),

    /**
     * 监听翻译进度
     */
    onTranslateProgress: (callback: (progress: {
        current: number
        total: number
        percent: number
    }) => void): (() => void) => {
        const handler = (_event: any, progress: any) => callback(progress)
        ipcRenderer.on('subtitle:translate-progress', handler)
        return () => ipcRenderer.removeListener('subtitle:translate-progress', handler)
    },

    /**
     * 监听单条翻译结果（流式显示）
     */
    onTranslateSegment: (callback: (data: {
        segment: SubtitleSegment
        index: number
    }) => void): (() => void) => {
        const handler = (_event: any, data: any) => callback(data)
        ipcRenderer.on('subtitle:translate-segment', handler)
        return () => ipcRenderer.removeListener('subtitle:translate-segment', handler)
    },

    // ========== 翻译模型管理 ==========

    /**
     * 获取所有翻译模型
     */
    getTranslateModels: (): Promise<any[]> =>
        ipcRenderer.invoke('subtitle:get-translate-models'),

    /**
     * 下载翻译模型
     */
    downloadTranslateModel: (modelAlias: string): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('subtitle:download-translate-model', modelAlias),

    /**
     * 删除翻译模型
     */
    deleteTranslateModel: (modelAlias: string): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('subtitle:delete-translate-model', modelAlias),

    /**
     * 监听翻译模型下载进度
     */
    onTranslateModelDownloadProgress: (callback: (progress: {
        modelAlias: string
        percent: number
        receivedBytes: number
        totalBytes: number
        status: 'downloading' | 'done'
    }) => void): (() => void) => {
        const handler = (_event: any, progress: any) => callback(progress)
        ipcRenderer.on('subtitle:translate-model-download-progress', handler)
        return () => ipcRenderer.removeListener('subtitle:translate-model-download-progress', handler)
    },

    // ========== LLM 模块管理 ==========

    /**
     * 检查 LLM 模块状态
     */
    getLlmModuleStatus: (): Promise<{
        installed: boolean
        version: string | null
        installedAt: string | null
        moduleDir: string
        moduleSize: number
        moduleSizeFormatted: string
        bundledZipAvailable: boolean
    }> => ipcRenderer.invoke('llm:check-status'),

    /**
     * 从内置 ZIP 自动安装 LLM 模块
     */
    autoInstallLlmModule: (): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('llm:auto-install'),

    /**
     * 卸载 LLM 模块
     */
    uninstallLlmModule: (): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('llm:uninstall')
}

export default subtitle
