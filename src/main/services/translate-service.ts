/**
 * 翻译服务
 * 使用 @vitalets/google-translate-api 进行字幕翻译
 * 支持翻译缓存和批量翻译
 */
import { BrowserWindow, app } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import log from '../../utils/log'
import type { SubtitleSegment, TranslateTarget, TranslateResult } from '../../typings/subtitle'
import { readSubtitleSettings } from './subtitle-config'

/** 翻译缓存：key = MD5(text + from + to) */
const translateCache = new Map<string, string>()

/** 翻译请求队列，避免并发过多被限流 */
let translateQueue: Promise<void> = Promise.resolve()

/**
 * 获取翻译缓存目录
 */
function getTranslateCacheDir(): string {
    const settings = readSubtitleSettings()
    const basePath = settings.subtitleDataPath || app.getPath('userData')
    const dir = path.join(basePath, 'translate-cache')
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    return dir
}

/**
 * 生成缓存 key
 */
function getCacheKey(text: string, from: string, to: string): string {
    const raw = `${text}|${from}|${to}`
    return crypto.createHash('md5').update(raw, 'utf-8').digest('hex')
}

/**
 * 从磁盘缓存加载翻译
 */
function loadCacheFromDisk(cacheKey: string): string | null {
    const cacheDir = getTranslateCacheDir()
    const cachePath = path.join(cacheDir, `${cacheKey}.txt`)
    if (fs.existsSync(cachePath)) {
        try {
            return fs.readFileSync(cachePath, 'utf-8')
        } catch {
            return null
        }
    }
    return null
}

/**
 * 保存翻译到磁盘缓存
 */
function saveCacheToDisk(cacheKey: string, translatedText: string): void {
    try {
        const cacheDir = getTranslateCacheDir()
        const cachePath = path.join(cacheDir, `${cacheKey}.txt`)
        fs.writeFileSync(cachePath, translatedText, 'utf-8')
    } catch (e) {
        log.warn('[TranslateService] 保存翻译缓存失败:', e)
    }
}

/**
 * 翻译单条文本
 * 带缓存和限流
 */
export async function translateText(
    text: string,
    from: string,
    to: string
): Promise<string> {
    if (!text || !text.trim()) return ''

    // 检查内存缓存
    const cacheKey = getCacheKey(text, from, to)
    if (translateCache.has(cacheKey)) {
        return translateCache.get(cacheKey)!
    }

    // 检查磁盘缓存
    const diskCache = loadCacheFromDisk(cacheKey)
    if (diskCache !== null) {
        translateCache.set(cacheKey, diskCache)
        return diskCache
    }

    // 执行翻译（排队避免并发过多）
    return new Promise<string>((resolve, reject) => {
        translateQueue = translateQueue.then(async () => {
            try {
                const { translate } = await import('@vitalets/google-translate-api')
                const result = await translate(text, {
                    from: from === 'auto' ? 'auto' : from,
                    to: to
                })

                const translatedText = result.text || ''

                // 缓存结果
                translateCache.set(cacheKey, translatedText)
                saveCacheToDisk(cacheKey, translatedText)

                resolve(translatedText)
            } catch (err: any) {
                log.error('[TranslateService] 翻译失败:', err?.message)
                reject(new Error(`翻译失败: ${err?.message}`))
            }
        })
    })
}

/**
 * 批量翻译字幕段落
 * 逐条翻译并通过 IPC 推送进度
 */
export async function translateSegments(
    segments: SubtitleSegment[],
    from: string,
    to: string,
    mainWindow: BrowserWindow
): Promise<SubtitleSegment[]> {
    const translatedSegments: SubtitleSegment[] = []
    const total = segments.length

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]

        try {
            const translatedText = await translateText(seg.text, from, to)

            const translatedSeg: SubtitleSegment = {
                ...seg,
                text: translatedText || seg.text
            }
            translatedSegments.push(translatedSeg)

            // 推送单条翻译结果（流式显示）
            mainWindow.webContents.send('subtitle:translate-segment', {
                segment: translatedSeg,
                index: i
            })

            // 推送进度
            mainWindow.webContents.send('subtitle:translate-progress', {
                current: i + 1,
                total,
                percent: Math.round(((i + 1) / total) * 100)
            })
        } catch (err: any) {
            log.warn(`[TranslateService] 段落 ${seg.id} 翻译失败:`, err?.message)
            // 翻译失败时保留原文
            const fallbackSeg = { ...seg }
            translatedSegments.push(fallbackSeg)
            mainWindow.webContents.send('subtitle:translate-segment', {
                segment: fallbackSeg,
                index: i
            })
        }

        // 每次翻译后稍微延迟，避免被 Google 限流
        await new Promise(resolve => setTimeout(resolve, 200))
    }

    return translatedSegments
}

/**
 * 清理翻译缓存
 */
export function clearTranslateCache(): void {
    const cacheDir = getTranslateCacheDir()
    if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir)
        for (const file of files) {
            try {
                fs.unlinkSync(path.join(cacheDir, file))
            } catch {
                // 忽略删除失败
            }
        }
    }
    translateCache.clear()
    log.info('[TranslateService] 翻译缓存已清理')
}
