/**
 * Whisper 模型管理器
 * 负责模型的下载、删除、状态检测
 */
import { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { net } from 'electron'
import type { WhisperModelName, ModelInfo } from '../../typings/subtitle'
import { MODEL_INFO, MODEL_DOWNLOAD_URLS } from '../../typings/subtitle'
import { getModelsDir } from './subtitle-config'
import log from '../../utils/log'

/** 获取模型文件路径 */
export function getModelPath(modelName: WhisperModelName): string {
    const modelFile = `ggml-${modelName}.bin`
    return path.join(getModelsDir(), modelFile)
}

/** 检查模型是否已下载 */
export function isModelDownloaded(modelName: WhisperModelName): boolean {
    const modelPath = getModelPath(modelName)
    return fs.existsSync(modelPath)
}

/** 获取所有模型信息 */
export function getAllModels(): ModelInfo[] {
    const modelsDir = getModelsDir()

    // 确保模型目录存在
    if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true })
    }

    return (Object.keys(MODEL_INFO) as WhisperModelName[]).map((name) => {
        const info = MODEL_INFO[name]
        const downloaded = isModelDownloaded(name)
        return {
            ...info,
            downloaded,
            path: downloaded ? getModelPath(name) : undefined
        }
    })
}

/** 下载模型 */
export async function downloadModel(
    modelName: WhisperModelName,
    mainWindow: BrowserWindow
): Promise<void> {
    const url = MODEL_DOWNLOAD_URLS[modelName]
    if (!url) {
        throw new Error(`未知的模型: ${modelName}`)
    }

    const modelsDir = getModelsDir()
    if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true })
    }

    const modelPath = getModelPath(modelName)
    const tempPath = modelPath + '.downloading'

    log.info(`[ModelManager] 开始下载模型: ${modelName}`, { url, modelPath })

    return new Promise((resolve, reject) => {
        const request = net.request(url)

        // 获取文件总大小
        let totalBytes = 0
        let receivedBytes = 0

        request.on('response', (response) => {
            const contentLength = response.headers['content-length']
            if (contentLength) {
                totalBytes = parseInt(Array.isArray(contentLength) ? contentLength[0] : contentLength, 10)
            }

            const fileStream = fs.createWriteStream(tempPath)

            fileStream.on('error', (err) => {
                log.error(`[ModelManager] 文件写入错误: ${err.message}`)
                fileStream.destroy()
                // 清理临时文件
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath)
                }
                reject(new Error(`文件写入失败: ${err.message}`))
            })

            response.on('data', (chunk: Buffer) => {
                receivedBytes += chunk.length
                fileStream.write(chunk)

                // 发送下载进度
                if (totalBytes > 0) {
                    const percent = Math.round((receivedBytes / totalBytes) * 100)
                    mainWindow.webContents.send('subtitle:download-progress', {
                        model: modelName,
                        percent,
                        receivedBytes,
                        totalBytes
                    })
                }
            })

            response.on('end', () => {
                fileStream.end()

                // 下载完成，重命名临时文件
                if (fs.existsSync(tempPath)) {
                    fs.renameSync(tempPath, modelPath)
                }

                log.info(`[ModelManager] 模型下载完成: ${modelName}`, {
                    size: `${(receivedBytes / 1024 / 1024).toFixed(1)}MB`
                })

                mainWindow.webContents.send('subtitle:download-progress', {
                    model: modelName,
                    percent: 100,
                    receivedBytes,
                    totalBytes
                })

                resolve()
            })

            response.on('error', (err: any) => {
                log.error(`[ModelManager] 下载响应错误: ${err.message}`)
                fileStream.destroy()
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath)
                }
                reject(new Error(`下载失败: ${err.message}`))
            })
        })

        request.on('error', (err) => {
            log.error(`[ModelManager] 下载请求错误: ${err.message}`)
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath)
            }
            reject(new Error(`下载请求失败: ${err.message}`))
        })

        request.end()
    })
}

/** 删除模型 */
export function deleteModel(modelName: WhisperModelName): void {
    const modelPath = getModelPath(modelName)
    if (fs.existsSync(modelPath)) {
        fs.unlinkSync(modelPath)
        log.info(`[ModelManager] 模型已删除: ${modelName}`)
    }
}

/** 获取已下载模型中最大的（用于默认选择） */
export function getBestAvailableModel(): WhisperModelName | null {
    const priority: WhisperModelName[] = ['small', 'base', 'tiny', 'medium', 'large']
    for (const model of priority) {
        if (isModelDownloaded(model)) {
            return model
        }
    }
    return null
}
