import { reactive, ref, nextTick } from 'vue'


type TaskStatus = 'pending' | 'running' | 'paused' | 'success' | 'error' | 'canceled' | 'existed'

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
  errorMessage?: string
  payload: any
  _pause?: boolean
  _cancel?: boolean
}
const { jmtt, pixiv, twitter, file } = (window as any)
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const tasks = reactive<DownloadTask[]>([])


let runnerActive = false

function findNextPending(): DownloadTask | undefined {
  return tasks.find((t) => t.status === 'pending')
}

function sortTasks() {
  const weight: Record<TaskStatus, number> = {
    error: 0,
    running: 1,
    pending: 2,
    paused: 3,
    existed: 4,
    canceled: 5,
    success: 6
  }
  tasks.sort((a, b) => {
    const w = weight[a.status] - weight[b.status]
    if (w !== 0) return w
    // 同一分组内按创建时间排序，较新靠前
    return b.createdAt - a.createdAt
  })
}

function updateTask(t: DownloadTask, patch: Partial<DownloadTask>) {
  Object.assign(t, patch)
  t.updatedAt = Date.now()
  sortTasks()
}

export function addTask(taskList: Array<any> | any) {
  if (!Array.isArray(taskList)) taskList = [taskList]
  tasks.push(...taskList.map(task => ({
    ...task,
    id: uid(),
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now()
  })))
  sortTasks()

  startRunner()
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
  if (t.status === 'paused') updateTask(t, { status: 'pending', errorMessage: undefined })
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
export function clearCompletedTask() {
  tasks
    .filter((t: any) => ['success', 'existed'].includes(t.status))
    .map((t: any) => deleteTask(t.id))
}
async function waitWhilePaused(task: DownloadTask) {
  while (task._pause && !task._cancel) {
    await new Promise((r) => setTimeout(r, 300))
  }
}

// 通用并发执行器：按 limit 并发处理 items，支持暂停/取消与进度回调
async function runWithConcurrency<T>(
  items: T[],
  task: DownloadTask,
  onItem: (item: T, index: number) => Promise<void>,
  onProgress?: (completed: number, total: number) => void
) {
  const limit = 20
  let next = 0
  let completed = 0
  async function worker() {
    while (true) {
      if (task._cancel) throw new Error('任务已取消')
      await waitWhilePaused(task)
      const i = next
      if (i >= items.length) break
      next++
      await onItem(items[i], i)
      completed++
      onProgress?.(completed, items.length)
    }
  }
  const workers = Array(Math.min(limit, items.length)).fill(0).map(() => worker())
  await Promise.all(workers)
}

async function runJmtt(task: DownloadTask) {
  const { chapter, comicInfo, baseDir } = task.payload as {
    chapter: any
    comicInfo: any
    baseDir: string
  }
  try {
    updateTask(task, { status: 'running', errorMessage: undefined })
    const chapterFolder =
      (comicInfo.chapter_infos?.length || 0) > 1 ? `${baseDir}/第${chapter.index}章` : baseDir
    // 开始前检查目录是否existed
    if (await file.pathExists(chapterFolder)) {
      updateTask(task, { status: 'existed', progress: {} })
      return
    }
    const images: string[] = await jmtt.getChapterImages(chapter.id)
    await runWithConcurrency(
      images,
      task,
      async (_img, i) => {
        const savePath = `${chapterFolder}/${i.toString().padStart(5, '0')}.webp`
        await jmtt.downloadImage(savePath, images[i])
      },
      (completed, total) => {
        updateTask(task, {
          progress: {
            chapter: { index: chapter.index, total: comicInfo.chapter_infos.length || 1 },
            image: { index: completed, total }
          }
        })
      }
    )
    updateTask(task, { status: 'success' })
  } catch (e: any) {
    if (task._cancel) {
      updateTask(task, { status: 'canceled' })
      // 取消不提示
      return
    }
    updateTask(task, { status: 'error', errorMessage: (e?.message || String(e)) })
  } finally {
    // 章间暂停 5s 避免频繁请求
    await new Promise((r) => setTimeout(r, 5000))
  }
}

async function runPixiv(task: DownloadTask) {
  const { artworkId, artworkInfo, baseDir } = task.payload as { artworkId: string; artworkInfo: any; baseDir: string }
  try {
    updateTask(task, { status: 'running', errorMessage: undefined })
    const workDir = `${baseDir}/${file.simpleSanitize(artworkInfo.author)}/${file.simpleSanitize(artworkInfo.title)}`
    // 开始前检查目录是否existed
    if (await file.pathExists(workDir)) {
      updateTask(task, { status: 'existed', progress: {} })
      return
    }
    const images: string[] = await pixiv.getArtworkImages(artworkId)
    await runWithConcurrency(
      images,
      task,
      async (url, i) => {
        const fileName = `${i.toString().padStart(5, '0')}.${(url as string).split('.').pop() || 'jpg'}`
        const savePath = `${workDir}/${fileName}`
        await pixiv.downloadImage(url as string, savePath)
      },
      (completed, total) => {
        updateTask(task, { progress: { image: { index: completed, total } } })
      }
    )
    updateTask(task, { status: 'success' })
  } catch (e: any) {
    if (task._cancel) {
      updateTask(task, { status: 'canceled' })
      // 取消不提示
      return
    }
    updateTask(task, { status: 'error', errorMessage: (e?.message || String(e)) })
  }
}

async function runTwitter(task: DownloadTask) {
  const { userId, baseDir } = task.payload
  try {
    updateTask(task, { status: 'running', errorMessage: undefined })
    // 开始前检查目录是否existed
    if (await file.pathExists(baseDir)) {
      updateTask(task, { status: 'existed', progress: {} })
      return
    }
    const images = await twitter.getAllMedia(userId)
    if (!images.length) throw new Error('未解析到可下载的媒体')
    await runWithConcurrency(
      images.map((_) => _.url),
      task,
      async (url, _i) => {
        const fileName = file.simpleSanitize((url as string).split('/').pop()!)
        const savePath = `${baseDir}/${fileName}`
        await twitter.downloadImage(url as string, savePath)
      },
      (completed, total) => {
        updateTask(task, { progress: { image: { index: completed, total } } })
      }
    )
    updateTask(task, { status: 'success' })
  } catch (e: any) {
    if (task._cancel) {
      updateTask(task, { status: 'canceled' })
      return
    }
    updateTask(task, { status: 'error', errorMessage: (e?.message || String(e)) })
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
      updateTask(next, { status: 'running', errorMessage: undefined })
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
  tasks.push(mk('jmtt', '演示·漫画章节漫画章节漫画章节漫画章节漫画章节漫画章节漫画章节漫画章节漫画章节漫画章节（JMtt）', 'running', 3, 10))
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
  clearCompletedTask,
  startRunner
}