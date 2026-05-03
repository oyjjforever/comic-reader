#!/usr/bin/env node
/**
 * LLM 模块打包脚本
 * 自动收集 @electron/llm 及其所有传递依赖，打包为 ZIP 文件
 *
 * 用法:
 *   node scripts/package-llm-module.js [version]
 *
 * 示例:
 *   node scripts/package-llm-module.js 1.1.1
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const VERSION = process.argv[2] || '1.1.4'
const PLATFORM = process.platform
const ARCH = process.arch
const OUTPUT_NAME = `llm-module-${PLATFORM}-${ARCH}`
const OUTPUT_DIR = path.resolve(__dirname, '..', 'resources', 'llm-module')
const TEMP_DIR = path.resolve(__dirname, '..', 'temp', 'llm-module-pack')
const ROOT_DIR = path.resolve(__dirname, '..')

// 需要打包的顶层包
const TOP_LEVEL_PACKAGES = ['@electron/llm', 'node-llama-cpp']

// 排除的文件模式（不打包的文件，减小体积）
// 注意：模式必须精确，避免误杀生产代码文件
const EXCLUDE_PATTERNS = [
  /\.git$/i,
  /\.github$/i,
  /^CHANGELOG/i, // 以 CHANGELOG 开头的文件
  /^HISTORY/i,
  /^LICENSE/i,
  /^README/i,
  /^readme/i,
  /\.tsbuildinfo$/i,
  /^tests?$/i, // 只匹配名为 "test" 或 "tests" 的目录/文件（不匹配 testCmakeBinary.js 等）
  /__tests__/i,
  /\.spec\./i,
  /\.test\./i,
  /^docs$/i, // 只匹配名为 "docs" 的目录
  /^example/i,
  /\.d\.ts$/i // 类型声明文件
]

// 排除的包（不需要打包的包名模式，减小体积）
// 排除其他平台和 GPU 加速变体的原生二进制
const EXCLUDE_PACKAGES = [
  /@node-llama-cpp\/linux-/i, // Linux 平台
  /@node-llama-cpp\/mac-/i, // macOS 平台
  /@node-llama-cpp\/.*-cuda/i, // CUDA 加速变体（~580MB）
  /@node-llama-cpp\/.*-vulkan/i, // Vulkan 加速变体（~89MB）
  /@reflink\/reflink-darwin/i, // macOS
  /@reflink\/reflink-linux/i // Linux
]

/**
 * 递归收集包的所有传递依赖
 * 使用包路径（而非包名）作为去重键，确保同一包的不同版本都能被处理
 *
 * @param packageName 包名
 * @param fromDir 解析包的起始目录（用于正确解析嵌套 node_modules）
 * @param visitedPaths 已访问的包路径集合（防止循环）
 * @param allCollected 收集到的所有包信息 Map: packageName -> pkgPath
 */
function collectDependencies(
  packageName,
  fromDir,
  visitedPaths = new Set(),
  allCollected = new Map()
) {
  let pkgPath
  try {
    // 从指定目录解析包路径（支持嵌套 node_modules）
    const entryPath = require.resolve(packageName, { paths: [fromDir] })
    // 找到包的根目录（包含 package.json 的目录）
    let dir = path.dirname(entryPath)
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        pkgPath = dir
        break
      }
      dir = path.dirname(dir)
    }
    if (!pkgPath) pkgPath = dir
  } catch {
    console.warn(`  警告: 无法从 ${fromDir} 解析包 ${packageName}，跳过`)
    return allCollected
  }

  // 用路径去重（同一包的不同版本在不同路径，都需要处理）
  if (visitedPaths.has(pkgPath)) return allCollected
  visitedPaths.add(pkgPath)

  // 记录包名到路径的映射
  // 同名包优先保留顶层（路径更短的）版本，确保运行时可被正确解析
  if (!allCollected.has(packageName)) {
    allCollected.set(packageName, pkgPath)
  } else {
    const existingPath = allCollected.get(packageName)
    const existingRel = path.relative(path.join(ROOT_DIR, 'node_modules'), existingPath)
    const currentRel = path.relative(path.join(ROOT_DIR, 'node_modules'), pkgPath)
    // 当前路径层级更浅（更靠近顶层），替换已有版本
    if (currentRel.split(path.sep).length < existingRel.split(path.sep).length) {
      console.log(`    优先选择顶层版本: ${packageName} -> ${currentRel} (替代 ${existingRel})`)
      allCollected.set(packageName, pkgPath)
    }
  }

  // 读取 package.json 获取依赖
  try {
    const pkgJsonPath = path.join(pkgPath, 'package.json')
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
    const deps = { ...pkgJson.dependencies, ...pkgJson.optionalDependencies }

    for (const depName of Object.keys(deps)) {
      // 跳过 @electron/llm 和 node-llama-cpp（已作为顶层包处理）
      if (TOP_LEVEL_PACKAGES.includes(depName)) continue
      // 跳过排除的包
      if (EXCLUDE_PACKAGES.some((pattern) => pattern.test(depName))) continue
      // 从当前包的目录解析依赖（正确处理嵌套 node_modules）
      collectDependencies(depName, pkgPath, visitedPaths, allCollected)
    }
  } catch {
    // ignore
  }

  return allCollected
}

/**
 * 检查文件路径是否应该被排除
 */
function shouldExclude(filePath) {
  return EXCLUDE_PATTERNS.some((pattern) => pattern.test(filePath))
}

/**
 * 递归复制目录，排除不需要的文件
 */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }

  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (shouldExclude(entry.name)) continue

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      if (shouldExclude(entry.name)) continue
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

/**
 * 解析包的根目录路径
 */
function resolvePackageRoot(packageName) {
  try {
    const entryPath = require.resolve(packageName, { paths: [ROOT_DIR] })
    let dir = path.dirname(entryPath)
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        return dir
      }
      dir = path.dirname(dir)
    }
    return dir
  } catch {
    return null
  }
}

// ========== 主流程 ==========

console.log('============================================================')
console.log('打包 LLM 模块')
console.log(`版本: ${VERSION}`)
console.log(`平台: ${PLATFORM}-${ARCH}`)
console.log(`输出: ${OUTPUT_DIR}/${OUTPUT_NAME}.zip`)
console.log('============================================================')

// 检查 @electron/llm 是否存在
const llmRoot = resolvePackageRoot('@electron/llm')
if (!llmRoot) {
  console.error('错误: node_modules/@electron/llm 不存在，请先运行 npm install')
  process.exit(1)
}

// 收集所有依赖
console.log('\n收集依赖包...')
const allCollected = new Map()
for (const pkg of TOP_LEVEL_PACKAGES) {
  console.log(`  分析 ${pkg} 的依赖...`)
  collectDependencies(pkg, ROOT_DIR, new Set(), allCollected)
}
console.log(`  共需打包 ${allCollected.size} 个包`)

// 创建临时目录
console.log('\n创建临时目录...')
if (fs.existsSync(TEMP_DIR)) {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true })
}
fs.mkdirSync(path.join(TEMP_DIR, 'node_modules'), { recursive: true })

// 复制所有包（展平到顶层 node_modules，确保运行时模块解析正确）
console.log('\n复制包文件（展平依赖树到顶层 node_modules）...')
for (const [pkgName, pkgRoot] of allCollected) {
  if (!pkgRoot || !fs.existsSync(pkgRoot)) {
    console.warn(`  警告: ${pkgName} 路径无效，跳过`)
    continue
  }

  // 始终复制到顶层 node_modules/<pkgName>/
  // 这样 Node.js 从任何包 require() 时都能通过标准模块解析找到依赖
  const destPath = path.join(TEMP_DIR, 'node_modules', pkgName)

  console.log(`  复制 ${pkgName} -> node_modules/${pkgName}`)
  copyDirRecursive(pkgRoot, destPath)
}

// 写入版本信息
console.log('\n写入版本信息...')
const versionInfo = {
  version: VERSION,
  platform: PLATFORM,
  arch: ARCH,
  packagedAt: new Date().toISOString()
}
fs.writeFileSync(path.join(TEMP_DIR, 'version.json'), JSON.stringify(versionInfo, null, 2), 'utf-8')

// 创建输出目录
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

// 打包为 ZIP
const outputPath = path.join(OUTPUT_DIR, `${OUTPUT_NAME}.zip`)
if (fs.existsSync(outputPath)) {
  fs.unlinkSync(outputPath)
}

console.log('\n打包 ZIP...')
// 使用 7-Zip 或 PowerShell
const sevenZipPaths = [
  'C:\\Program Files\\7-Zip\\7z.exe',
  'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  '/usr/bin/7z',
  '/usr/local/bin/7z'
]

let sevenZip = null
for (const p of sevenZipPaths) {
  if (fs.existsSync(p)) {
    sevenZip = p
    break
  }
}

if (sevenZip) {
  console.log(`  使用 7-Zip: ${sevenZip}`)
  execSync(`"${sevenZip}" a -tzip "${outputPath}" . -mx=5`, {
    cwd: TEMP_DIR,
    stdio: 'inherit'
  })
} else {
  console.log('  使用 PowerShell Compress-Archive...')
  const psCmd = `Compress-Archive -Path '${TEMP_DIR}\\*' -DestinationPath '${outputPath}' -Force`
  execSync(`powershell -Command "${psCmd}"`, { stdio: 'inherit' })
}

// 清理临时目录
console.log('\n清理临时文件...')
fs.rmSync(TEMP_DIR, { recursive: true, force: true })

// 输出文件大小
const stats = fs.statSync(outputPath)
const sizeMB = (stats.size / 1024 / 1024).toFixed(1)

console.log('\n============================================================')
console.log('打包完成！')
console.log(`文件: ${outputPath}`)
console.log(`大小: ${sizeMB} MB`)
console.log('')
console.log('该文件已自动放置在 resources/llm-module/ 目录中')
console.log('electron-builder 打包时会自动包含到安装包内')
console.log('============================================================')
