import { ref, shallowRef, nextTick, watch, onMounted, onUnmounted, type Ref } from 'vue'
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

/** 打开（飞行 + 封面翻开）时长；封面过渡由 --fly-dur 变量同步 */
const OPEN_DURATION = 1000
/** 关闭（合书）时长：比打开更利落，CSS 侧由 --fly-dur 变量同步到封面过渡 */
const CLOSE_DURATION = 700
/** 打开缓动（快出慢入）；关闭用其时间镜像 CLOSE_EASE 实现倒放手感 */
const OPEN_EASE = 'cubic-bezier(0.25, 1, 0.5, 1)'
const CLOSE_EASE = 'cubic-bezier(0.5, 0, 0.75, 1)'

let flyingStage: HTMLElement | null = null
/** 飞行代际令牌：光盘打开的 onArrive 延迟到动画尾部，期间任何新的打开/关闭
 *  顶掉本次飞行时代际递增，让尾部回调只清理、不再打开（防旧条目迟到的覆盖） */
let flyToken = 0

/**
 * 飞行舞台元素：真实阅读器（library 的 reader-overlay）通过 <Teleport :to>
 * 挂载进来，随舞台从卡片大小一起放大到阅读器尺寸——动画中看到的内页就是
 * 阅读器本体，不存在快照与真实界面的对接缝。飞行结束时置回 null，
 * Teleport 自动把 overlay 归还原容器（矩形一致，无视觉跳动）。
 */
export const flyStageEl = shallowRef<HTMLElement | null>(null)

/**
 * 创建飞行舞台 + 书本铬件快照（打开/关闭共用）：
 * 克隆卡片本体作铬件（保留 scoped 样式与内联 CSS 变量），舞台定位到阅读器
 * 覆盖层矩形（.reader-host 边界，与应用侧栏无关；未标记时退回视口）。
 * 原卡临时隐藏（占位不动，避免网格重排），防双重影像。
 */
function createFlyStage(cardEl: HTMLElement) {
  const firstRect = cardEl.getBoundingClientRect()

  // 快照：清除跟随倾斜的内联变换，回落到组件 CSS 里的静止姿态
  const snapshot = cardEl.cloneNode(true) as HTMLElement
  snapshot.style.transform = ''
  snapshot.style.transition = ''

  const stage = document.createElement('div')
  stage.className = 'flying-card-stage'
  const hostRect = cardEl.closest('.reader-host')?.getBoundingClientRect()
  const target = hostRect ?? document.documentElement.getBoundingClientRect()
  stage.style.left = `${target.left}px`
  stage.style.top = `${target.top}px`
  stage.style.width = `${target.width}px`
  stage.style.height = `${target.height}px`
  stage.appendChild(snapshot)
  document.body.appendChild(stage)

  // 结构改造（仅作用于快照）：封面挂到铰链层上翻开。
  // 须在挂载后执行——脱离文档的元素读不到计算样式（封面深度会取 0）
  setupOpenableCover(snapshot)

  cardEl.style.visibility = 'hidden'

  const lastRect = stage.getBoundingClientRect()
  const deltaX = firstRect.left - lastRect.left
  const deltaY = firstRect.top - lastRect.top
  const scaleX = firstRect.width / lastRect.width
  const scaleY = firstRect.height / lastRect.height
  const shrink = `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`
  return { stage, snapshot, cardEl, shrink }
}

/**
 * 打开（点击卡片 → 飞向阅读器区域，FLIP）：
 * 铬件与真实阅读器（Teleport 挂入舞台、垫在铬件之下）一起从原网格位置
 * 放大到阅读器矩形，封面绕书脊侧翻开、露出下方阅读器本体。
 * onArrive 在点击瞬间回调打开阅读器（isOpen=true，overlay 即刻挂入舞台）。
 * 到达后铬件淡出（阅读器原位不动），随后 Teleport 归还、移除舞台。
 */
export function flyCardFullscreen(cardEl: HTMLElement | undefined, onArrive: () => void) {
  if (!cardEl || flyingStage) {
    // 无元素或已有飞行进行中：跳过动画直接打开；并令牌 +1 使进行中的
    // 光盘打开尾部回调失效（避免其迟到的 onArrive 覆盖本次打开）
    flyToken++
    onArrive()
    return
  }

  const { stage, snapshot, cardEl: source, shrink } = createFlyStage(cardEl)
  flyingStage = stage
  // 封面翻开的过渡时长与舞台飞行同步（CSS 侧 .flying-rotator 等读 --fly-dur）
  stage.style.setProperty('--fly-dur', `${OPEN_DURATION}ms`)

  // FLIP：先瞬间摆回原网格位置，再过渡到阅读器区域（舞台矩形）
  stage.style.transformOrigin = 'top left'
  stage.style.transition = 'none'
  stage.style.transform = shrink
  void stage.offsetHeight // 强制回流，让起始姿态先生效

  // Teleport 目标先就位，再打开阅读器：overlay 渲染时直接挂进舞台，
  // 从第一帧起就随舞台缩放（初始被未翻开的封面盖住，随翻开逐渐露出）
  flyStageEl.value = stage
  onArrive()

  requestAnimationFrame(() => {
    stage.style.transition = `transform ${OPEN_DURATION}ms ${OPEN_EASE}`
    stage.style.transform = 'translate(0, 0) scale(1, 1)'
    // 封面翻开与飞行同时启动
    stage.classList.add('opened')
  })

  // 到达：铬件淡出，阅读器在下面原位不动
  window.setTimeout(() => {
    snapshot.style.transition = 'opacity 0.3s ease'
    snapshot.style.opacity = '0'
    // 淡出完成后归还 Teleport 挂载（overlay 移回原容器，矩形一致无跳动），
    // 等 DOM 移动落地后再拆舞台
    window.setTimeout(async () => {
      flyStageEl.value = null
      await nextTick()
      stage.remove()
      source.style.visibility = ''
      flyingStage = null
    }, 300)
  }, OPEN_DURATION)
}

/**
 * 关闭（打开的倒放：阅读器缩回卡片位置、封面合上）：
 * 起始即翻开态（.opened 在插入前就位，不触发过渡），把仍在渲染的阅读器
 * Teleport 进舞台，随舞台缩回原卡矩形；封面转回合上、铭牌横幅转回显示。
 * 到达时铬件与原卡外观一致、位置重合，直接卸载阅读器并移除舞台即可。
 * isStillClosing：飞行中网格可被点击重新打开其它作品（舞台 pointer-events
 * 穿透），届时跳过卸载、只做舞台清理。
 */
export function flyCardClose(
  cardEl: HTMLElement | undefined,
  onClose: () => void,
  isStillClosing: () => boolean = () => true
) {
  if (!cardEl || flyingStage) {
    // 无元素或已有飞行进行中：跳过动画直接关闭；并令牌 +1 使进行中的
    // 光盘打开尾部回调失效（关闭后再被其迟到的 onArrive 重新打开）
    flyToken++
    onClose()
    return
  }

  const { stage, cardEl: source, shrink } = createFlyStage(cardEl)
  flyingStage = stage
  // 起始 = 打开完成态（封面已翻开）；.closing 同时把合上曲线换成镜像版。
  // 起始姿态必须「无过渡地」摆到已翻开：若只靠 .opened 类 + 回流，回流瞬间
  // 就会启动 0°→-180° 的翻开过渡，下一帧移除 .opened 时封面才转了两三度
  // 又折返，全程看不到合书。做法：内联禁过渡直接摆位 → 回流固化 → 撤内联
  // （与类给的 -180 计算值一致，不触发过渡）→ 之后移除 .opened 才真正转回
  stage.classList.add('opened', 'closing')
  // 封面合上的过渡时长与舞台缩小同步（CSS 侧 .flying-rotator 等读 --fly-dur）
  stage.style.setProperty('--fly-dur', `${CLOSE_DURATION}ms`)
  const rotator = stage.querySelector('.flying-rotator') as HTMLElement | null
  if (rotator) {
    const depth = rotator.style.getPropertyValue('--fly-depth').trim() || '0px'
    rotator.style.transition = 'none'
    rotator.style.transform = `translateZ(${depth}) rotateY(-180deg)`
    void stage.offsetHeight
    rotator.style.transition = ''
    rotator.style.transform = ''
  }

  // 把仍在渲染的阅读器挂进舞台（Teleport 目标变化即时移动 DOM），随舞台缩回
  flyStageEl.value = stage

  // 等 Teleport 移入落地后的下一帧再启动倒放
  nextTick(() =>
    requestAnimationFrame(() => {
      stage.classList.remove('opened')
      stage.style.transformOrigin = 'top left'
      stage.style.transition = `transform ${CLOSE_DURATION}ms ${CLOSE_EASE}`
      stage.style.transform = shrink
    })
  )

  // 到达：仍是这部在关才真正卸载阅读器（可能在飞行中被重新打开其它作品）
  window.setTimeout(async () => {
    if (isStillClosing()) onClose()
    flyStageEl.value = null
    await nextTick()
    stage.remove()
    source.style.visibility = ''
    flyingStage = null
  }, CLOSE_DURATION)
}

/* ===== 光盘打开：银盘弹出 + 黑洞吞噬 ===== */

/** 光盘打开总时序：0ms 封面翻开（0.6s），600ms 封面全开后盘片卡扣弹出，
 *  550ms 黑洞开始吞噬，1000ms 铺满 */
const DISC_OPEN_DURATION = 1000
/** 封面翻开过渡时长（与 cd-media-card scoped 样式的 0.6s 一致）：
 *  盘片须等封面完全打开后才起跳 */
const DISC_COVER_OPEN_MS = 300
/** 盘片卡扣弹出的等效缩放（translateZ 透视换算成原地缩放：Z/1200 视距，
 *  盘片偏离透视图心，直接 translateZ 会向旁滑移） */
const DISC_POP_SCALE_PEAK = ((1200 + 120) / 1200) * 1.03
const DISC_POP_SCALE_REST = ((1200 + 100) / 1200) * 1.02
/** 黑洞扩张：盘片弹起落定（600+240ms）后起跑，550ms 完成 */
const HOLE_DELAY = 550
const HOLE_DURATION = 550
/** 关闭（光盘）时序：黑洞收拢后盘片缩回盒内，再合上封面 */
const DISC_CLOSE_RETURN_DELAY = 400
const DISC_CLOSE_RETURN = 250
const DISC_CLOSE_COVER = 750
const DISC_CLOSE_TOTAL = 1400
/** 黑洞扩张/收拢的缓动（互为时间镜像） */
const HOLE_EASE = 'cubic-bezier(0.6, 0, 0.2, 1)'
const HOLE_EASE_REVERSE = 'cubic-bezier(0.8, 0, 0.4, 1)'
/** 盘片中心孔的基准半径（与 cd-media-card 的克隆孔一致，缩放以此为基准） */
const HOLE_BASE_RADIUS = 10

/**
 * 光盘打开过渡：
 * 1. 真实卡进入 disc-opening 态（铭牌淡出、盒底保留）；封面克隆进飞行层
 *    垫在盘片之上翻开 135°（真实封面层级低于飞行层，直接翻会被飞行盘盖住）；
 * 2. 克隆银盘（保留银光旋转与中心孔，转速加快到 2s）固定在原位，待封面
 *    完全翻开后（600ms）卡扣式原地弹出（WAAPI：80ms 内放大到峰值，随后
 *    回弹落定）；
 * 3. 盘片中心孔放大成黑洞，吞掉整个阅读器区域（缩放按孔心到区域四角的
 *    最远距离计算，保证铺满）；
 * 4. 铺满瞬间 onArrive 打开阅读器（黑底与黑洞无缝衔接），随后恢复卡片、
 *    清理飞行层。
 * 与书本打开不同：阅读器不经 Teleport 挂入舞台，直接由黑洞切入。
 */
export function flyDiscOpen(cardEl: HTMLElement | undefined, onArrive: () => void) {
  if (!cardEl || flyingStage) {
    flyToken++
    onArrive()
    return
  }
  const disc = cardEl.querySelector('.cd-disc') as HTMLElement | null
  if (!disc) {
    onArrive()
    return
  }

  const token = ++flyToken
  const rect = disc.getBoundingClientRect()
  const hostRect =
    cardEl.closest('.reader-host')?.getBoundingClientRect() ??
    document.documentElement.getBoundingClientRect()

  // 飞行层：直接定位成阅读器区域矩形并裁剪（见 style.css 的 overflow）——
  // 黑洞随便放多大都被裁在阅读器范围内，侧栏不被动黑；透视供盘片 Z 弹出
  const layer = document.createElement('div')
  layer.className = 'flying-disc-layer'
  layer.style.left = `${hostRect.left}px`
  layer.style.top = `${hostRect.top}px`
  layer.style.width = `${hostRect.width}px`
  layer.style.height = `${hostRect.height}px`
  document.body.appendChild(layer)
  flyingStage = layer

  // 克隆银盘：scoped 样式与伪元素（银光旋转/中心孔）随克隆保留；
  // 定位尺寸内联注入（相对飞行层的坐标，覆盖卡片里的居中定位）；
  // 银光转速加快（示例的飞行盘 2s）
  const clone = disc.cloneNode(true) as HTMLElement
  clone.classList.add('cloned-disc')
  clone.style.position = 'absolute'
  clone.style.left = `${rect.left - hostRect.left}px`
  clone.style.top = `${rect.top - hostRect.top}px`
  clone.style.right = 'auto'
  clone.style.bottom = 'auto'
  clone.style.margin = '0'
  clone.style.width = `${rect.width}px`
  clone.style.height = `${rect.height}px`
  clone.style.transform = 'none'
  clone.style.setProperty('--disc-spin-dur', '2s')

  // 黑洞：飞行层直接子节点、锚在盘心（z300 压过盘片 z100 与封面克隆 z200，
  // 吞噬时连翻开中的封面一起盖掉）
  const hole = document.createElement('div')
  hole.className = 'cloned-disc-hole'
  hole.style.left = `${rect.left + rect.width / 2 - hostRect.left}px`
  hole.style.top = `${rect.top + rect.height / 2 - hostRect.top}px`
  layer.appendChild(clone)
  layer.appendChild(hole)

  // 原盘临时隐藏（封面翻开露出的是飞行中的克隆），真实卡进入打开态
  disc.style.opacity = '0'
  cardEl.classList.add('disc-opening')

  // 封面也克隆进飞行层、垫在盘片之上（z200 > 盘片 z100）：真实封面在网格
  // 层级里，翻开会从飞行盘下方扫过（层 z9999 恒压卡片之上）。克隆继承
  // scoped 的过渡/透视样式，几何与真实封面一致；CSS 变量挂在 .media-card
  // 上，需随克隆拷贝（封面画与厚度）
  const cover = cardEl.querySelector('.cover-container') as HTMLElement | null
  let coverClone: HTMLElement | null = null
  if (cover) {
    const cardStyle = getComputedStyle(cardEl)
    const crect = cover.getBoundingClientRect()
    coverClone = cover.cloneNode(true) as HTMLElement
    coverClone.classList.add('cloned-cover')
    coverClone.style.position = 'absolute'
    coverClone.style.left = `${crect.left - hostRect.left}px`
    coverClone.style.top = `${crect.top - hostRect.top}px`
    coverClone.style.width = `${crect.width}px`
    coverClone.style.height = `${crect.height}px`
    coverClone.style.zIndex = '200'
    coverClone.style.setProperty(
      '--box-thickness',
      cardStyle.getPropertyValue('--box-thickness') || '20px'
    )
    const coverImage = cardStyle.getPropertyValue('--cover-image')
    if (coverImage) coverClone.style.setProperty('--cover-image', coverImage)
    layer.appendChild(coverClone)
    // 回流固化闭合起始姿态，否则翻开过渡不会触发（见 flyCardClose 同类坑）
    void coverClone.offsetHeight
    cover.style.visibility = 'hidden'
  }

  // 盘片卡扣回弹：原地朝观察者放大（示例的 translateZ 透视对居中元素等效于
  // 缩放；盘片在网格里偏离透视图心，直接 translateZ 会向旁滑移，故用等效倍率）；
  // 延迟一个封面翻开的时长——盘片等封面完全打开后才起跳，期间透过透明
  // 面板可见其静卧盒中
  clone.animate(
    [
      { transform: 'scale(1)', offset: 0 },
      { transform: `scale(${DISC_POP_SCALE_PEAK})`, offset: 0.08, easing: 'ease-out' },
      { transform: `scale(${DISC_POP_SCALE_REST})`, offset: 0.3, easing: 'ease-in-out' },
      { transform: `scale(${DISC_POP_SCALE_REST})`, offset: 1 }
    ],
    { duration: 800, delay: DISC_COVER_OPEN_MS, fill: 'forwards' }
  )

  // 黑洞吞噬：从盘片原位放大到盖住阅读器区域四角（超出部分被飞行层裁剪，
  // 留 1.3 倍余量确保四角落在渐变的实心区内，不透缝）
  const holeCx = rect.left + rect.width / 2
  const holeCy = rect.top + rect.height / 2
  const farthest = Math.max(
    Math.hypot(hostRect.left - holeCx, hostRect.top - holeCy),
    Math.hypot(hostRect.right - holeCx, hostRect.top - holeCy),
    Math.hypot(hostRect.left - holeCx, hostRect.bottom - holeCy),
    Math.hypot(hostRect.right - holeCx, hostRect.bottom - holeCy)
  )
  const maxScale = (farthest * 1.3) / HOLE_BASE_RADIUS
  hole.animate(
    [
      { transform: 'translate(-50%, -50%) scale(1)' },
      { transform: `translate(-50%, -50%) scale(${maxScale})` }
    ],
    {
      duration: HOLE_DURATION,
      delay: HOLE_DELAY,
      easing: HOLE_EASE,
      fill: 'forwards'
    }
  )

  // 封面克隆下一帧翻开（与真实封面原时机一致：0.6s 过渡由 scoped 样式提供）；
  // 克隆内的横幅同步淡出（真实侧由 disc-opening 驱动）
  requestAnimationFrame(() => {
    if (!coverClone) return
    coverClone.style.transform =
      'perspective(1200px) scale(0.976) rotateY(-135deg) translateZ(var(--box-thickness))'
    const banner = coverClone.querySelector('.comic-title-banner') as HTMLElement | null
    if (banner) banner.style.opacity = '0'
  })

  // 黑洞铺满后打开阅读器（黑底无缝接棒）；期间被其它打开/关闭顶掉则只清理
  window.setTimeout(
    async () => {
      const stale = token !== flyToken
      if (!stale) onArrive()
      await nextTick()
      requestAnimationFrame(() => {
        layer.remove()
        disc.style.opacity = ''
        if (cover) cover.style.visibility = ''
        cardEl.classList.remove('disc-opening')
        flyingStage = null
      })
    },
    Math.max(DISC_OPEN_DURATION, HOLE_DELAY + HOLE_DURATION)
  )
}

/**
 * 光盘关闭（打开的倒放，盒子原地不动）：
 * 起手铺满的黑洞与阅读器黑底同形（阅读器立即卸载、无缝接管），真实卡被
 * 无过渡地摆到打开态垫底；随后黑洞收拢回盘心揭开网格、克隆盘原地缩回
 * 盒内，最后移除 disc-opening 让封面绕左缘合上（自带 0.6s 过渡）。
 * 盒底与卡片全程留在原位，不参与任何缩放。
 */
export function flyDiscClose(
  cardEl: HTMLElement | undefined,
  onClose: () => void,
  isStillClosing: () => boolean = () => true
) {
  if (!cardEl || flyingStage) {
    flyToken++
    onClose()
    return
  }
  const disc = cardEl.querySelector('.cd-disc') as HTMLElement | null
  if (!disc) {
    onClose()
    return
  }

  // 递增令牌：使未完成的光盘打开尾部回调失效（本函数清理无条件执行）
  flyToken++
  const rect = disc.getBoundingClientRect()
  const hostRect =
    cardEl.closest('.reader-host')?.getBoundingClientRect() ??
    document.documentElement.getBoundingClientRect()

  // 飞行层：定位成阅读器区域矩形并裁剪（同打开）
  const layer = document.createElement('div')
  layer.className = 'flying-disc-layer'
  layer.style.left = `${hostRect.left}px`
  layer.style.top = `${hostRect.top}px`
  layer.style.width = `${hostRect.width}px`
  layer.style.height = `${hostRect.height}px`
  document.body.appendChild(layer)
  flyingStage = layer

  // 克隆银盘就位（弹出的落定姿态）；黑洞直接铺满（无过渡）
  const clone = disc.cloneNode(true) as HTMLElement
  clone.classList.add('cloned-disc')
  clone.style.position = 'absolute'
  clone.style.left = `${rect.left - hostRect.left}px`
  clone.style.top = `${rect.top - hostRect.top}px`
  clone.style.right = 'auto'
  clone.style.bottom = 'auto'
  clone.style.margin = '0'
  clone.style.width = `${rect.width}px`
  clone.style.height = `${rect.height}px`
  clone.style.transform = `scale(${DISC_POP_SCALE_REST})`
  clone.style.setProperty('--disc-spin-dur', '2s')

  const hole = document.createElement('div')
  hole.className = 'cloned-disc-hole'
  const holeCx = rect.left + rect.width / 2
  const holeCy = rect.top + rect.height / 2
  const farthest = Math.max(
    Math.hypot(hostRect.left - holeCx, hostRect.top - holeCy),
    Math.hypot(hostRect.right - holeCx, hostRect.top - holeCy),
    Math.hypot(hostRect.left - holeCx, hostRect.bottom - holeCy),
    Math.hypot(hostRect.right - holeCx, hostRect.bottom - holeCy)
  )
  const maxScale = (farthest * 1.3) / HOLE_BASE_RADIUS
  // 黑洞为飞行层直接子节点、锚在盘心、初始铺满（无过渡）
  hole.style.left = `${holeCx - hostRect.left}px`
  hole.style.top = `${holeCy - hostRect.top}px`
  hole.style.transform = `translate(-50%, -50%) scale(${maxScale})`
  layer.appendChild(clone)
  layer.appendChild(hole)

  // 真实卡无过渡地摆到打开态（封面已翻开、露出空盒），真实盘隐藏
  const cover = cardEl.querySelector('.cover-container') as HTMLElement | null
  if (cover) cover.style.transition = 'none'
  cardEl.classList.add('disc-opening')
  void cardEl.offsetHeight
  if (cover) cover.style.transition = ''
  disc.style.opacity = '0'

  // 阅读器立即卸载：铺满的黑洞黑面无缝接管。已不是这部在关则撤场直接关
  if (!isStillClosing()) {
    layer.remove()
    disc.style.opacity = ''
    cardEl.classList.remove('disc-opening')
    flyingStage = null
    return
  }
  onClose()

  // 下一帧倒放：黑洞收拢回盘心，随后盘片原地缩回盒内
  nextTick(() =>
    requestAnimationFrame(() => {
      hole.animate(
        [
          { transform: `translate(-50%, -50%) scale(${maxScale})` },
          { transform: 'translate(-50%, -50%) scale(1)' }
        ],
        { duration: HOLE_DURATION, easing: HOLE_EASE_REVERSE, fill: 'forwards' }
      )
      clone.animate(
        [
          { transform: `scale(${DISC_POP_SCALE_REST})` },
          { transform: 'scale(1)' }
        ],
        { duration: DISC_CLOSE_RETURN, delay: DISC_CLOSE_RETURN_DELAY, easing: 'ease-out', fill: 'forwards' }
      )
    })
  )

  // 盘已落回：撤克隆与黑洞（已收拢为盘心黑点，随盘一起消失，不留浮点）、
  // 恢复真实盘，移除打开态让封面合上（0.6s 过渡）。
  // 清理无条件执行（各步幂等）——若以 token 守卫，关闭中途被新打开顶掉时
  // 这里被跳过，flyingStage 永不清空，之后所有打开/关闭动画都会失效
  window.setTimeout(() => {
    clone.style.display = 'none'
    hole.style.display = 'none'
    disc.style.opacity = ''
    cardEl.classList.remove('disc-opening')
  }, DISC_CLOSE_COVER)

  // 封面合上后清理
  window.setTimeout(() => {
    layer.remove()
    flyingStage = null
  }, DISC_CLOSE_TOTAL)
}

/**
 * 给飞行快照加装「可翻开封面」：
 * 读取封面容器当前的 translateZ 深度，把封面移入铰链层（.flying-rotator，
 * 翻开动画见 style.css）沿书脊侧旋转，封面前方深度不变。封面后方不垫
 * 任何东西——真实阅读器就挂在舞台里，翻开即见。
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

  const cardBody = cover.parentElement
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
