/**
 * 翻译模型管理服务
 * 管理 GGUF 格式的翻译模型（下载、删除、列表）
 */
import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import log from '../../utils/log'
import { readSubtitleSettings } from './subtitle-config'
import { TRANSLATE_MODEL_PRESETS } from '../../typings/subtitle'
import type { TranslateModelInfo } from '../../typings/subtitle'

/**
 * 获取翻译模型存储目录
 */
export function getTranslateModelsDir(): string {
    const settings = readSubtitleSettings()
    const basePath = settings.subtitleDataPath || app.getPath('userData')
    const dir = path.join(basePath, 'translate-models')
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    return dir
}

/**
 * 获取所有可用的翻译模型列表
 */
export function getAllTranslateModels(): TranslateModelInfo[] {
    const modelsDir = getTranslateModelsDir()
    const settings = readSubtitleSettings()

    return TRANSLATE_MODEL_PRESETS.map(preset => {
        // 查找匹配的 .gguf 文件
        const expectedPath = path.join(modelsDir, `${preset.alias}.gguf`)
        const downloaded = fs.existsSync(expectedPath)

        return {
            ...preset,
            downloaded,
            path: downloaded ? expectedPath : undefined
        }
    })
}

/**
 * 根据别名获取翻译模型的本地路径
 * 用于 @electron/llm 的 getModelPath 回调
 */
export function getTranslateModelPath(modelAlias: string): string | null {
    const modelsDir = getTranslateModelsDir()
    const modelPath = path.join(modelsDir, `${modelAlias}.gguf`)

    if (fs.existsSync(modelPath)) {
        return modelPath
    }

    // 尝试在目录中查找任何包含该别名的 .gguf 文件
    try {
        const files = fs.readdirSync(modelsDir)
        const ggufFile = files.find(f =>
            f.endsWith('.gguf') && f.toLowerCase().includes(modelAlias.toLowerCase())
        )
        if (ggufFile) {
            return path.join(modelsDir, ggufFile)
        }
    } catch {
        // ignore
    }

    return null
}

/**
 * 获取当前选中的翻译模型路径
 */
export function getCurrentTranslateModelPath(): string | null {
    const settings = readSubtitleSettings()
    return getTranslateModelPath(settings.translateModelAlias)
}

/**
 * 下载翻译模型
 * 使用 Electron net 模块下载 GGUF 文件
 */
export async function downloadTranslateModel(
    modelAlias: string,
    mainWindow: BrowserWindow
): Promise<void> {
    const preset = TRANSLATE_MODEL_PRESETS.find(p => p.alias === modelAlias)
    if (!preset) {
        throw new Error(`未知的翻译模型: ${modelAlias}`)
    }

    const modelsDir = getTranslateModelsDir()
    const targetPath = path.join(modelsDir, `${modelAlias}.gguf`)

    // 如果已存在，跳过下载
    if (fs.existsSync(targetPath)) {
        log.info(`[TranslateModel] 模型已存在: ${targetPath}`)
        return
    }

    log.info(`[TranslateModel] 开始下载: ${preset.displayName} from ${preset.downloadUrl}`)

    return new Promise<void>((resolve, reject) => {
        const { net } = require('electron')
        const request = net.request(preset.downloadUrl)

        // 设置 User-Agent 避免 HuggingFace 拒绝
        request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ComicReader/1.0')

        // 临时文件路径
        const tempPath = targetPath + '.downloading'

        request.on('response', (response: any) => {
            if (response.statusCode >= 300 && response.statusCode < 400) {
                // 处理重定向
                const redirectUrl = response.headers?.['location']
                if (redirectUrl) {
                    log.info(`[TranslateModel] 重定向到: ${redirectUrl}`)
                    request.abort()
                    // 递归处理重定向
                    const redirectRequest = net.request(redirectUrl)
                    redirectRequest.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ComicReader/1.0')
                    handleDownloadResponse(redirectRequest, tempPath, targetPath, mainWindow, modelAlias, preset, resolve, reject)
                    redirectRequest.end()
                    return
                }
            }

            handleDownloadResponse(request, tempPath, targetPath, mainWindow, modelAlias, preset, resolve, reject, response)
        })

        request.on('error', (err: any) => {
            log.error(`[TranslateModel] 下载失败: ${err?.message}`)
            reject(new Error(`下载失败: ${err?.message}`))
        })

        request.end()
    })
}

/**
 * 处理下载响应
 */
function handleDownloadResponse(
    request: Electron.ClientRequest,
    tempPath: string,
    targetPath: string,
    mainWindow: BrowserWindow,
    modelAlias: string,
    preset: Omit<TranslateModelInfo, 'downloaded' | 'path'>,
    resolve: () => void,
    reject: (err: Error) => void,
    response?: any
): void {
    if (!response) {
        request.on('response', (res: any) => {
            processDownloadStream(res, request, tempPath, targetPath, mainWindow, modelAlias, preset, resolve, reject)
        })
    } else {
        processDownloadStream(response, request, tempPath, targetPath, mainWindow, modelAlias, preset, resolve, reject)
    }
}

function processDownloadStream(
    response: any,
    request: Electron.ClientRequest,
    tempPath: string,
    targetPath: string,
    mainWindow: BrowserWindow,
    modelAlias: string,
    preset: Omit<TranslateModelInfo, 'downloaded' | 'path'>,
    resolve: () => void,
    reject: (err: Error) => void
): void {
    const fileStream = fs.createWriteStream(tempPath)
    const lenHeader = response.headers?.['content-length']
    const total = Array.isArray(lenHeader)
        ? parseInt(lenHeader[0] || '0', 10)
        : parseInt(lenHeader || '0', 10)
    let received = 0
    let lastProgressTime = 0

    fileStream.on('error', (err) => {
        log.error(`[TranslateModel] 文件写入失败: ${err?.message}`)
        reject(new Error(`文件写入失败: ${err.message}`))
    })

    response.on('data', (chunk: Buffer) => {
        received += chunk.length
        fileStream.write(chunk)

        // 节流进度更新（每500ms一次）
        const now = Date.now()
        if (now - lastProgressTime > 500) {
            lastProgressTime = now
            const percent = total > 0 ? Math.round((received / total) * 100) : 0
            mainWindow.webContents.send('subtitle:translate-model-download-progress', {
                modelAlias,
                percent,
                receivedBytes: received,
                totalBytes: total,
                status: 'downloading'
            })
        }
    })

    response.on('end', () => {
        fileStream.end()
    })

    response.on('error', (err: any) => {
        log.error(`[TranslateModel] 响应错误: ${err?.message}`)
        fileStream.destroy()
        try { fs.unlinkSync(tempPath) } catch { /* ignore */ }
        reject(new Error(`下载响应错误: ${err.message}`))
    })

    fileStream.on('finish', () => {
        // 重命名临时文件为最终文件
        try {
            if (fs.existsSync(targetPath)) {
                fs.unlinkSync(targetPath)
            }
            fs.renameSync(tempPath, targetPath)
        } catch (err: any) {
            reject(new Error(`重命名文件失败: ${err.message}`))
            return
        }

        mainWindow.webContents.send('subtitle:translate-model-download-progress', {
            modelAlias,
            percent: 100,
            receivedBytes: received,
            totalBytes: total,
            status: 'done'
        })

        log.info(`[TranslateModel] 下载完成: ${targetPath}`)
        resolve()
    })
}

/**
 * 删除翻译模型
 */
export function deleteTranslateModel(modelAlias: string): void {
    const modelsDir = getTranslateModelsDir()
    const modelPath = path.join(modelsDir, `${modelAlias}.gguf`)

    if (fs.existsSync(modelPath)) {
        fs.unlinkSync(modelPath)
        log.info(`[TranslateModel] 已删除: ${modelPath}`)
    }
}
