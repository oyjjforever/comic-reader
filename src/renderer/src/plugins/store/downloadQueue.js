import { reactive, ref, nextTick } from 'vue'

const { jmtt, pixiv, twitter, weibo, file } = window
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const tasks = reactive([])

let runnerActive = false

function findNextPending() {
  return tasks.find((t) => t.status === 'pending')
}

function sortTasks() {
  const weight = {
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

function updateTask(t, patch) {
  Object.assign(t, patch)
  t.updatedAt = Date.now()
  sortTasks()
}

export function addTask(taskList) {
  if (!Array.isArray(taskList)) taskList = [taskList]
  tasks.push(
    ...taskList.map((task) => ({
      ...task,
      id: uid(),
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }))
  )
  sortTasks()
  startRunner()
}

export function pauseTask(id) {
  const t = tasks.find((x) => x.id === id)
  if (!t) return
  t._pause = true
  if (t.status === 'running') updateTask(t, { status: 'paused' })
}

export function resumeTask(id) {
  const t = tasks.find((x) => x.id === id)
  if (!t) return
  t._pause = false
  if (t.status === 'paused') updateTask(t, { status: 'pending', errorMessage: undefined })
  startRunner()
}

export function cancelTask(id) {
  const t = tasks.find((x) => x.id === id)
  if (!t) return
  t._cancel = true
  if (t.status === 'running' || t.status === 'paused') updateTask(t, { status: 'canceled' })
}

export function deleteTask(id) {
  const idx = tasks.findIndex((x) => x.id === id)
  if (idx !== -1) {
    // 若在运行，先标记取消
    tasks[idx]._cancel = true
    tasks.splice(idx, 1)
  }
}
export function clearCompletedTask() {
  tasks.filter((t) => ['success', 'existed'].includes(t.status)).map((t) => deleteTask(t.id))
}
async function waitWhilePaused(task) {
  while (task._pause && !task._cancel) {
    await new Promise((r) => setTimeout(r, 300))
  }
}

// 通用并发执行器：按 limit 并发处理 items，支持暂停/取消与进度回调
async function runWithConcurrency(items, task, onItem, onProgress) {
  const limit = 20
  let next = 0
  let success = 0,
    fail = 0
  async function worker() {
    while (true) {
      if (task._cancel) throw new Error('任务已取消')
      await waitWhilePaused(task)
      const i = next
      if (i >= items.length) break
      next++
      try {
        await onItem(items[i], i)
        success++
      } catch (e) {
        console.log('🚀 ~ worker ~ error:', e)
        fail++
      }
      onProgress?.(success, fail, items.length)
    }
  }
  const workers = Array(Math.min(limit, items.length))
    .fill(0)
    .map(() => worker())
  await Promise.all(workers)
}
async function isPathExists(path, task) {
  if (await file.pathExists(path)) {
    updateTask(task, { status: 'existed', progress: {}, localFilePath: path })
    throw new Error(`${path} 已存在`)
  }
}
async function runJmtt(task) {
  const { chapter, comicInfo, baseDir } = task.payload
  try {
    updateTask(task, { status: 'running', errorMessage: undefined })
    const workDir = `${baseDir}\\${file.simpleSanitize(comicInfo.author)}\\${file.simpleSanitize(comicInfo.name)}`
    const chapterFolder =
      (comicInfo.chapter_infos?.length || 0) > 1 ? `${workDir}/第${chapter.index}章` : workDir
    await isPathExists(chapterFolder, task)
    const images = await jmtt.getChapterImages(chapter.id)
    await runWithConcurrency(
      images,
      task,
      async (_img, i) => {
        const savePath = `${chapterFolder}\\${i.toString().padStart(5, '0')}.webp`
        await jmtt.downloadImage(savePath, images[i])
      },
      (success, fail, total) => {
        updateTask(task, {
          progress: {
            success,
            fail,
            total
          }
        })
        task.onSuccess?.()
      }
    )
    updateTask(task, { from: 'jmtt', status: 'success', localFilePath: chapterFolder })

    // 保存到下载历史
  } catch (e) {
    console.log('🚀 ~ runJmtt ~ e:', e)
    if (task._cancel) {
      updateTask(task, { status: 'canceled' })
      // 取消不提示
      return
    }
  } finally {
    // 章间暂停 5s 避免频繁请求
    await new Promise((r) => setTimeout(r, 5000))
  }
}

async function runPixiv(task) {
  const { artworkId, artworkInfo, baseDir } = task.payload
  try {
    updateTask(task, { status: 'running', errorMessage: undefined })
    const workDir = `${baseDir}\\${file.simpleSanitize(artworkInfo.author)}\\${file.simpleSanitize(artworkInfo.title)}`
    // 动图下载
    if (artworkInfo.illustType === 2) {
      await isPathExists(`${workDir}\\${artworkId}.mp4`, task)
      updateTask(task, { progress: { total: 1 } })
      try {
        await pixiv.downloadGif(artworkId, workDir, (value) => {
          updateTask(task, { progress: { value, total: 1 } })
        })
        updateTask(task, { progress: { success: 1, total: 1 } })
        task.onSuccess?.()
      } catch (error) {
        console.log('🚀 ~ runPixiv ~ error:', error)
        updateTask(task, { progress: { fail: 1, total: 1 } })
      }
    }
    // 0：插画，1：漫画 下载
    else if ([0, 1].includes(artworkInfo.illustType)) {
      await isPathExists(workDir, task)
      const images = await pixiv.getArtworkImages(artworkId)
      await runWithConcurrency(
        images.map((_) => _.urls.original),
        task,
        async (url, i) => {
          const fileName = `${artworkId}-${i.toString().padStart(5, '0')}.${url.split('.').pop() || 'jpg'}`
          const savePath = `${workDir}\\${fileName}`
          await pixiv.downloadImage(url, savePath)
        },
        (success, fail, total) => {
          updateTask(task, { progress: { success, fail, total } })
          task.onSuccess?.()
        }
      )
    }
    updateTask(task, { from: 'pixiv', status: 'success', localFilePath: workDir })
  } catch (e) {
    console.log('🚀 ~ runPixiv ~ e:', e)
    if (task._cancel) {
      updateTask(task, { status: 'canceled' })
      // 取消不提示
      return
    }
  }
}

async function runTwitter(task) {
  const { author, userId, baseDir, artworkInfo, videoUrl } = task.payload
  try {
    let workDir
    updateTask(task, { status: 'running', errorMessage: undefined })
    // 视频下载
    if (videoUrl) {
      workDir = `${baseDir}\\${file.simpleSanitize(author)}\\${task.payload.twitterId}.mp4`
      await isPathExists(workDir, task)
      task.type = 'video'
      try {
        await twitter.downloadImage(videoUrl, workDir, (value) => {
          updateTask(task, { progress: { value, total: 1 } })
        })
        updateTask(task, { progress: { success: 1, total: 1 } })
        task.onSuccess?.()
      } catch (error) {
        updateTask(task, { progress: { fail: 1, total: 1 } })
        throw error
      }
    }
    // 单图片下载
    else if (artworkInfo) {
      workDir = `${baseDir}\\${file.simpleSanitize(author)}\\${file.simpleSanitize(artworkInfo.title)}`
      await isPathExists(workDir, task)
      await twitter.downloadImage(artworkInfo.url, workDir)
      updateTask(task, { progress: { success: 1, total: 1 } })
      task.onSuccess?.()
    }
    // 媒体库下载
    else {
      workDir = `${baseDir}\\${file.simpleSanitize(author)}`
      await isPathExists(workDir, task)
      let images = [],
        cursor = null
      while (true) {
        const res = await twitter.getMediaPerPage(userId, cursor, 50)
        const _images = twitter.extractItemsFromJson(res)
        cursor = twitter.extractBottomCursorValues(res)
        if (_images?.length) images.push(..._images)
        updateTask(task, { progress: { total: images.length } })
        if (!_images || _images.length < 20) break
      }
      if (!images.length) throw new Error('未解析到可下载的媒体')
      await runWithConcurrency(
        images,
        task,
        async (image, _i) => {
          const fileName = file.simpleSanitize(image.title || `unknow_${_i}.jpg`)
          const savePath = `${workDir}\\${fileName}`
          await twitter.downloadImage(image.url, savePath)
        },
        (success, fail, total) => {
          updateTask(task, { progress: { success, fail, total } })
          task.onSuccess?.()
        }
      )
    }
    updateTask(task, { from: 'twitter', status: 'success', localFilePath: workDir })
  } catch (e) {
    console.log('🚀 ~ runTwitter ~ e:', e)
    if (task._cancel) {
      updateTask(task, { status: 'canceled' })
      return
    }
  }
}
async function runWeibo(task) {
  const { author, userId, baseDir, artworkInfo, videoUrl } = task.payload
  try {
    let workDir
    updateTask(task, { status: 'running', errorMessage: undefined })
    if (artworkInfo) {
      workDir = `${baseDir}\\${file.simpleSanitize(author)}\\${file.simpleSanitize(artworkInfo.title)}.jpg`
      await isPathExists(workDir, task)
      await weibo.downloadImage(artworkInfo.url, workDir)
      updateTask(task, { progress: { success: 1, total: 1 } })
      task.onSuccess?.()
    }
    // 媒体库下载
    else {
      workDir = `${baseDir}\\${file.simpleSanitize(author)}`
      await isPathExists(workDir, task)
      let images = [],
        cursor = null
      while (true) {
        const res = await weibo.getMediaPerPage(userId, cursor)
        const _images = res.data.list.filter((_) => _.pid)
        cursor = res.data.since_id
        if (_images?.length) images.push(..._images)
        updateTask(task, { progress: { total: images.length } })
        if (!cursor) break
      }
      if (!images.length) throw new Error('未解析到可下载的媒体')
      await runWithConcurrency(
        images,
        task,
        async (image, _i) => {
          const fileName = file.simpleSanitize(image.title || `unknow_${_i}.jpg`)
          const savePath = `${workDir}\\${fileName}`
          await weibo.downloadImage(image.pid, savePath)
        },
        (success, fail, total) => {
          updateTask(task, { progress: { success, fail, total } })
          task.onSuccess?.()
        }
      )
    }
    updateTask(task, { from: 'weibo', status: 'success', localFilePath: workDir })
  } catch (e) {
    console.log('🚀 ~ runWeibo ~ e:', e)
    if (task._cancel) {
      updateTask(task, { status: 'canceled' })
      return
    }
  }
}
async function executeTask(task) {
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
    case 'weibo':
      await runWeibo(task)
      break
    default:
      updateTask(task, { status: 'error' })
  }
  try {
    await window.downloadHistory.addDownloadHistory(task.localFilePath, task.type || 'book')
  } catch (error) {
    console.error('保存下载历史失败:', error)
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
