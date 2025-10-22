import { reactive, ref, nextTick } from 'vue'
import { createDiscreteApi } from 'naive-ui'

type TaskStatus = 'pending' | 'running' | 'paused' | 'success' | 'error' | 'canceled'

export interface DownloadProgress {
  chapter?: { index: number; total: number }
  image?: { index: number; total: number }
  percent?: number
}

export interface DownloadTask {
  id: string
  site: 'jmtt' | 'pixiv' | 'twitter'
  title: string
  status: TaskStatus
  progress?: DownloadProgress
  createdAt: number
  updatedAt: number
  payload: any
  _pause?: boolean
  _cancel?: boolean
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const tasks = reactive<DownloadTask[]>([])
const { message } = createDiscreteApi(['message'])

let runnerActive = false

function findNextPending(): DownloadTask | undefined {
  return tasks.find((t) => t.status === 'pending')
}

function updateTask(t: DownloadTask, patch: Partial<DownloadTask>) {
  Object.assign(t, patch)
  t.updatedAt = Date.now()
}

export function addTask(task: Omit<DownloadTask, 'id' | 'status' | 'createdAt' | 'updatedAt'>) {
  const full: DownloadTask = {
    ...task,
    id: uid(),
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  tasks.push(full)
  // 加入队列提示
  try {
    message.info(`已加入队列：${full.title}`)
  } catch { }
  startRunner()
  return full.id
}

export function pauseTask(id: string) {
  const t = tasks.find((x) => x.id === id)
  if (!t) return
  t._pause = true
  if (t.status === 'running') updateTask(t, { status: 'paused' })
}

export function resumeTask(id: string) {
  const t = tasks.find((x) => x.id === id)
  if (!t) return
  t._pause = false
  if (t.status === 'paused') updateTask(t, { status: 'pending' })
  startRunner()
}

export function cancelTask(id: string) {
  const t = tasks.find((x) => x.id === id)
  if (!t) return
  t._cancel = true
  if (t.status === 'running' || t.status === 'paused') updateTask(t, { status: 'canceled' })
}

export function deleteTask(id: string) {
  const idx = tasks.findIndex((x) => x.id === id)
  if (idx !== -1) {
    // 若在运行，先标记取消
    tasks[idx]._cancel = true
    tasks.splice(idx, 1)
  }
}

async function waitWhilePaused(task: DownloadTask) {
  while (task._pause && !task._cancel) {
    await new Promise((r) => setTimeout(r, 300))
  }
}

async function runJmtt(task: DownloadTask) {
  const { jmtt, file } = (window as any)
  const { chapter, comicInfo, baseDir } = task.payload as {
    chapter: any
    comicInfo: any
    baseDir: string
  }
  try {
    updateTask(task, { status: 'running', title: comicInfo.name })
    const chapterFolder =
      (comicInfo.chapter_infos?.length || 0) > 1 ? `${baseDir}/第${chapter.index}章` : baseDir
    const images: string[] = await jmtt.getChapterImages(chapter.id)
    for (let i = 0; i < images.length; i++) {
      if (task._cancel) throw new Error('任务已取消')
      await waitWhilePaused(task)
      const savePath = `${chapterFolder}/${i.toString().padStart(5, '0')}.webp`
      await jmtt.downloadImage(savePath, images[i])
      updateTask(task, {
        progress: {
          chapter: { index: chapter.index, total: comicInfo.chapter_infos.length || 1 },
          image: { index: i + 1, total: images.length }
        }
      })
    }
    updateTask(task, { status: 'success' })
    try {
      message.success(`下载成功：${comicInfo.name}`)
    } catch { }
  } catch (e: any) {
    if (task._cancel) {
      updateTask(task, { status: 'canceled' })
      // 取消不提示
      return
    }
    updateTask(task, { status: 'error' })
    try {
      message.error(`下载失败：${comicInfo?.name || task.title}${e ? ' - ' + (e?.message || e) : ''}`)
    } catch { }
  } finally {
    // 章间暂停 5s 避免频繁请求
    await new Promise((r) => setTimeout(r, 5000))
  }
}

async function runPixiv(task: DownloadTask) {
  const { pixiv, file } = (window as any)
  const { artworkId, baseDir } = task.payload as { artworkId: string; baseDir: string }
  try {
    updateTask(task, { status: 'running', title: `作品 ${artworkId}` })
    const artworkInfo = await pixiv.getArtworkInfo(artworkId)
    const images: string[] = await pixiv.getArtworkImages(artworkId)
    const workDir = `${baseDir}/${file.simpleSanitize(artworkInfo.author)}/${file.simpleSanitize(artworkInfo.title)}`
    for (let i = 0; i < images.length; i++) {
      if (task._cancel) throw new Error('任务已取消')
      await waitWhilePaused(task)
      const url = images[i]
      const fileName = `${i.toString().padStart(5, '0')}.${url.split('.').pop() || 'jpg'}`
      const savePath = `${workDir}/${fileName}`
      await pixiv.downloadImage(url, savePath)
      updateTask(task, {
        title: artworkInfo.title,
        progress: {
          image: { index: i + 1, total: images.length }
        }
      })
    }
    updateTask(task, { status: 'success' })
    try {
      message.success(`下载成功：${artworkInfo.title}`)
    } catch { }
  } catch (e: any) {
    if (task._cancel) {
      updateTask(task, { status: 'canceled' })
      // 取消不提示
      return
    }
    updateTask(task, { status: 'error' })
    try {
      message.error(`下载失败：${task.title}${e ? ' - ' + (e?.message || e) : ''}`)
    } catch { }
  }
}

async function runTwitter(task: DownloadTask) {
  const { twitter, file } = (window as any)
  const { author, userId, cookies, baseDir } = task.payload as {
    author: string
    userId: string
    cookies: string
    baseDir: string
  }
  try {
    updateTask(task, { status: 'running', title: author })
    const urls: string[] = await twitter.getAllMedia(userId, cookies)
    if (!urls.length) throw new Error('未解析到可下载的媒体')
    for (let i = 0; i < urls.length; i++) {
      if (task._cancel) throw new Error('任务已取消')
      await waitWhilePaused(task)
      const url = urls[i]
      const fileName = file.simpleSanitize(url.split('/').pop())
      const savePath = `${baseDir}/${fileName}`
      await twitter.downloadImage(url, savePath)
      updateTask(task, {
        progress: { image: { index: i + 1, total: urls.length } }
      })
    }
    updateTask(task, { status: 'success' })
    try {
      message.success(`下载成功：${author}`)
    } catch { }
  } catch (e: any) {
    if (task._cancel) {
      updateTask(task, { status: 'canceled' })
      // 取消不提示
      return
    }
    updateTask(task, { status: 'error' })
    try {
      message.error(`下载失败：${author}${e ? ' - ' + (e?.message || e) : ''}`)
    } catch { }
  }
}

async function executeTask(task: DownloadTask) {
  switch (task.site) {
    case 'jmtt':
      await runJmtt(task)
      break
    case 'pixiv':
      await runPixiv(task)
      break
    case 'twitter':
      await runTwitter(task)
      break
    default:
      updateTask(task, { status: 'error' })
  }
}

async function startRunner() {
  if (runnerActive) return
  runnerActive = true
  try {
    // 延迟一帧，避免同批次 addTask 后立即启动多次
    await nextTick()
    while (true) {
      const next = findNextPending()
      if (!next) break
      // 若任务被标记删除，将跳过
      if (!tasks.find((t) => t.id === next.id)) continue
      // 变更为 running 将在具体 run 内部再次设置，确保状态一致
      updateTask(next, { status: 'running' })
      await executeTask(next)
      // 任务完成或错误后继续下一项
    }
  } finally {
    runnerActive = false
  }
}

function seedDemoDataIfEmpty() {
  if (tasks.length > 0) return
  const now = Date.now()
  const mk = (site: 'jmtt' | 'pixiv' | 'twitter', title: string, status: TaskStatus, imgIdx: number, imgTotal: number): DownloadTask => ({
    id: uid(),
    site,
    title,
    status,
    progress: { image: { index: imgIdx, total: imgTotal } },
    createdAt: now,
    updatedAt: now,
    payload: null
  })
  // 示例任务：运行中（蓝色）
  tasks.push(mk('jmtt', '演示·漫画章节（JMtt）', 'running', 3, 10))
  // 示例任务：暂停（信息色）
  tasks.push(mk('twitter', '演示·媒体页（Twitter）', 'paused', 5, 12))
  // 示例任务：成功（绿色）
  tasks.push(mk('pixiv', '演示·作品（Pixiv）', 'success', 12, 12))
}
// seedDemoDataIfEmpty()

export const queue = {
  tasks,
  addTask,
  pauseTask,
  resumeTask,
  cancelTask,
  deleteTask,
  startRunner
}