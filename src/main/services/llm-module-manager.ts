/**
 * LLM 模块管理器
 * 支持从 GitHub Releases 远程下载 @electron/llm 模块
 * 下载后解压到 userData/modules/llm 目录
 */
import { app, BrowserWindow, net } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import log from '../../utils/log'

/** LLM 模块版本（与 @electron/llm 版本对应，更新此版本号会触发重新安装） */
const LLM_MODULE_VERSION = '1.1.4'

/** GitHub Releases 远程下载地址 */
const LLM_MODULE_REMOTE_URL = `https://github.com/oyjjforever/comic-reader/releases/download/llm-module-v${LLM_MODULE_VERSION}/llm-module-${process.platform}-${process.arch}.zip`

/** 模块存放根目录 */
function getModulesRoot(): string {
    return path.join(app.getPath('userData'), 'modules')
}

/** LLM 模块目录 */
export function getLlmModuleDir(): string {
    return path.join(getModulesRoot(), 'llm')
}

/** 版本信息文件路径 */
function getVersionFilePath(): string {
    return path.join(getLlmModuleDir(), 'version.json')
}

/** 模块入口文件路径（@electron/llm 的主入口） */
function getModuleEntryPath(): string {
    return path.join(getLlmModuleDir(), 'node_modules', '@electron', 'llm')
}

/**
 * 获取内置 ZIP 包路径
 * 开发环境：项目根目录/resources/llm-module/llm-module.zip
 * 生产环境：app.asar.unpacked/resources/llm-module/llm-module.zip（通过 extraResources）
 */
function getBundledZipPath(): string {
    // 判断是否为开发环境
    const isDev = !app.isPackaged
    // 平台特定的 ZIP 文件名
    const zipFileName = `llm-module-${process.platform}-${process.arch}.zip`

    if (isDev) {
        // 开发环境：从项目根目录的 resources 读取
        return path.join(process.cwd(), 'resources', 'llm-module', zipFileName)
    } else {
        // 生产环境：从 extraResources 读取
        // electron-builder 会将 extraResources 放在 app.asar.unpacked 同级目录
        return path.join(process.resourcesPath, 'llm-module', zipFileName)
    }
}

/**
 * 关键依赖包列表（node-llama-cpp 的必需依赖）
 * 用于校验模块安装完整性
 */
const CRITICAL_DEPENDENCIES = [
    'lifecycle-utils',
    'node-llama-cpp',
    '@node-llama-cpp/win-x64'
]

/**
 * 检查 LLM 模块是否已安装
 */
export function isLlmModuleInstalled(): boolean {
    const entryPath = getModuleEntryPath()
    const pkgPath = path.join(entryPath, 'package.json')
    return fs.existsSync(pkgPath)
}

/**
 * 校验关键依赖是否完整
 * 如果缺失任何关键依赖，返回 false
 */
export function validateLlmModuleDependencies(): { valid: boolean; missing: string[] } {
    const nodeModulesDir = path.join(getLlmModuleDir(), 'node_modules')
    const missing: string[] = []

    for (const dep of CRITICAL_DEPENDENCIES) {
        const depPath = path.join(nodeModulesDir, dep, 'package.json')
        if (!fs.existsSync(depPath)) {
            missing.push(dep)
        }
    }

    return { valid: missing.length === 0, missing }
}

/**
 * 检查内置 ZIP 包是否存在
 */
export function isBundledZipAvailable(): boolean {
    const zipPath = getBundledZipPath()
    return fs.existsSync(zipPath)
}

/**
 * 获取已安装的模块版本信息
 */
export function getLlmModuleInfo(): {
    installed: boolean
    version: string | null
    installedAt: string | null
    moduleDir: string
    bundledZipAvailable: boolean
} {
    const versionPath = getVersionFilePath()
    let version: string | null = null
    let installedAt: string | null = null

    try {
        if (fs.existsSync(versionPath)) {
            const info = JSON.parse(fs.readFileSync(versionPath, 'utf-8'))
            version = info.version || null
            installedAt = info.installedAt || null
        }
    } catch {
        // ignore
    }

    return {
        installed: isLlmModuleInstalled(),
        version,
        installedAt,
        moduleDir: getLlmModuleDir(),
        bundledZipAvailable: isBundledZipAvailable()
    }
}

/**
 * 解压 ZIP 文件
 */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true })
    }

    // 尝试使用 7zip
    const sevenZipPaths = [
        'C:\\Program Files\\7-Zip\\7z.exe',
        'C:\\Program Files (x86)\\7-Zip\\7z.exe',
        process.env['ProgramFiles'] + '\\7-Zip\\7z.exe',
        process.env['ProgramFiles(x86)'] + '\\7-Zip\\7z.exe'
    ]

    for (const p of sevenZipPaths) {
        if (fs.existsSync(p)) {
            return new Promise((resolve, reject) => {
                const child = spawn(p, ['x', zipPath, `-o${destDir}`, '-y'])
                child.on('close', (code) => {
                    if (code === 0) resolve()
                    else reject(new Error(`7zip 解压失败，退出码: ${code}`))
                })
                child.on('error', (err) => {
                    reject(new Error(`7zip 错误: ${err.message}`))
                })
            })
        }
    }

    // 使用 Node.js 的 zip-lib
    try {
        const { extract } = require('zip-lib')
        await extract(zipPath, destDir)
    } catch {
        throw new Error('解压失败：未找到 7-Zip，请安装 7-Zip 或手动解压')
    }
}

/**
 * 递归删除目录
 */
function cleanupPath(targetPath: string): void {
    try {
        if (!fs.existsSync(targetPath)) return
        const stat = fs.statSync(targetPath)
        if (stat.isDirectory()) {
            fs.rmSync(targetPath, { recursive: true, force: true })
        } else {
            fs.unlinkSync(targetPath)
        }
    } catch {
        // 忽略清理错误
    }
}

/**
 * 从远程 URL 下载文件到指定路径（支持重定向和进度回调）
 */
function downloadFile(
    url: string,
    destPath: string,
    onProgress: (percent: number) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = net.request(url)
        let totalBytes = 0
        let receivedBytes = 0

        request.on('response', (response) => {
            // 处理重定向（GitHub Releases 会有 302 重定向）
            const statusCode = response.statusCode
            if (statusCode >= 300 && statusCode < 400) {
                const location = response.headers['location']
                if (location) {
                    const redirectUrl = Array.isArray(location) ? location[0] : location
                    log.info(`[LLM Module] 重定向到: ${redirectUrl}`)
                    downloadFile(redirectUrl, destPath, onProgress)
                        .then(resolve)
                        .catch(reject)
                    return
                }
            }

            if (statusCode !== 200) {
                reject(new Error(`下载失败，HTTP 状态码: ${statusCode}`))
                return
            }

            const contentLength = response.headers['content-length']
            if (contentLength) {
                totalBytes = parseInt(
                    Array.isArray(contentLength) ? contentLength[0] : contentLength,
                    10
                )
            }

            const fileStream = fs.createWriteStream(destPath)

            fileStream.on('error', (err) => {
                fileStream.destroy()
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath)
                }
                reject(new Error(`文件写入失败: ${err.message}`))
            })

            response.on('data', (chunk: Buffer) => {
                receivedBytes += chunk.length
                fileStream.write(chunk)
                if (totalBytes > 0) {
                    onProgress(Math.round((receivedBytes / totalBytes) * 100))
                }
            })

            response.on('end', () => {
                fileStream.end()
                resolve()
            })

            response.on('error', (err: any) => {
                fileStream.destroy()
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath)
                }
                reject(new Error(`下载响应错误: ${err.message}`))
            })
        })

        request.on('error', (err) => {
            if (fs.existsSync(destPath)) {
                fs.unlinkSync(destPath)
            }
            reject(new Error(`下载请求失败: ${err.message}`))
        })

        request.end()
    })
}

/**
 * 安装模块的核心逻辑（从 ZIP 文件解压安装）
 */
async function installFromZip(zipPath: string): Promise<{ success: boolean; error?: string }> {
    const moduleDir = getLlmModuleDir()

    log.info(`[LLM Module] 开始从 ZIP 安装: ${zipPath}`)

    try {
        // 如果旧模块存在，先删除
        if (fs.existsSync(moduleDir)) {
            cleanupPath(moduleDir)
        }

        // 确保目录存在
        if (!fs.existsSync(getModulesRoot())) {
            fs.mkdirSync(getModulesRoot(), { recursive: true })
        }

        // 解压
        await extractZip(zipPath, moduleDir)

        // 写入版本信息
        const versionInfo = {
            version: LLM_MODULE_VERSION,
            installedAt: new Date().toISOString(),
            platform: process.platform,
            arch: process.arch
        }
        fs.writeFileSync(getVersionFilePath(), JSON.stringify(versionInfo, null, 2), 'utf-8')

        log.info(`[LLM Module] 安装完成: ${moduleDir}`)
        return { success: true }
    } catch (err: any) {
        log.error(`[LLM Module] 安装失败: ${err.message}`)
        return { success: false, error: err.message }
    }
}

/**
 * 从内置 ZIP 包自动安装 LLM 模块
 * 首次运行时调用，无需用户交互
 */
export async function autoInstallLlmModule(): Promise<{ success: boolean; error?: string }> {
    // 如果已安装且版本匹配，检查依赖完整性
    if (isLlmModuleInstalled()) {
        const info = getLlmModuleInfo()
        if (info.version === LLM_MODULE_VERSION) {
            const validation = validateLlmModuleDependencies()
            if (validation.valid) {
                log.info('[LLM Module] 模块已安装且依赖完整，跳过安装')
                return { success: true }
            } else {
                log.warn(`[LLM Module] 模块已安装但依赖不完整，缺失: ${validation.missing.join(', ')}，重新安装`)
                // 继续执行重新安装
            }
        }
    }

    const zipPath = getBundledZipPath()

    if (!fs.existsSync(zipPath)) {
        log.warn(`[LLM Module] 内置 ZIP 包不存在: ${zipPath}，需要从远程下载`)
        return { success: false, error: '内置 ZIP 包不存在，请从设置页面手动下载安装' }
    }

    return installFromZip(zipPath)
}

/**
 * 从 GitHub Releases 远程下载并安装 LLM 模块
 * 带进度回调，通过 BrowserWindow 发送到渲染进程
 */
export async function downloadLlmModuleFromRemote(
    mainWindow: BrowserWindow
): Promise<{ success: boolean; error?: string }> {
    const modulesRoot = getModulesRoot()
    const tempZip = path.join(modulesRoot, `llm-module-download-${Date.now()}.zip`)

    log.info(`[LLM Module] 开始从远程下载: ${LLM_MODULE_REMOTE_URL}`)

    try {
        // 确保目录存在
        if (!fs.existsSync(modulesRoot)) {
            fs.mkdirSync(modulesRoot, { recursive: true })
        }

        // 下载 ZIP 文件，带进度
        await downloadFile(LLM_MODULE_REMOTE_URL, tempZip, (percent) => {
            mainWindow.webContents.send('llm:download-progress', {
                status: 'downloading',
                percent
            })
        })

        // 通知前端开始解压
        mainWindow.webContents.send('llm:download-progress', {
            status: 'extracting',
            percent: 100
        })

        // 从下载的 ZIP 安装
        const result = await installFromZip(tempZip)

        // 清理临时 ZIP 文件
        cleanupPath(tempZip)

        if (result.success) {
            mainWindow.webContents.send('llm:download-progress', {
                status: 'done',
                percent: 100
            })
        }

        return result
    } catch (err: any) {
        log.error(`[LLM Module] 远程下载失败: ${err.message}`)
        // 清理临时文件
        cleanupPath(tempZip)

        mainWindow.webContents.send('llm:download-progress', {
            status: 'error',
            percent: 0,
            error: err.message
        })

        return { success: false, error: err.message }
    }
}

/**
 * 动态加载已安装的 LLM 模块
 * @param getModelPath 获取模型路径的回调函数
 */
export async function loadLlmModule(
    getModelPath: (modelAlias: string) => string | null
): Promise<boolean> {
    if (!isLlmModuleInstalled()) {
        log.warn('[LLM Module] 模块未安装，无法加载')
        return false
    }

    try {
        const modulePath = getModuleEntryPath()
        log.info(`[LLM Module] 尝试加载模块: ${modulePath}`)

        // 动态 require 模块
        const llm = require(modulePath)
        await llm.loadElectronLlm({
            getModelPath
        })

        log.info('[LLM Module] 模块加载成功')
        return true
    } catch (err: any) {
        log.warn(`[LLM Module] 模块加载失败: ${err.message}`)
        return false
    }
}

/**
 * 卸载 LLM 模块（删除所有文件）
 */
export function uninstallLlmModule(): { success: boolean; error?: string } {
    const moduleDir = getLlmModuleDir()
    try {
        if (fs.existsSync(moduleDir)) {
            cleanupPath(moduleDir)
            log.info('[LLM Module] 已卸载')
        }
        return { success: true }
    } catch (err: any) {
        log.error(`[LLM Module] 卸载失败: ${err.message}`)
        return { success: false, error: err.message }
    }
}

/**
 * 获取模块目录大小（字节）
 */
export function getLlmModuleSize(): number {
    const moduleDir = getLlmModuleDir()
    if (!fs.existsSync(moduleDir)) return 0

    let totalSize = 0
    function walkDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                walkDir(fullPath)
            } else {
                try {
                    totalSize += fs.statSync(fullPath).size
                } catch {
                    // ignore
                }
            }
        }
    }
    walkDir(moduleDir)
    return totalSize
}
