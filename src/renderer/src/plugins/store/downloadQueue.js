import { reactive, ref, nextTick } from 'vue'

const { jmtt, pixiv, twitter, weibo, picaman, yfantasy, fourkhd, huangguo, pornhub, file } = window
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// 车票号：入队时分配的自增序号，任务卡片右上角 NO.xxxx，同时作为 FIFO 排序键（终身不变）
let serialSeed = 0

export const tasks = reactive([])

let runnerActive = false

function findNextPending() {
  return tasks.find((t) => t.status === 'pending')
}

function sortTasks() {
  // 失败置顶（醒目可重试），其余严格 FIFO：按入队序（serial 自增）排列，
  // 暂停/恢复/完成等状态变化不再移动卡片位置（同毫秒入队的批次靠 serial 稳定区分）
  tasks.sort((a, b) => {
    const ea = a.status === 'error' ? 0 : 1
    const eb = b.status === 'error' ? 0 : 1
    if (ea !== eb) return ea - eb
    return a.serial - b.serial
  })
}

function updateTask(t, patch) {
  Object.assign(t, patch)
  t.updatedAt = Date.now()
  sortTasks()
  reportActiveDownloads()
}

// 向主进程上报活跃（pending/running/paused）任务数，用于关闭窗口时二次确认
// 缓存上次数量，仅在变化时发送 IPC（进度高频更新时避免 IPC 风暴）
let lastActiveCount = -1
function reportActiveDownloads() {
  const count = tasks.filter((t) => ['pending', 'running', 'paused'].includes(t.status)).length
  if (count === lastActiveCount) return
  lastActiveCount = count
  window.closeConfig?.reportActiveDownloads(count)
}

export function addTask(taskList) {
  if (!Array.isArray(taskList)) taskList = [taskList]
  tasks.push(
    ...taskList.map((task) => ({
      ...task,
      id: uid(),
      serial: ++serialSeed,
      status: 'pending',
      // 入队即带空进度对象，任务卡片初始化时就渲染进度条（0%）
      progress: task.progress || {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    }))
  )
  sortTasks()
  reportActiveDownloads()
  startRunner()
}

/** 撤掉主进程仍在跑的底层下载：取消/删除/暂停运行中任务、看门狗跳过时立即止血，
 *  不再等下一个进度事件才生效（pornhub/huangguo 的取消链路原先依赖事件驱动） */
function killRemoteDownload(t) {
  try {
    if (t.site === 'pornhub') pornhub.cancelDownload?.()
    else if (t.site === 'huangguo') huangguo.cancelDownload?.()
  } catch (e) {
    console.warn('中止底层下载失败:', e)
  }
}

// 暂停/取消的中止检查：抛错打断执行，由各 runner 的 catch 按 _pause/_cancel 标记收尾
function abortIfRequested(task) {
  if (task._cancel) throw new Error('任务已取消')
  if (task._pause) throw new Error('任务已暂停')
}

/** 归一化错误信息：常见底层错误翻译为可读中文，原始信息有增量时附在括号里，
 *  供用户在任务卡片上直接看懂失败原因（context 为阶段前缀，如"获取章节图片失败"） */
function formatTaskError(e, context) {
  const raw = String((e && e.message) || e || '').trim()
  let friendly = raw
  if (/已存在/.test(raw)) friendly = raw
  else if (/timeout|timed\s*out|ETIMEDOUT/i.test(raw))
    friendly = '请求超时，网络不通或站点长时间无响应'
  else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(raw)) friendly = '域名解析失败，请检查网络连接'
  else if (/ECONNRESET|ECONNREFUSED|ECONNABORTED|socket hang up|network/i.test(raw))
    friendly = '网络连接中断或被站点拒绝'
  else if (/\b40[13]\b|unauthorized|forbidden|cookie|登录/i.test(raw))
    friendly = '鉴权失败，登录态/Cookie 可能已过期，请到站点页面重新登录'
  else if (/\b404\b|not found|不存在/i.test(raw)) friendly = '资源不存在，地址可能已失效或已删除'
  else if (/\b5\d{2}\b|internal server|bad gateway|service unavailable/i.test(raw))
    friendly = '站点服务器错误，稍后重试'
  else if (/EPERM|EACCES|EISDIR|ENOSPC|no space|权限/i.test(raw))
    friendly = '写入失败，请检查目录权限或磁盘剩余空间'
  else if (!raw) friendly = '未知错误'
  const detail = raw && raw !== friendly ? `（${raw}）` : ''
  return context ? `${context}：${friendly}${detail}` : `${friendly}${detail}`
}

export function pauseTask(id) {
  const t = tasks.find((x) => x.id === id)
  if (!t) return
  t._pause = true
  // 暂停 = 中止当前执行（runner 收尾为 paused），恢复时重跑、逐项已存在跳过；
  // pending 直接置 paused（runner 只捡 pending，不会被覆盖为 running）
  if (t.status === 'running' || t.status === 'pending') {
    if (t.status === 'running') killRemoteDownload(t)
    updateTask(t, { status: 'paused' })
  }
}

export function resumeTask(id) {
  const t = tasks.find((x) => x.id === id)
  if (!t) return
  t._pause = false
  t._cancel = false
  if (t.status === 'paused') updateTask(t, { status: 'pending', errorMessage: undefined })
  startRunner()
}

// 失败/取消的任务重新入队下载
export function retryTask(id) {
  const t = tasks.find((x) => x.id === id)
  if (!t) return
  if (!['error', 'canceled'].includes(t.status)) return
  t._pause = false
  t._cancel = false
  // pornhub 入队时解析的直链有时效，重试时清空让其重新解析，避免再次因过期失败
  if (t.site === 'pornhub' && t.payload) {
    t.payload.videoUrl = undefined
  }
  updateTask(t, { status: 'pending', errorMessage: undefined, progress: {} })
  startRunner()
}

export function cancelTask(id) {
  const t = tasks.find((x) => x.id === id)
  if (!t) return
  t._cancel = true
  // pending 一并处理：不改状态的话任务仍会被 runner 捡起并执行前置请求
  if (['pending', 'running', 'paused'].includes(t.status)) {
    if (t.status === 'running') killRemoteDownload(t)
    updateTask(t, { status: 'canceled' })
  }
}

export function deleteTask(id) {
  const idx = tasks.findIndex((x) => x.id === id)
  if (idx !== -1) {
    // 若在运行，先止血并标记取消（飞行中的请求有界，落地后自行退出）
    killRemoteDownload(tasks[idx])
    tasks[idx]._cancel = true
    tasks.splice(idx, 1)
    reportActiveDownloads()
  }
}
export function clearCompletedTask() {
  // 已结束的任务统一清理（成功/已存在/失败/已取消），活跃（排队/运行/暂停）不动
  tasks
    .filter((t) => ['success', 'existed', 'error', 'canceled'].includes(t.status))
    .map((t) => deleteTask(t.id))
}

// 通用并发执行器：按 limit 并发处理 items。暂停/取消为"中止执行"而非挂起——
// worker 在 item 之间检查标记并抛错退出，恢复时由 runner 重跑、配合逐项已存在
// 跳过避免重复下载；进度回调 100ms 节流（updateTask 触发全队列排序，高频事件
// 会拖垮渲染），全部完成时必发一次最终值
async function runWithConcurrency(items, task, onItem, onProgress) {
  const limit = 20
  let next = 0
  let success = 0,
    fail = 0
  let lastProgressAt = 0
  async function worker() {
    while (true) {
      abortIfRequested(task)
      const i = next
      if (i >= items.length) break
      next++
      let lastError
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          await onItem(items[i], i)
          lastError = null
          break
        } catch (e) {
          lastError = e
          // 暂停/取消时不再进入重试退避，尽快退出
          if (task._cancel || task._pause) break
          if (attempt < 5) {
            console.log(`🚀 ~ worker ~ retry ${attempt}/5 for item ${i}:`, e)
            await new Promise((r) => setTimeout(r, 1000 * attempt))
            if (task._cancel || task._pause) break
          }
        }
      }
      if (lastError) {
        console.log(`🚀 ~ worker ~ failed after 5 retries for item ${i}:`, lastError)
        fail++
      } else {
        success++
      }
      const now = Date.now()
      if (now - lastProgressAt >= 100 || success + fail === items.length) {
        lastProgressAt = now
        onProgress?.(success, fail, items.length)
      }
    }
  }
  const workers = Array(Math.min(limit, items.length))
    .fill(0)
    .map(() => worker())
  await Promise.all(workers)
  return { success, fail }
}
async function isPathExists(path, task) {
  if (await file.pathExists(path)) {
    updateTask(task, { status: 'existed', progress: {}, localFilePath: path })
    throw new Error(`${path} 已存在`)
  }
}

// 本地作品移动：逐作品 movePath + 关联记录路径迁移；支持作品间暂停/取消，重试幂等（已移过的跳过计成功）
async function runLocalMove(task) {
  const { items, destFolderPath } = task.payload
  // 任务级字节进度：sizeTotal 为全部作品大小和，sizeDone 为已完成作品大小 + 当前作品已复制字节
  const sizeTotal = items.reduce((s, i) => s + (i.size || 0), 0)
  let passedSize = 0
  updateTask(task, {
    status: 'running',
    errorMessage: undefined,
    progress: { success: 0, fail: 0, total: items.length, sizeDone: 0, sizeTotal }
  })
  let success = 0,
    fail = 0
  const succeededItems = []
  for (const item of items) {
    if (task._cancel || task._pause) break
    // 当前作品字节进度折算进总进度：value = (已完成作品数 + 当前作品复制比例) / 总数
    const onProgress = (p) => {
      const frac = p.totalBytes > 0 ? Math.min(1, p.bytes / p.totalBytes) : 0
      const value = Math.floor(((success + fail + frac) / items.length) * 100)
      updateTask(task, {
        progress: {
          value,
          success,
          fail,
          total: items.length,
          sizeDone: passedSize + p.bytes,
          sizeTotal
        }
      })
    }
    try {
      const res = await window.systemInterface.movePath(item.fullPath, destFolderPath, onProgress)
      if (!res.success) throw new Error(res.error)
      success++
      passedSize += item.size || 0
      succeededItems.push(item)
      // 文件已到位，同步迁移收藏/评分/历史等关联记录（失败不影响移动，仅记日志）
      try {
        await window.pathMigration.migrateByMove(item.fullPath, destFolderPath)
      } catch (e) {
        console.warn(`迁移关联记录失败: ${item.fullPath}`, e)
      }
    } catch (e) {
      // 幂等重试：源已不在且目标已有同名项，说明之前已移动过
      const name = item.fullPath.split(/[\\/]/).pop()
      const [srcExists, destExists] = await Promise.all([
        file.pathExists(item.fullPath),
        file.pathExists(`${destFolderPath}\\${name}`)
      ])
      if (!srcExists && destExists) {
        success++
        passedSize += item.size || 0
        succeededItems.push(item)
      } else {
        fail++
        item.error = e?.message || String(e)
      }
    }
    updateTask(task, {
      progress: { success, fail, total: items.length, sizeDone: passedSize, sizeTotal }
    })
  }
  if (task._cancel) {
    updateTask(task, { status: 'canceled' })
  } else if (task._pause) {
    // 暂停：已完成项的移动与记录迁移均已落地，恢复时重跑（幂等跳过已移项）
    updateTask(task, { status: 'paused' })
  } else if (fail === 0) {
    updateTask(task, {
      status: 'success',
      localFilePath: destFolderPath,
      progress: {
        value: 100,
        success,
        fail,
        total: items.length,
        sizeDone: sizeTotal,
        sizeTotal
      }
    })
  } else if (success === 0) {
    updateTask(task, {
      status: 'error',
      errorMessage: formatTaskError(items.find((i) => i.error)?.error, '作品移动失败')
    })
  } else {
    updateTask(task, {
      status: 'error',
      errorMessage: `${fail}/${items.length} 个作品移动失败`,
      localFilePath: destFolderPath
    })
  }
  task.onFinish?.(succeededItems, fail)
}
async function runJmtt(task) {
  const { chapter, comicInfo, baseDir } = task.payload
  // 阶段标记：错误信息里指明失败发生在哪一步
  let stage = '准备下载'
  try {
    updateTask(task, { status: 'running', errorMessage: undefined })
    const workDir = `${baseDir}\\${file.simpleSanitize(comicInfo.author)}\\${file.simpleSanitize(comicInfo.name)}`
    const chapterFolder =
      (comicInfo.chapter_infos?.length || 0) > 1 ? `${workDir}/第${chapter.index}章` : workDir
    await isPathExists(chapterFolder, task)
    stage = '获取章节图片'
    const images = await jmtt.getChapterImages(chapter.id)
    stage = '下载章节图片'
    const { fail } = await runWithConcurrency(
      images,
      task,
      async (_img, i) => {
        const savePath = `${chapterFolder}\\${i.toString().padStart(5, '0')}.webp`
        // 逐项已存在跳过：暂停恢复/重试重跑时不重复下载
        if (await file.pathExists(savePath)) return
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
    if (fail > 0) {
      // 部分图片失败：明确置为失败并说明数量（重试时逐项已存在跳过、只补失败部分）
      updateTask(task, {
        from: 'jmtt',
        status: 'error',
        errorMessage: `${fail}/${images.length} 张图片下载失败，重试只会补下失败部分`,
        localFilePath: chapterFolder
      })
      return
    }
    updateTask(task, { from: 'jmtt', status: 'success', localFilePath: chapterFolder })

    // 保存到下载历史
  } catch (e) {
    console.log('🚀 ~ runJmtt ~ e:', e)
    if (task._cancel) {
      updateTask(task, { status: 'canceled' })
      // 取消不提示
      return
    }
    if (task._pause) {
      updateTask(task, { status: 'paused' })
      return
    }
    // isPathExists 抛出的「已存在」已把任务置为 existed，这里仅覆盖真实下载错误
    if (task.status !== 'existed') {
      updateTask(task, { status: 'error', errorMessage: formatTaskError(e, `${stage}失败`) })
    }
  } finally {
    // 章间暂停 5s 避免频繁请求（中止/暂停退出时跳过，不占用执行器）
    if (!task._cancel && !task._pause) {
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
}

async function runPixiv(task) {
  const { artworkId, artworkInfo, baseDir } = task.payload
  let stage = '准备下载'
  try {
    updateTask(task, { status: 'running', errorMessage: undefined })
    const workDir = `${baseDir}\\${file.simpleSanitize(artworkInfo.author)}\\${file.simpleSanitize(artworkInfo.title)}`
    // 动图下载
    if (artworkInfo.illustType === 2) {
      await isPathExists(`${workDir}\\${artworkId}.mp4`, task)
      stage = '下载动图'
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
        throw error
      }
    }
    // 0：插画，1：漫画 下载
    else if ([0, 1].includes(artworkInfo.illustType)) {
      // 同名作品共享同一文件夹，仅当该 artworkId 的图片已存在才跳过
      if (await file.existsArtworkFiles(workDir, artworkId)) {
        updateTask(task, { status: 'existed', progress: {}, localFilePath: workDir })
        throw new Error(`${workDir} [${artworkId}] 已存在`)
      }
      const images = await pixiv.getArtworkImages(artworkId)
      stage = '下载作品图片'
      const { fail } = await runWithConcurrency(
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
      if (fail > 0) {
        // 部分图片失败：明确置为失败并说明数量（重试时逐项已存在跳过、只补失败部分）
        updateTask(task, {
          from: 'pixiv',
          status: 'error',
          errorMessage: `${fail}/${images.length} 张图片下载失败，重试只会补下失败部分`,
          localFilePath: workDir
        })
        return
      }
    }
    updateTask(task, { from: 'pixiv', status: 'success', localFilePath: workDir })
  } catch (e) {
    console.log('🚀 ~ runPixiv ~ e:', e)
    if (task._cancel) {
      updateTask(task, { status: 'canceled' })
      // 取消不提示
      return
    }
    if (task._pause) {
      updateTask(task, { status: 'paused' })
      return
    }
    // isPathExists 抛出的「已存在」已把任务置为 existed，这里仅覆盖真实下载错误
    if (task.status !== 'existed') {
      updateTask(task, { status: 'error', errorMessage: formatTaskError(e, `${stage}失败`) })
    }
  }
}

async function runTwitter(task) {
  const { author, userId, baseDir, artworkInfo, videoUrl } = task.payload
  let stage = '准备下载'
  try {
    let workDir
    updateTask(task, { status: 'running', errorMessage: undefined })
    // 视频下载
    if (videoUrl) {
      workDir = `${baseDir}\\${file.simpleSanitize(author)}\\${task.payload.twitterId}.mp4`
      await isPathExists(workDir, task)
      abortIfRequested(task)
      stage = '下载视频'
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
      abortIfRequested(task)
      stage = '下载图片'
      await twitter.downloadImage(artworkInfo.url, workDir)
      updateTask(task, { progress: { success: 1, total: 1 } })
      task.onSuccess?.()
    }
    // 媒体库下载
    else {
      workDir = `${baseDir}\\${file.simpleSanitize(author)}`
      let images = [],
        cursor = null
      stage = '获取媒体列表'
      while (true) {
        abortIfRequested(task)
        const res = await twitter.getMediaPerPage(userId, cursor, 50)
        const _images = twitter.extractItemsFromJson(res)
        cursor = twitter.extractBottomCursorValues(res)
        if (_images?.length) images.push(..._images)
        updateTask(task, { progress: { total: images.length } })
        if (!_images || _images.length < 20) break
      }
      if (!images.length) throw new Error('未解析到可下载的媒体')
      stage = '下载媒体'
      const { fail } = await runWithConcurrency(
        images,
        task,
        async (image, _i) => {
          const fileName = file.simpleSanitize(image.title || `unknow_${_i}.jpg`)
          const savePath = `${workDir}\\${fileName}`
          if (await file.pathExists(savePath)) return
          await twitter.downloadImage(image.url, savePath)
        },
        (success, fail, total) => {
          updateTask(task, { progress: { success, fail, total } })
          task.onSuccess?.()
        }
      )
      if (fail > 0) {
        updateTask(task, {
          from: 'twitter',
          status: 'error',
          errorMessage: `${fail}/${images.length} 个媒体下载失败，重试只会补下失败部分`,
          localFilePath: workDir
        })
        return
      }
    }
    updateTask(task, { from: 'twitter', status: 'success', localFilePath: workDir })
  } catch (e) {
    console.log('🚀 ~ runTwitter ~ e:', e)
    if (task._cancel) {
      updateTask(task, { status: 'canceled' })
      return
    }
    if (task._pause) {
      updateTask(task, { status: 'paused' })
      return
    }
    // isPathExists 抛出的「已存在」已把任务置为 existed，这里仅覆盖真实下载错误
    if (task.status !== 'existed') {
      updateTask(task, { status: 'error', errorMessage: formatTaskError(e, `${stage}失败`) })
    }
  }
}
async function runWeibo(task) {
  const { author, userId, baseDir, artworkInfo, videoUrl } = task.payload
  let stage = '准备下载'
  try {
    let workDir
    updateTask(task, { status: 'running', errorMessage: undefined })
    if (artworkInfo) {
      workDir = `${baseDir}\\${file.simpleSanitize(author)}\\${file.simpleSanitize(artworkInfo.title)}.jpg`
      await isPathExists(workDir, task)
      abortIfRequested(task)
      stage = '下载图片'
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
      stage = '获取媒体列表'
      while (true) {
        abortIfRequested(task)
        const res = await weibo.getMediaPerPage(userId, cursor)
        const _images = res.data.list.filter((_) => _.pid)
        cursor = res.data.since_id
        if (_images?.length) images.push(..._images)
        updateTask(task, { progress: { total: images.length } })
        if (!cursor) break
      }
      if (!images.length) throw new Error('未解析到可下载的媒体')
      stage = '下载媒体'
      const { fail } = await runWithConcurrency(
        images,
        task,
        async (image, _i) => {
          const fileName = file.simpleSanitize(image.title || `unknow_${_i}.jpg`)
          const savePath = `${workDir}\\${fileName}`
          // 逐项已存在跳过：暂停恢复/重试重跑时不重复下载
          if (await file.pathExists(savePath)) return
          await weibo.downloadImage(image.pid, savePath)
        },
        (success, fail, total) => {
          updateTask(task, { progress: { success, fail, total } })
          task.onSuccess?.()
        }
      )
      if (fail > 0) {
        updateTask(task, {
          from: 'weibo',
          status: 'error',
          errorMessage: `${fail}/${images.length} 个媒体下载失败，重试只会补下失败部分`,
          localFilePath: workDir
        })
        return
      }
    }
    updateTask(task, { from: 'weibo', status: 'success', localFilePath: workDir })
  } catch (e) {
    console.log('🚀 ~ runWeibo ~ e:', e)
    if (task._cancel) {
      updateTask(task, { status: 'canceled' })
      return
    }
    if (task._pause) {
      updateTask(task, { status: 'paused' })
      return
    }
    // isPathExists 抛出的「已存在」已把任务置为 existed，这里仅覆盖真实下载错误
    if (task.status !== 'existed') {
      updateTask(task, { status: 'error', errorMessage: formatTaskError(e, `${stage}失败`) })
    }
  }
}
async function runPornhub(task) {
  let { videoUrl, format, quality, fileName } = task.payload
  const { pageUrl, baseDir } = task.payload
  let stage = '准备下载'
  try {
    updateTask(task, { status: 'running', errorMessage: undefined })

    // 批量任务入队时未解析直链：下载开始时再解析（避免 token 过期）
    if (!videoUrl) {
      stage = '解析视频地址'
      const info = await pornhub.getVideoInfo(pageUrl)
      if (!info?.success || !info.sources?.length) {
        throw new Error(info?.error || '未解析到播放地址')
      }
      const best = info.sources[0]
      videoUrl = best.url
      format = best.format
      quality = best.quality || 0
      fileName = fileName || [info.uploader, info.title].filter(Boolean).join('--')
    }
    abortIfRequested(task)
    stage = '下载视频'

    const safeName = file.simpleSanitize(fileName || `pornhub_${Date.now()}`)
    // 批量下载时按用户名建子目录（downloadPath/<用户名>/<文件名>），单个下载直接存根目录
    const workDir = task.payload.subDir
      ? `${baseDir}\\${file.simpleSanitize(task.payload.subDir)}`
      : `${baseDir}`
    const savePath = `${workDir}\\${safeName}.mp4`

    // mp4 直链支持 Range 断点续传（部分文件可追加，完整文件返回 416 视为已完成），不做已存在跳过
    // m3u8 无跨任务续传能力，已存在则跳过
    if (format !== 'mp4') {
      await isPathExists(savePath, task)
    }

    // 订阅下载进度：m3u8 按片段计数映射 success/total，mp4 按字节百分比映射 value/total
    // 高频进度节流：updateTask 会触发全队列排序，事件过密时批量任务会把渲染进程拖垮
    let totalSegments = 0
    let lastUiUpdate = 0
    let unsubscribe = () => {}
    try {
      unsubscribe = pornhub.onProgress((progress) => {
        if (task._cancel || task._pause) {
          // 任务被取消/暂停：主动中断底层下载，令 startDownload 抛错走收尾
          pornhub.cancelDownload?.()
          return
        }
        const highFreq = progress.type === 'download_progress' || progress.type === 'mp4_progress'
        if (highFreq) {
          const now = Date.now()
          if (now - lastUiUpdate < 200) return
          lastUiUpdate = now
        }
        if (progress.type === 'download_start') {
          totalSegments = progress.total
          updateTask(task, { progress: { success: 0, fail: 0, total: totalSegments } })
        } else if (progress.type === 'download_progress') {
          updateTask(task, {
            progress: { success: progress.current, fail: 0, total: progress.total }
          })
        } else if (progress.type === 'mp4_progress') {
          // value 统一为 0-100 百分比口径（与 pixiv 动图/twitter 视频/本地移动一致）
          updateTask(task, { progress: { value: progress.percent || 0, total: 1 } })
        } else if (progress.type === 'merge') {
          updateTask(task, {
            progress: { success: progress.total, fail: 0, total: progress.total }
          })
        }
      })
    } catch (e) {
      console.warn('pornhub onProgress 订阅失败:', e)
    }

    try {
      const result = await pornhub.startDownload({ videoUrl, format, quality, savePath })
      if (!result || !result.success) {
        throw new Error(result?.error || '下载失败')
      }
      const finalProgress =
        format === 'mp4'
          ? { value: 1, total: 1 }
          : totalSegments > 0
            ? { success: totalSegments, fail: 0, total: totalSegments }
            : { success: 1, total: 1 }
      updateTask(task, {
        from: 'pornhub',
        status: 'success',
        progress: finalProgress,
        localFilePath: result.outputPath || savePath
      })
      task.onSuccess?.()
    } finally {
      unsubscribe()
    }
  } catch (e) {
    console.log('🚀 ~ runPornhub ~ e:', e)
    if (task._cancel) {
      pornhub.cancelDownload?.()
      updateTask(task, { status: 'canceled' })
      return
    }
    if (task._pause) {
      updateTask(task, { status: 'paused' })
      return
    }
    // isPathExists 抛出的「已存在」已把任务置为 existed，这里仅覆盖真实下载错误
    if (task.status !== 'existed') {
      updateTask(task, { status: 'error', errorMessage: formatTaskError(e, `${stage}失败`) })
    }
  }
}

async function runPicaman(task) {
  const { comicInfo, baseDir } = task.payload
  let stage = '下载图片'
  try {
    updateTask(task, { status: 'running', errorMessage: undefined })
    const workDir = `${baseDir}\\${file.simpleSanitize(comicInfo.author)}\\${file.simpleSanitize(comicInfo.title || 'unknown')}`
    await isPathExists(workDir, task)
    const images = comicInfo.imgList || []
    if (!images.length) throw new Error('未找到可下载的图片')
    const { fail } = await runWithConcurrency(
      images,
      task,
      async (img, i) => {
        const ext = img.url.split('.').pop() || 'jpg'
        const savePath = `${workDir}\\${i.toString().padStart(5, '0')}.${ext}`
        // 逐项已存在跳过：暂停恢复/重试重跑时不重复下载
        if (await file.pathExists(savePath)) return
        await picaman.downloadImage(savePath, img.url)
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
    if (fail > 0) {
      updateTask(task, {
        from: 'picaman',
        status: 'error',
        errorMessage: `${fail}/${images.length} 张图片下载失败，重试只会补下失败部分`,
        localFilePath: workDir
      })
      return
    }
    updateTask(task, { from: 'picaman', status: 'success', localFilePath: workDir })
  } catch (e) {
    console.log('🚀 ~ runPicaman ~ e:', e)
    if (task._cancel) {
      updateTask(task, { status: 'canceled' })
      return
    }
    if (task._pause) {
      updateTask(task, { status: 'paused' })
      return
    }
    // isPathExists 抛出的「已存在」已把任务置为 existed，这里仅覆盖真实下载错误
    if (task.status !== 'existed') {
      updateTask(task, { status: 'error', errorMessage: formatTaskError(e, `${stage}失败`) })
    }
  }
}

async function runYfantasy(task) {
  const { segments, title, baseDir } = task.payload
  let stage = '下载视频片段'
  try {
    updateTask(task, { status: 'running', errorMessage: undefined })
    const workDir = `${baseDir}\\${file.simpleSanitize(title)}`
    if (!segments || !segments.length) throw new Error('无可下载的片段')
    const { fail } = await runWithConcurrency(
      segments,
      task,
      async (seg) => {
        if (!seg.url) throw new Error('片段地址为空')
        const fileName = `${file.simpleSanitize(title)}_seg_${seg.segmentIndex}.mp4`
        const savePath = `${workDir}\\${fileName}`
        // 逐项已存在跳过：暂停恢复/重试重跑时不重复下载
        if (await file.pathExists(savePath)) return
        await yfantasy.downloadSegment(seg.url, savePath)
      },
      (success, fail, total) => {
        updateTask(task, { progress: { success, fail, total } })
        task.onSuccess?.()
      }
    )
    if (fail > 0) {
      updateTask(task, {
        from: 'yfantasy',
        status: 'error',
        errorMessage: `${fail}/${segments.length} 个片段下载失败，重试只会补下失败部分`,
        localFilePath: workDir
      })
      return
    }
    updateTask(task, { from: 'yfantasy', status: 'success', localFilePath: workDir })
  } catch (e) {
    console.log('🚀 ~ runYfantasy ~ e:', e)
    if (task._cancel) {
      updateTask(task, { status: 'canceled' })
      return
    }
    if (task._pause) {
      updateTask(task, { status: 'paused' })
      return
    }
    updateTask(task, { status: 'error', errorMessage: formatTaskError(e, `${stage}失败`) })
  }
}

async function run4khd(task) {
  const {
    images: loadedImages = [],
    url,
    maxPage = 1,
    pagesLoaded = 1,
    title,
    baseDir
  } = task.payload
  let stage = '准备下载'
  try {
    updateTask(task, { status: 'running', errorMessage: undefined })
    const workDir = `${baseDir}\\${file.simpleSanitize(title)}`
    await isPathExists(workDir, task)
    // 详情页滚动加载只读了部分分页时，下载前自动补齐剩余分页（分批并发）
    let images = [...loadedImages]
    if (url && maxPage > 1 && pagesLoaded < maxPage) {
      stage = '补充分页'
      const pages = []
      for (let p = pagesLoaded + 1; p <= maxPage; p++) pages.push(p)
      for (let i = 0; i < pages.length; i += 5) {
        abortIfRequested(task)
        const batch = pages.slice(i, i + 5)
        const results = await Promise.all(
          batch.map((p) => fourkhd.fetchDetailPage(url, p).catch(() => ({ images: [] })))
        )
        results.forEach((r) => images.push(...(r?.images || [])))
      }
      images = [...new Set(images)]
    }
    if (!images.length) throw new Error('未找到可下载的图片')
    stage = '下载图片'
    const { fail } = await runWithConcurrency(
      images,
      task,
      async (url, i) => {
        const ext = (url.split('?')[0].split('.').pop() || 'jpg').toLowerCase()
        const savePath = `${workDir}\\${i.toString().padStart(5, '0')}.${ext}`
        // 逐项已存在跳过：暂停恢复/重试重跑时不重复下载
        if (await file.pathExists(savePath)) return
        await fourkhd.downloadFile(url, savePath)
      },
      (success, fail, total) => {
        updateTask(task, { progress: { success, fail, total } })
        task.onSuccess?.()
      }
    )
    if (fail > 0) {
      updateTask(task, {
        from: '4khd',
        status: 'error',
        errorMessage: `${fail}/${images.length} 张图片下载失败，重试只会补下失败部分`,
        localFilePath: workDir
      })
      return
    }
    updateTask(task, { from: '4khd', status: 'success', localFilePath: workDir })
  } catch (e) {
    console.log('🚀 ~ run4khd ~ e:', e)
    if (task._cancel) {
      updateTask(task, { status: 'canceled' })
      return
    }
    if (task._pause) {
      updateTask(task, { status: 'paused' })
      return
    }
    // isPathExists 抛出的「已存在」已把任务置为 existed，这里仅覆盖真实下载错误
    if (task.status !== 'existed') {
      updateTask(task, { status: 'error', errorMessage: formatTaskError(e, `${stage}失败`) })
    }
  }
}

async function runHuangguo(task) {
  const { m3u8Url, title, baseDir, quality, siteUrl, videoId, ep, fileName } = task.payload
  let stage = '准备下载'
  try {
    updateTask(task, { status: 'running', errorMessage: undefined })
    let playUrl = m3u8Url
    let cdnHeaders = {}
    // auth_key 有时效，下载开始前通过 play 接口实时获取播放地址
    if (videoId) {
      stage = '获取播放地址'
      try {
        const play = await huangguo.getPlayUrl(videoId, ep)
        if (play?.success && play.videoUrl) {
          playUrl = play.videoUrl
          // m3u8 请求需要 x-cdn-auth / x-cdn-app 鉴权头（加密通道回包下发）
          cdnHeaders = play.cdnHeaders || {}
        } else {
          console.warn('huangguo getPlayUrl 失败，回退页面地址:', play?.error)
        }
      } catch (e) {
        console.warn('huangguo getPlayUrl 异常，回退页面地址:', e)
      }
    }
    if (!playUrl) throw new Error('未解析到 m3u8 地址')
    abortIfRequested(task)
    stage = '下载视频'

    // baseDir 已含标题父文件夹，文件命名：第n集.mp4
    const safeName = file.simpleSanitize(fileName || title || `huangguo_${Date.now()}`)
    const workDir = `${baseDir}`
    const savePath = `${workDir}\\${safeName}.mp4`

    // 已存在则跳过
    if (await file.pathExists(savePath)) {
      updateTask(task, { status: 'existed', progress: {}, localFilePath: savePath })
      throw new Error(`${savePath} 已存在`)
    }

    // 订阅下载进度，按片段计数映射为 success/total（与 pixiv 下载进度口径一致）
    let totalSegments = 0
    let unsubscribe = () => {}
    try {
      unsubscribe = huangguo.onProgress((progress) => {
        if (task._cancel || task._pause) {
          // 取消/暂停：主动中断底层下载（原先只 return，删除任务后会后台跑完）
          huangguo.cancelDownload?.()
          return
        }
        if (progress.type === 'download_start') {
          totalSegments = progress.total
          updateTask(task, { progress: { success: 0, fail: 0, total: totalSegments } })
        } else if (progress.type === 'download_progress') {
          updateTask(task, {
            progress: { success: progress.current, fail: 0, total: progress.total }
          })
        } else if (progress.type === 'merge') {
          // 合并阶段保持满进度
          updateTask(task, {
            progress: { success: progress.total, fail: 0, total: progress.total }
          })
        }
      })
    } catch (e) {
      console.warn('huangguo onProgress 订阅失败:', e)
    }

    try {
      const result = await huangguo.startDownload({
        m3u8Url: playUrl,
        quality: quality || '1080p',
        savePath,
        siteUrl,
        cdnHeaders
      })
      if (!result || !result.success) {
        throw new Error(result?.error || '下载失败')
      }
      // 成功后沿用片段总数，避免 total 从片段数跳变为 1
      if (totalSegments > 0) {
        updateTask(task, {
          from: 'huangguo',
          status: 'success',
          progress: { success: totalSegments, fail: 0, total: totalSegments },
          localFilePath: result.outputPath || savePath
        })
      } else {
        updateTask(task, {
          from: 'huangguo',
          status: 'success',
          progress: { success: 1, total: 1 },
          localFilePath: result.outputPath || savePath
        })
      }
      task.onSuccess?.()
    } finally {
      unsubscribe()
    }
  } catch (e) {
    console.log('🚀 ~ runHuangguo ~ e:', e)
    if (task._cancel) {
      huangguo.cancelDownload?.()
      updateTask(task, { status: 'canceled' })
      return
    }
    if (task._pause) {
      huangguo.cancelDownload?.()
      updateTask(task, { status: 'paused' })
      return
    }
    updateTask(task, { status: 'error', errorMessage: formatTaskError(e, `${stage}失败`) })
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
    case 'pornhub':
      await runPornhub(task)
      break
    case 'picaman':
      await runPicaman(task)
      break
    case 'yfantasy':
      await runYfantasy(task)
      break
    case '4khd':
      await run4khd(task)
      break
    case 'huangguo':
      await runHuangguo(task)
      break
    case 'local-move':
      await runLocalMove(task)
      break
    default:
      updateTask(task, { status: 'error', errorMessage: `未知任务类型「${task.site}」` })
  }
  // 本地移动不是下载，不记入下载历史
  if (task.site === 'local-move') return
  // 只记真实完成的任务；执行期间被删除（对象已脱离 tasks）的旧执行也不写
  if (task.status !== 'success' && task.status !== 'existed') return
  if (!task.localFilePath || !tasks.includes(task)) return
  try {
    await window.downloadHistory.addDownloadHistory(task.localFilePath, task.type || 'book')
  } catch (error) {
    console.error('保存下载历史失败:', error)
  }
}

/** 执行器看门狗：任务被删除/置为取消或暂停、或长时间无进展（updatedAt 停滞）
 *  时释放执行器，避免挂死的 await 永久占住队列。释放时以克隆对象顶替数组项，
 *  旧执行（可能仍挂起）后续的 updateTask 全部落在脱离数组的旧对象上，不再影响队列 */
const STALL_TIMEOUT_MS = 5 * 60 * 1000
const GUARD_TICK_MS = 5000

function releaseTaskFromRunner(task, reason) {
  const idx = tasks.findIndex((t) => t.id === task.id)
  if (idx === -1) return // 已删除，无需顶替
  if (reason === 'stalled') {
    killRemoteDownload(task)
    task.status = 'error'
    task.errorMessage = '长时间无进展，已自动跳过（可重试）'
  }
  tasks[idx] = { ...task }
  tasks[idx].updatedAt = Date.now()
  sortTasks()
  reportActiveDownloads()
}

function runUnderGuard(task, execPromise) {
  let timer = 0
  const guard = new Promise((resolve) => {
    timer = setInterval(() => {
      if (!tasks.some((t) => t.id === task.id)) resolve('deleted')
      else if (task.status === 'canceled' || task.status === 'paused') resolve('aborted')
      else if (Date.now() - (task.updatedAt || Date.now()) > STALL_TIMEOUT_MS) resolve('stalled')
    }, GUARD_TICK_MS)
  })
  return Promise.race([execPromise, guard])
    .finally(() => clearInterval(timer))
    .then((outcome) => {
      if (typeof outcome === 'string') releaseTaskFromRunner(task, outcome)
    })
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
      await runUnderGuard(next, executeTask(next))
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
  retryTask,
  cancelTask,
  deleteTask,
  clearCompletedTask,
  startRunner
}

// ============================================================
// ⚠️ 临时演示数据：车票卡片样式联调用，看完把 SEED_DEMO 置 false
// 直接 push（不走 addTask/startRunner），runner 不会被触发；
// pending 演示用未知 site「demo-queue」，即便日后被 runner 捡起也只走兜底报错分支
// ============================================================
const SEED_DEMO = false
if (SEED_DEMO) {
  const demo = [
    {
      site: 'pixiv',
      title: '这是一个很长很长的作品标题用来测试省略号与悬浮提示的显示效果',
      status: 'running',
      progress: { success: 12, fail: 1, total: 20 }
    },
    {
      site: 'pornhub',
      title: '视频直链下载（mp4 断点续传）',
      status: 'running',
      progress: { value: 37, total: 1 }
    },
    {
      site: 'local-move',
      title: '本地作品移动（含字节进度）',
      status: 'running',
      progress: { value: 53, success: 8, fail: 0, total: 15, sizeDone: 3355443, sizeTotal: 8912896 }
    },
    {
      site: 'twitter',
      title: '短标题任务',
      status: 'paused',
      progress: { success: 3, fail: 0, total: 10 }
    },
    {
      site: 'demo-queue',
      title: '队列中等待的任务',
      status: 'pending',
      progress: { success: 0, fail: 0, total: 30 }
    },
    {
      site: 'jmtt',
      title: '已存在跳过的任务',
      status: 'existed',
      progress: {},
      localFilePath: 'D:\\Downloads\\Comics\\禁漫天堂\\某作者\\第01话'
    },
    {
      site: 'yfantasy',
      title: '已取消的任务',
      status: 'canceled',
      progress: { success: 2, fail: 0, total: 8 }
    },
    {
      site: 'weibo',
      title: '已完成的任务示例',
      status: 'success',
      progress: { success: 50, fail: 0, total: 50 },
      localFilePath: 'D:\\Downloads\\Comics\\某作者\\作品合集'
    },
    {
      site: 'huangguo',
      title: '失败任务示例（长错误信息）',
      status: 'error',
      progress: { success: 5, fail: 3, total: 10 },
      errorMessage:
        '下载视频失败：网络连接超时，请检查代理设置后重试。服务器返回 502 Bad Gateway（upstream connect error or disconnect/reset before headers）'
    },
    {
      site: '4khd',
      title: '部分失败带路径的任务',
      status: 'error',
      progress: { success: 5, fail: 5, total: 10 },
      errorMessage: '5/10 张图片下载失败，重试只会补下失败部分',
      localFilePath: 'D:\\Downloads\\Comics\\4K高清\\套图A'
    }
  ]
  const now = Date.now()
  tasks.push(
    ...demo.map((d, i) => ({
      ...d,
      id: uid(),
      serial: ++serialSeed,
      createdAt: now - (demo.length - i) * 60000,
      updatedAt: now
    }))
  )
  sortTasks()
  reportActiveDownloads()
  // running 任务模拟进度推进，观察圆环/进度条动效；全部饱和后自停
  const demoTimer = setInterval(() => {
    let pendingTick = false
    for (const t of tasks) {
      if (t.status !== 'running') continue
      const p = t.progress || {}
      if (p.total === 1 && p.value !== undefined) {
        if (p.value < 100) {
          pendingTick = true
          updateTask(t, { progress: { ...p, value: Math.min(100, p.value + 1) } })
        }
      } else if ((p.success || 0) + (p.fail || 0) < (p.total || 0)) {
        pendingTick = true
        updateTask(t, { progress: { ...p, success: (p.success || 0) + 1 } })
      }
    }
    if (!pendingTick) clearInterval(demoTimer)
  }, 800)
}
