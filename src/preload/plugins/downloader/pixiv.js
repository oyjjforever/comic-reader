import Api from './api.js'
import fsp from 'fs/promises'
import file from '../file.ts'
import { spawnSync, spawn } from 'child_process'
import path from 'path'
const api = new Api({
  proxyMode: 'Custom',
  proxyHost: '127.0.0.1',
  proxyPort: '7890'
})
async function getArtworksByUserId(userId) {
  const cookies = await api.getCookies('.pixiv.net')
  const res = await api.get({
    url: `https://www.pixiv.net/ajax/user/${userId}/profile/all?sensitiveFilterMode=userSetting&lang=zh`,
    headers: {
      Cookie: cookies
    }
  })
  return {
    illusts: Object.keys(res.body.illusts || {}).reverse(),
    manga: Object.keys(res.body.manga || {}).reverse()
  }
}
async function getArtworkInfo(artworkId) {
  const res = await api.get({
    url: `https://www.pixiv.net/ajax/illust/${artworkId}?lang=zh`
  })
  return {
    title: res.body.title,
    author: res.body.userName,
    illustType: res.body.illustType
  }
}

async function getArtworkImages(artworkId) {
  const cookies = await api.getCookies('.pixiv.net')
  const res = await api.get({
    url: `https://www.pixiv.net/ajax/illust/${artworkId}/pages?lang=zh`,
    headers: {
      Cookie: cookies
    }
  })
  return res.body
}
async function getMangaInfo(artworkId) {
  const cookies = await api.getCookies('.pixiv.net')
  const res = await api.get({
    url: `https://www.pixiv.net/ajax/series/${artworkId}?p=1&lang=zh`,
    headers: {
      Cookie: cookies
    }
  })
  return {
    title: res.body?.extraData?.meta?.title,
    series: (res.body?.page?.series || []).map((_) => _.workId).reverse()
  }
}

async function getImage(url) {
  const res = await api.get({
    url,
    responseType: 'arraybuffer',
    headers: { Referer: 'https://www.pixiv.net/' }
  })
  let imageStream = Buffer.from(res)
  const blob = new Blob([imageStream])
  const coverUrl = URL.createObjectURL(blob)
  return coverUrl
}

async function downloadImage(url, savePath) {
  const res = await api.get({
    url,
    responseType: 'arraybuffer',
    headers: { Referer: 'https://www.pixiv.net/' }
  })
  let imageData = Buffer.from(res)
  file.ensureDir(savePath)
  await fsp.writeFile(savePath, imageData)
}
async function downloadGif(artworkId, savePath, onProgress) {
  const cookies = await api.getCookies('.pixiv.net')
  const info = await api.get({
    url: `https://www.pixiv.net/ajax/illust/${artworkId}/ugoira_meta?lang=zh`,
    headers: {
      Referer: 'https://www.pixiv.net/',
      Cookie: cookies
    }
  })
  onProgress?.(30)
  const url = info.body.originalSrc
  const fps = Math.ceil(info.body.frames.length / 5)
  const res = await api.get({
    url,
    responseType: 'arraybuffer',
    headers: { Referer: 'https://www.pixiv.net/' }
  })
  let imageData = Buffer.from(res)
  const filePath = path.join(savePath, 'temp')
  file.ensureDir(filePath)
  await fsp.writeFile(`${filePath}.zip`, imageData)
  await file.extractFile(`${filePath}.zip`, `${filePath}`)
  onProgress?.(60)
  await generateGif(filePath, `${artworkId}.mp4`, fps)
  onProgress?.(100)
}
async function generateGif(folder, outputName, fps) {
  // 先检查并安装依赖
  if (!checkAndInstallDependencies()) {
    console.error('依赖安装失败，无法执行 Python 脚本')
    return
  }
  await new Promise((resolve, reject) => {
    const py = spawn('python', [getPythonScriptPath('gif.py'), folder, outputName, fps], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    })
    let stdout = ''
    let stderr = ''

    py.stdout.on('data', (data) => {
      const text = data.toString()
      stdout += text
      console.log('[python stdout]', text.trim())
    })

    py.stderr.on('data', (data) => {
      const text = data.toString()
      stderr += text
      console.error('[python stderr]', text.trim())
    })

    py.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr || `Python process exited with code ${code}`))
    })
    py.on('error', (error) => {
      reject(error)
    })
  })
}

function checkAndInstallDependencies() {
  try {
    // 1) 检查 imageio
    const checkImageio = spawnSync('python', ['-c', "import imageio; print('imageio ok')"])
    if (checkImageio.status !== 0) {
      console.log('检测到未安装 imageio，正在安装...')
      const installImageio = spawnSync('python', ['-m', 'pip', 'install', 'imageio'], {
        stdio: 'inherit'
      })
      if (installImageio.status !== 0) {
        console.error('安装 imageio 失败')
        return false
      }
      console.log('imageio 安装成功')
    } else {
      console.log('imageio 已安装')
    }

    // 2) 检查 imageio-ffmpeg（用于写 mp4）
    const checkFFMPEG = spawnSync('python', [
      '-c',
      "import imageio_ffmpeg; print('imageio-ffmpeg ok')"
    ])
    if (checkFFMPEG.status !== 0) {
      console.log('检测到未安装 imageio-ffmpeg，正在安装...')
      const installFFMPEG = spawnSync('python', ['-m', 'pip', 'install', 'imageio-ffmpeg'], {
        stdio: 'inherit'
      })
      if (installFFMPEG.status !== 0) {
        console.error('安装 imageio-ffmpeg 失败')
        return false
      }
      console.log('imageio-ffmpeg 安装成功')
    } else {
      console.log('imageio-ffmpeg 已安装')
    }

    return true
  } catch (error) {
    console.error('检查依赖时出错:', error)
    return false
  }
}
function getPythonScriptPath(scriptName) {
  const isDev = process.env.NODE_ENV === 'development'
  let basePath

  if (isDev) {
    // 开发时，直接从项目根目录读取
    basePath = path.join('python_scripts')
  } else {
    // 打包后，extraResources 中的文件位于 resources 目录
    // 在 Windows 上，路径类似于 resources/python_scripts
    // 在 macOS 上，路径类似于 Contents/Resources/python_scripts
    basePath = path.join(process.resourcesPath, 'python_scripts')
  }

  return path.join(basePath, scriptName)
}
export default {
  getArtworksByUserId,
  getMangaInfo,
  getArtworkInfo,
  getArtworkImages,
  getImage,
  downloadImage,
  downloadGif,
  generateGif
}
