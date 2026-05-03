/**
 * LLM 模块管理器
 * 从内置的 ZIP 包自动解压安装 @electron/llm 模块
 * ZIP 包位于 resources/llm-module/ 目录，打包时包含在安装包中
 * 运行时解压到 userData/modules/llm 目录
 */
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import log from '../../utils/log'

/** LLM 模块版本（与 @electron/llm 版本对应，更新此版本号会触发重新安装） */
const LLM_MODULE_VERSION = '1.1.4'

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
    const moduleDir = getLlmModuleDir()

    if (!fs.existsSync(zipPath)) {
        log.warn(`[LLM Module] 内置 ZIP 包不存在: ${zipPath}`)
        return { success: false, error: '内置 ZIP 包不存在' }
    }

    log.info(`[LLM Module] 开始从内置 ZIP 安装: ${zipPath}`)

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
