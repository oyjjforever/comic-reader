import { ref, watch, onMounted, onUnmounted, type Ref } from 'vue'
import type { MediaItem } from '@/typings/media'

/**
 * 本地绝对路径转 file:/// URL。
 * Windows 反斜杠路径直接进 CSS url() 会被当转义符吞掉（\A→换行、\c→%0C），
 * 统一转正斜杠并编码，img src 与 CSS 背景共用。
 */
const toFileUrl = (path: string) => `file:///${encodeURI(path.replace(/\\/g, '/'))}`

/**
 * 视频截帧生成缩略图（第 5 秒画面，配合主进程封面缓存）
 */
function getVideoThumbnail(path: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const video = document.createElement('video')
    video.src = toFileUrl(path)
    video.crossOrigin = 'anonymous'

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = 5
    })

    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx && ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      } catch (error) {
        reject(new Error('Failed to create data URL.'))
      }
    })

    video.addEventListener('error', () => {
      reject(new Error('Failed to load video.'))
    })
  })
}

/**
 * 媒体卡片共用封面逻辑：解析策略链 coverUrl（在线）→ coverPath（本地图片）→
 * videoPath（截帧并走缓存）→ 默认占位图，配合视口懒加载。
 * 书本卡与光盘盒卡共用。
 */
export function useMediaCardCover(item: Ref<MediaItem>, cardRef: Ref<HTMLElement | undefined>) {
  const imageError = ref(false)
  const coverImageSrc = ref<string>('')
  const isLoadingCover = ref(false)
  const hasCoverLoaded = ref(false)
  let observer: IntersectionObserver | undefined

  const loadCoverInfo = async () => {
    if (hasCoverLoaded.value) return
    if (item.value.state === 'loading') return

    try {
      isLoadingCover.value = true
      imageError.value = false
      const media = item.value

      if (media.coverUrl) {
        coverImageSrc.value = media.coverUrl
      } else if (media.coverPath) {
        coverImageSrc.value = toFileUrl(media.coverPath)
      } else if (media.videoPath) {
        const cachedCover = await window.videoCover.get(media.videoPath)
        if (cachedCover) {
          coverImageSrc.value = toFileUrl(cachedCover)
        } else {
          const thumbnailDataUrl = await getVideoThumbnail(media.videoPath)
          coverImageSrc.value = thumbnailDataUrl
          // 异步写入缓存，不阻塞渲染
          window.videoCover
            .saveFromDataUrl(media.videoPath, thumbnailDataUrl)
            .catch((err) => console.warn('缓存视频封面失败:', err))
        }
      } else {
        coverImageSrc.value = ''
        imageError.value = true
      }

      hasCoverLoaded.value = true
    } catch (error) {
      console.error('获取封面信息失败:', error)
      imageError.value = true
      coverImageSrc.value = ''
    } finally {
      isLoadingCover.value = false
    }
  }

  // 视口懒加载封面
  onMounted(() => {
    if (!cardRef.value) return
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasCoverLoaded.value) {
            if (item.value.state !== 'loading') {
              loadCoverInfo()
              observer?.unobserve(entry.target)
            }
          }
        })
      },
      {
        rootMargin: '100px',
        threshold: 0.1
      }
    )
    observer.observe(cardRef.value)
  })

  // 条目从 loading 态就绪后加载封面
  watch(
    () => item.value.state,
    (newState, oldState) => {
      if (oldState === 'loading' && newState !== 'loading' && !hasCoverLoaded.value) {
        loadCoverInfo()
      }
    }
  )

  onUnmounted(() => {
    observer?.disconnect()
    observer = undefined
  })

  return { coverImageSrc, isLoadingCover, imageError }
}

/* ===== 点击打开的飞入过渡 ===== */

/** 与 .flying-card-veil 的过渡时长保持一致 */
const FLY_DURATION = 1200

let flyingStage: HTMLElement | null = null

/**
 * 点击卡片 → 铺满全屏的打开过渡（FLIP）：
 * 克隆卡片本体作为飞行快照（保留 scoped 样式与内联 CSS 变量，不改卡片本身），
 * 从原网格位置飞向全屏，同时封面绕书脊侧翻开、露出内页「正在进入...」。
 * 临近终点回调打开阅读器（黑底覆盖层），快照到达后淡出交棒。
 * 原卡在飞行期间临时隐藏防重影，结束或移除时恢复。
 */
export function flyCardFullscreen(cardEl: HTMLElement | undefined, onArrive: () => void) {
  if (!cardEl || flyingStage) {
    // 无元素或已有飞行进行中：跳过动画直接打开
    onArrive()
    return
  }

  const firstRect = cardEl.getBoundingClientRect()

  // 快照：清除跟随倾斜的内联变换，回落到组件 CSS 里的静止姿态
  const snapshot = cardEl.cloneNode(true) as HTMLElement
  snapshot.style.transform = ''
  snapshot.style.transition = ''

  const stage = document.createElement('div')
  stage.className = 'flying-card-stage'
  stage.appendChild(snapshot)
  document.body.appendChild(stage)
  flyingStage = stage

  // 结构改造（仅作用于快照）：封面挂到铰链层上翻开，后面垫上内页。
  // 须在挂载后执行——脱离文档的元素读不到计算样式（封面深度会取 0）
  setupOpenableCover(snapshot)

  // 原卡临时隐藏（占位不动，避免网格重排），防双重影像
  cardEl.style.visibility = 'hidden'

  // FLIP：先瞬间摆回原网格位置，再过渡到全屏
  const lastRect = stage.getBoundingClientRect()
  const deltaX = firstRect.left - lastRect.left
  const deltaY = firstRect.top - lastRect.top
  const scaleX = firstRect.width / lastRect.width
  const scaleY = firstRect.height / lastRect.height

  stage.style.transformOrigin = 'top left'
  stage.style.transition = 'none'
  stage.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`
  void stage.offsetHeight // 强制回流，让起始姿态先生效

  requestAnimationFrame(() => {
    stage.style.transition = `transform ${FLY_DURATION}ms cubic-bezier(0.25, 1, 0.5, 1)`
    stage.style.transform = 'translate(0, 0) scale(1, 1)'
    // 封面翻开与飞行同时启动
    stage.classList.add('opened')
  })

  const cleanup = () => {
    stage.remove()
    cardEl.style.visibility = ''
    flyingStage = null
  }

  // 稍早于动画终点打开阅读器（黑底覆盖层垫在快照之下）
  window.setTimeout(onArrive, FLY_DURATION - 80)
  // 到达后快照淡出，向阅读器交棒
  window.setTimeout(() => {
    stage.style.opacity = '0'
    window.setTimeout(cleanup, 300)
  }, FLY_DURATION)
}

/**
 * 给飞行快照加装「可翻开封面」：
 * 读取封面容器当前的 translateZ 深度，把封面移入铰链层（.flying-rotator，
 * 翻开动画见 style.css），封面前方深度不变；原位垫一张内页（.flying-inside）。
 */
function setupOpenableCover(snapshot: HTMLElement) {
  const cover = snapshot.querySelector('.cover-container') as HTMLElement | null
  if (!cover || !cover.parentElement) return

  // 封面在卡片坐标里的推进深度（书本随页数、光盘盒固定 20px）
  let depth = 0
  try {
    const computed = getComputedStyle(cover).transform
    if (computed && computed !== 'none') depth = new DOMMatrix(computed).m43
  } catch {
    depth = 0
  }

  const rotator = document.createElement('div')
  rotator.className = 'flying-rotator'
  rotator.style.setProperty('--fly-depth', `${depth}px`)

  const inside = document.createElement('div')
  inside.className = 'flying-inside'
  const entering = document.createElement('h3')
  entering.textContent = '正在进入...'
  inside.appendChild(entering)

  const cardBody = cover.parentElement
  cardBody.insertBefore(inside, cover)
  cardBody.insertBefore(rotator, cover)
  rotator.appendChild(cover)

  // 深度已转移到铰链层，封面自身的 transform 抵消（其余样式原样保留）
  cover.style.transform = 'none'
}

/**
 * 媒体卡片共用元信息：评分加载 + 点击时的浏览历史记录与 open 分发
 */
export function useMediaCardMeta(
  item: Ref<MediaItem>,
  ns: Ref<string>,
  onOpen: (item: MediaItem) => void
) {
  const rating = ref(0)

  onMounted(async () => {
    try {
      rating.value = await window.rating.getRating(item.value.path || '', ns.value)
    } catch (error) {
      console.error('加载评分失败:', error)
    }
  })

  const handleCardClick = async () => {
    try {
      await window.browseHistory.addBrowseHistory(item.value.path || '', ns.value)
    } catch (error) {
      console.error('记录浏览历史失败:', error)
    }
    onOpen(item.value)
  }

  return { rating, handleCardClick }
}

/**
 * 鼠标跟随 3D 倾斜：随光标位置 ±maxTilt 度，同步高光坐标变量（--gx/--gy）。
 * @param getBaseZ 书本后移量（= 厚度）：整本书退后一个厚度让封面落在 z=0 平面，
 * 消除透视放大导致的厚书封面偏大；倾斜时同样带上该偏移，避免悬停瞬间跳变。
 * 性能要点：
 * - 跟踪期间禁用 transition——每次 mousemove 重启过渡会让卡片永远"追不上"光标，是卡顿主因；
 *   过渡只在移出回正时启用。
 * - 几何信息在 mouseenter 缓存一次：3D 变换会改变 getBoundingClientRect，
 *   逐次读取既强制样式重算又引入抖动。
 * - mousemove 高回报率鼠标下每秒可达数百次，用 rAF 合帧，每帧最多写一次样式。
 */
export function use3DTilt(
  cardRef: Ref<HTMLElement | undefined>,
  maxTilt: number,
  getBaseZ: () => number = () => 0
) {
  let cachedRect: { left: number; top: number; width: number; height: number } | null = null
  let rafId = 0
  let pendingEvent: MouseEvent | null = null

  const applyTilt = () => {
    rafId = 0
    const card = cardRef.value
    const e = pendingEvent
    pendingEvent = null
    if (!card || !e) return
    if (!cachedRect) {
      const r = card.getBoundingClientRect()
      cachedRect = { left: r.left, top: r.top, width: r.width, height: r.height }
    }

    const centerX = cachedRect.width / 2
    const centerY = cachedRect.height / 2
    if (!centerX || !centerY) return

    const x = e.clientX - cachedRect.left
    const y = e.clientY - cachedRect.top
    const rotateX = ((y - centerY) / centerY) * -maxTilt
    const rotateY = ((x - centerX) / centerX) * maxTilt

    card.style.transition = 'none'
    card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(${10 - getBaseZ()}px)`
    card.style.setProperty('--gx', `${(x / cachedRect.width) * 100}%`)
    card.style.setProperty('--gy', `${(y / cachedRect.height) * 100}%`)
  }

  /** 进卡时缓存几何信息（需绑定 @mouseenter） */
  const handleTiltEnter = () => {
    const card = cardRef.value
    if (!card) return
    const r = card.getBoundingClientRect()
    cachedRect = { left: r.left, top: r.top, width: r.width, height: r.height }
  }

  const handle3DTilt = (e: MouseEvent) => {
    pendingEvent = e
    if (!rafId) rafId = requestAnimationFrame(applyTilt)
  }

  /** 鼠标移出：恢复过渡并回正 */
  const reset3DTilt = () => {
    const card = cardRef.value
    if (!card) return
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    pendingEvent = null
    cachedRect = null
    card.style.transition = ''
    card.style.transform = ''
  }

  return { handleTiltEnter, handle3DTilt, reset3DTilt }
}
