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

/** 打开缩放（快出慢入）；关闭用其时间镜像 CLOSE_EASE 实现倒放手感 */
const OPEN_EASE = 'cubic-bezier(0.25, 1, 0.5, 1)'
const CLOSE_EASE = 'cubic-bezier(0.5, 0, 0.75, 1)'

/* ===== 书本打开：原地翻封面 + 内容从书位放大 ===== */

/** 封面原地翻开/合上时长（绕书脊翻至 120°） */
const BOOK_COVER_SWING = 600
/** 内容（真实阅读器）在书位与全屏之间的缩放时长 */
const BOOK_ZOOM = 600
/** 书本打开总时序：0ms 封面翻开，600ms 内容放大起跑，1200ms 完成 */
const BOOK_OPEN_TOTAL = BOOK_COVER_SWING + BOOK_ZOOM
/** 书本关闭总时序：0ms 内容缩回书位（600ms 落位），550ms 封面起合 */
const BOOK_CLOSE_TOTAL = 1200
/** 封面翻开缓动（与光盘盒封面同曲线）；合上用 CLOSE_EASE（加速落定） */
const BOOK_COVER_EASE = 'cubic-bezier(0.2, 0.9, 0.3, 1)'
/** 打断倒放的最短时长（进度过半时仍保底一拍，避免闪一下 */
const MIN_REVERSE_MS = 120

/**
 * 飞行舞台元素：真实阅读器（library 的 reader-overlay）通过 <Teleport :to>
 * 挂载进来，随内容舞台从书位一起放大到阅读器尺寸——动画中看到的内页就是
 * 阅读器本体，不存在快照与真实界面之间的对接缝。飞行结束时置回 null，
 * Teleport 自动把 overlay 归还原容器（矩形一致，无视觉跳动）。
 */
export const flyStageEl = shallowRef<HTMLElement | null>(null)

/* ===== 飞行注册表：打开/关闭动画的打断与收场 ===== */

/** 书本飞行（打开/关闭/倒放共用）的元素与时序引用 */
interface BookFlight {
  cover: HTMLElement
  badge: HTMLElement | null
  stage: HTMLElement
  backdrop: HTMLElement
  wrap: HTMLElement
  coverClone: HTMLElement
  banner: HTMLElement | null
  coverAnim: Animation | null
  bannerAnim: Animation | null
  /** 内容放大已起跑（600ms 定时器已触发） */
  zoomStarted: boolean
  zoomStartAt: number
  /** 内容舞台/底板缩回书位的目标 transform（打开起点 = 关闭终点） */
  fitTransform: string
  fillBackdrop: string
}

/** 光盘飞行的元素与时序引用 */
interface DiscFlight {
  disc: HTMLElement
  cover: HTMLElement | null
  clone: HTMLElement
  hole: HTMLElement
  coverClone: HTMLElement | null
  popAnim: Animation | null
  holeAnim: Animation | null
}

/** 一次进行中的打开/关闭动画。settle 可立即定格清场；倒放复用同一对象
 *  （kind 改写为 *-close），其定时器/动画先取消再重排 */
interface Flight {
  kind: 'book-open' | 'book-close' | 'disc-open' | 'disc-close'
  cardEl: HTMLElement
  layer: HTMLElement
  startTime: number
  timers: number[]
  anims: Animation[]
  book?: BookFlight
  disc?: DiscFlight
  /** settle 时的附带清理（如光盘打开期的临时侧键监听），须幂等 */
  onSettle?: () => void
}

let activeFlight: Flight | null = null

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

/** WAAPI 当前进度（延迟期/未创建为 0，fill:forwards 完成态为 1） */
function progressOf(anim: Animation | null | undefined): number {
  if (!anim || !anim.effect) return 0
  const p = anim.effect.getComputedTiming().progress
  return p == null ? 0 : clamp(p, 0, 1)
}

/** 定时器挂到飞行上：settle/cancel 后不再触发（句柄也会被清） */
function later(f: Flight, fn: () => void, ms: number): number {
  const id = window.setTimeout(() => {
    f.timers = f.timers.filter((t) => t !== id)
    if (activeFlight === f) fn()
  }, ms)
  f.timers.push(id)
  return id
}

/** WAAPI 动画挂到飞行上：settle/cancel 时一并取消 */
function runAnim(
  f: Flight,
  el: HTMLElement,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options: KeyframeAnimationOptions
): Animation {
  const anim = el.animate(keyframes, options)
  f.anims.push(anim)
  return anim
}

/** 冻结 CSS 过渡：把过渡中的插值矩阵固化为内联样式并停掉过渡（打断倒放用） */
function freezeTransition(el: HTMLElement) {
  const m = getComputedStyle(el).transform
  el.style.transition = 'none'
  el.style.transform = m
}

/** 取消飞行的全部定时器与动画（倒放前先读姿态再调用——fill:forwards 的
 *  动画在 cancel 前一直压着内联样式，先 cancel 会闪回起始姿态） */
function cancelTimeline(f: Flight) {
  f.timers.forEach((id) => window.clearTimeout(id))
  f.timers = []
  f.anims.forEach((a) => a.cancel())
  f.anims = []
}

/**
 * 立即收场：清时序、拆层、恢复卡片（幂等，不触发任何 onArrive/onClose）。
 * 书本先置空 flyStageEl 等 Teleport 归位后再拆层（微任务内完成，不闪）；
 * 光盘移除 disc-opening 让真封面走自带 0.6s 过渡柔和合上。阅读器的卸载
 * 由调用方经 onClose 负责，settle 只管视觉清场。
 */
function settleFlight(f: Flight) {
  if (activeFlight !== f) return
  activeFlight = null
  cancelTimeline(f)
  if (f.kind.startsWith('book')) {
    const b = f.book!
    flyStageEl.value = null
    void nextTick().then(() => f.layer.remove())
    b.cover.style.visibility = ''
    if (b.badge) b.badge.style.opacity = ''
    f.cardEl.style.pointerEvents = ''
  } else {
    const d = f.disc!
    d.clone.style.display = 'none'
    d.hole.style.display = 'none'
    if (d.coverClone) d.coverClone.style.display = 'none'
    d.disc.style.opacity = ''
    if (d.cover) d.cover.style.visibility = ''
    f.cardEl.classList.remove('disc-opening')
    f.layer.remove()
  }
  f.onSettle?.()
}

/** 还原元素的未变换布局盒：悬浮倾斜下 getBoundingClientRect 是旋转后的
 *  外接矩形，比卡身大一圈，拿去定位会让克隆/舞台与卡错位。旋转与透视缩放
 *  都绕卡心（shell 的 perspective-origin 即卡心），外接矩形中心恒等于卡心，
 *  用不受 transform 影响的布局尺寸（offsetWidth/Height）从中反推 */
function layoutBoxOf(el: HTMLElement): DOMRect {
  const aabb = el.getBoundingClientRect()
  return new DOMRect(
    aabb.left + (aabb.width - el.offsetWidth) / 2,
    aabb.top + (aabb.height - el.offsetHeight) / 2,
    el.offsetWidth,
    el.offsetHeight
  )
}

/** 创建飞行层：定位成阅读器区域矩形并裁剪（.reader-host 边界，与应用侧栏
 *  无关；未标记时退回视口）。光盘与书本共用同一层样式 */
function createFlyingLayer(cardEl: HTMLElement) {
  const hostRect =
    cardEl.closest('.reader-host')?.getBoundingClientRect() ??
    document.documentElement.getBoundingClientRect()
  const layer = document.createElement('div')
  layer.className = 'flying-disc-layer'
  layer.style.left = `${hostRect.left}px`
  layer.style.top = `${hostRect.top}px`
  layer.style.width = `${hostRect.width}px`
  layer.style.height = `${hostRect.height}px`
  document.body.appendChild(layer)
  return { layer, hostRect }
}

/**
 * 书本封面克隆（打开/关闭共用）：外层 wrap 定位在书本布局盒上（若卡上存在
 * --base-rz 初始倾角则一并施加，与真实书身姿态一致）；内层封面克隆绕左缘
 * （书脊侧）翻开/合上，透视自带在 transform 里。层级随阶段切换（JS 在恰当时
 * 机改写 wrap 的 z-index，切换瞬间两者不重叠、无感）：打开起手浮在内容舞台
 * 之上（z200，合着的封面盖着缩在书位的阅读器），内容放大起跑时沉到其下
 * （z50，扩张的内容一路盖过平放着的封面）；关闭起手沉在全屏舞台之下
 * （z50，随内容缩回被逐步揭开），封面起合前抬回其上（z200，压着落位的
 * 内容合上）。startOpen 为 true 时直接摆 120° 打开姿态且横幅隐藏（随合上回显）。
 */
function createBookCoverClone(
  cardEl: HTMLElement,
  cover: HTMLElement,
  rect: DOMRect,
  hostRect: DOMRect,
  startOpen: boolean
) {
  const baseRz = getComputedStyle(cardEl).getPropertyValue('--base-rz').trim() || '0deg'

  const wrap = document.createElement('div')
  wrap.className = 'cloned-book-cover-wrap'
  wrap.style.left = `${rect.left - hostRect.left}px`
  wrap.style.top = `${rect.top - hostRect.top}px`
  wrap.style.width = `${rect.width}px`
  wrap.style.height = `${rect.height}px`
  wrap.style.transform = `rotateZ(${baseRz})`
  wrap.style.zIndex = startOpen ? '50' : '200'

  const clone = cover.cloneNode(true) as HTMLElement
  clone.classList.add('cloned-book-cover')
  clone.style.transformOrigin = 'left center'
  clone.style.transform = `perspective(1200px) rotateY(${startOpen ? '-120' : '0'}deg)`
  wrap.appendChild(clone)

  const banner = clone.querySelector('.comic-title-banner') as HTMLElement | null
  if (startOpen && banner) banner.style.opacity = '0'
  return { wrap, clone, banner }
}

/** 内容舞台的书位姿态：等比缩到能装进书位并居中——阅读器保持真实比例，
 *  不随竖版书位拉伸（横版阅读器在书位里是居中的小横条）；等比余量交给
 *  黑色底板兜底，放大到全屏时余量归零 */
function contentStageFitTransform(rect: DOMRect, hostRect: DOMRect): string {
  const s = Math.min(rect.width / hostRect.width, rect.height / hostRect.height)
  const x = rect.left - hostRect.left + (rect.width - hostRect.width * s) / 2
  const y = rect.top - hostRect.top + (rect.height - hostRect.height * s) / 2
  return `translate(${x}px, ${y}px) scale(${s})`
}

/** 黑色底板的书位姿态：非等比缩放铺满书位（纯色无变形），保证书脸没有
 *  镂空；放大到全屏时与舞台矩形重合 */
function contentBackdropTransform(rect: DOMRect, hostRect: DOMRect): string {
  return `translate(${rect.left - hostRect.left}px, ${rect.top - hostRect.top}px) scale(${rect.width / hostRect.width}, ${rect.height / hostRect.height})`
}

/**
 * 书本打开过渡（书原地不动，封面翻开、内容从书里放大）：
 * 1. 真实封面隐藏（书原地立在网格里），封面克隆进飞行层盖在书位上；
 *    铭牌淡出，书身清掉悬浮倾斜并禁指针（防倾斜跟动与克隆错位）；
 * 2. 真实阅读器（Teleport）挂进内容舞台，等比缩到书位居中、垫在黑色底板
 *    与合着的封面克隆之下——封面原地翻开 120° 的过程里露出的就是阅读器
 *    本体（真实比例，黑边落在底板上）；
 * 3. 封面打开后内容从书位放大到全屏（舞台等比、底板补满，终态黑边归零）；
 *    封面克隆同时沉到舞台之下，被扩张的内容一路盖过。放大完成即归还
 *    Teleport（矩形一致无跳动）、拆层、恢复卡片——全程发生在全屏阅读器
 *    之下，用户不可见。
 * 打断：任何在飞动画被本次打开顶掉（settle 立即收场）；本飞行自身在关闭
 * 打断时由 reverseBookOpen 原地倒放（见 flyBookClose）。
 */
export function flyBookOpen(cardEl: HTMLElement | undefined, onArrive: () => void) {
  // 任何在飞的动画被本次打开顶掉：立即收场（恢复其卡片与层级）
  if (activeFlight) settleFlight(activeFlight)
  if (!cardEl) {
    onArrive()
    return
  }
  const cover = cardEl.querySelector('.cover-container') as HTMLElement | null
  if (!cover) {
    onArrive()
    return
  }

  const rect = layoutBoxOf(cardEl)
  const { layer, hostRect } = createFlyingLayer(cardEl)
  const flight: Flight = {
    kind: 'book-open',
    cardEl,
    layer,
    startTime: performance.now(),
    timers: [],
    anims: []
  }
  activeFlight = flight

  // 内容舞台：真实阅读器 Teleport 挂入，等比缩到能装进书位并居中（可见，
  // 合着的封面克隆盖在上面）——封面翻开即见真实内容，全程不拉伸变形
  const stage = document.createElement('div')
  stage.className = 'flying-content-stage'
  stage.style.transition = 'none'
  stage.style.transform = contentStageFitTransform(rect, hostRect)
  layer.appendChild(stage)

  // 黑色底板：铺满书位的"屏幕"底色（非等比缩放对纯色无影响），放大时与
  // 舞台同参长到全屏，终态两者矩形重合、黑边归零
  const backdrop = document.createElement('div')
  backdrop.className = 'flying-content-backdrop'
  backdrop.style.transition = 'none'
  backdrop.style.transform = contentBackdropTransform(rect, hostRect)
  layer.insertBefore(backdrop, stage)
  void backdrop.offsetHeight

  const { wrap, clone: coverClone, banner } = createBookCoverClone(
    cardEl,
    cover,
    rect,
    hostRect,
    false
  )
  layer.appendChild(wrap)

  // 真实卡进入打开态：封面让位给克隆、铭牌淡出
  cover.style.visibility = 'hidden'
  const badge = cardEl.querySelector('.stamp-badge') as HTMLElement | null
  if (badge) badge.style.opacity = '0'
  cardEl.style.pointerEvents = 'none'
  cardEl.style.transition = ''
  cardEl.style.transform = ''

  flight.book = {
    cover,
    badge,
    stage,
    backdrop,
    wrap,
    coverClone,
    banner,
    coverAnim: null,
    bannerAnim: null,
    zoomStarted: false,
    zoomStartAt: 0,
    fitTransform: contentStageFitTransform(rect, hostRect),
    fillBackdrop: contentBackdropTransform(rect, hostRect)
  }

  // 阅读器即刻挂入舞台（垫在封面克隆之下），打开瞬间就在书位待命
  flyStageEl.value = stage
  onArrive()

  // 封面原地翻开：横幅随开淡出，封面渐压暗（打开角度大，露出的是封面
  // 背面的暗面）；rAF 守卫——被顶掉收场后不再起动画
  requestAnimationFrame(() => {
    if (activeFlight !== flight || !flight.book) return
    flight.book.coverAnim = runAnim(
      flight,
      coverClone,
      [
        { transform: 'perspective(1200px) rotateY(0deg)', filter: 'brightness(1)' },
        { transform: 'perspective(1200px) rotateY(-120deg)', filter: 'brightness(0.35)' }
      ],
      { duration: BOOK_COVER_SWING, easing: BOOK_COVER_EASE, fill: 'forwards' }
    )
    if (banner) {
      flight.book.bannerAnim = runAnim(
        flight,
        banner,
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 300, fill: 'forwards' }
      )
    }
  })

  // 封面打开后：内容从书位放大到全屏（舞台等比保比例、底板同参补满）；
  // 封面克隆同时沉到舞台之下（此刻两者恰好不再重叠，切换无感）——扩张
  // 的内容一路盖过打开着的封面，不会浮在放大中的内容之上
  later(
    flight,
    () => {
      const b = flight.book!
      b.zoomStarted = true
      b.zoomStartAt = performance.now()
      wrap.style.zIndex = '50'
      stage.style.transition = `transform ${BOOK_ZOOM}ms ${OPEN_EASE}`
      backdrop.style.transition = `transform ${BOOK_ZOOM}ms ${OPEN_EASE}`
      stage.style.transform = 'translate(0, 0) scale(1)'
      backdrop.style.transform = 'translate(0, 0) scale(1, 1)'
    },
    BOOK_COVER_SWING
  )

  // 放大完成：归还 Teleport、拆层、恢复卡片（settleFlight 幂等清场）
  later(flight, () => settleFlight(flight), BOOK_OPEN_TOTAL)
}

/**
 * 书本打开中途被打断（同卡关闭）：复用原飞行层与舞台，从当前姿态原地倒放。
 * 打开两阶段对应两种倒放起手：
 * - 封面阶段（内容仍在书位）：封面克隆从当前角度直接合回，无缩放参与；
 * - 放大阶段：舞台/底板定格在过渡中的插值矩阵上，按剩余比例缩回书位
 *   （打断越晚缩得越快，t=600 处与正常关闭时长无缝衔接），封面随后合上。
 * 阅读器全程留在舞台里（倒放的就是它本体），封面合严后再卸载（onClose）。
 */
function reverseBookOpen(f: Flight, onClose: () => void, isStillClosing: () => boolean) {
  const b = f.book!
  // 先读当前进度再取消时序：fill:forwards 的动画在 cancel 前一直压着
  // 内联样式，先 cancel 会闪回起始姿态（进度也会归零、无法复原）
  const coverP = progressOf(b.coverAnim)
  const bannerP = progressOf(b.bannerAnim)
  cancelTimeline(f)
  f.kind = 'book-close'

  const finish = () => {
    if (isStillClosing()) onClose()
    settleFlight(f)
  }

  if (!b.zoomStarted) {
    // 封面阶段：wrap 仍处打开起手的 z200（盖在书位内容之上），直接合回
    const angle = -120 * coverP
    const brightness = 1 + (0.35 - 1) * coverP
    const dur = clamp(coverP * BOOK_COVER_SWING, MIN_REVERSE_MS, BOOK_COVER_SWING)
    b.coverClone.style.transform = `perspective(1200px) rotateY(${angle}deg)`
    runAnim(
      f,
      b.coverClone,
      [
        {
          transform: `perspective(1200px) rotateY(${angle}deg)`,
          filter: `brightness(${brightness})`
        },
        { transform: 'perspective(1200px) rotateY(0deg)', filter: 'brightness(1)' }
      ],
      { duration: dur, easing: CLOSE_EASE, fill: 'forwards' }
    )
    if (b.banner) {
      const bannerNow = 1 - bannerP
      runAnim(
        f,
        b.banner,
        [{ opacity: bannerNow }, { opacity: 1 }],
        { duration: Math.min(dur, 300), fill: 'forwards' }
      )
    }
    later(f, finish, dur)
    return
  }

  // 放大阶段：定格舞台/底板当前矩阵（getComputedStyle 取到的是过渡插值），
  // 缩回目标复用打开时的书位姿态；封面已是全开完成态，内联兜底防回弹
  freezeTransition(b.stage)
  freezeTransition(b.backdrop)
  const zp = clamp((performance.now() - b.zoomStartAt) / BOOK_ZOOM, 0, 1)
  const zoomDur = clamp((1 - zp) * BOOK_ZOOM, MIN_REVERSE_MS, BOOK_ZOOM)
  b.coverClone.style.transform = 'perspective(1200px) rotateY(-120deg)'
  b.coverClone.style.filter = 'brightness(0.35)'
  requestAnimationFrame(() => {
    if (activeFlight !== f) return
    b.stage.style.transition = `transform ${zoomDur}ms ${CLOSE_EASE}`
    b.stage.style.transform = b.fitTransform
    b.backdrop.style.transition = `transform ${zoomDur}ms ${CLOSE_EASE}`
    b.backdrop.style.transform = b.fillBackdrop
  })
  // 封面在内容落位尾部起合（同正常关闭的时序形状）
  const coverDelay = Math.max(zoomDur - 50, 0)
  later(
    f,
    () => {
      b.wrap.style.zIndex = '200'
      runAnim(
        f,
        b.coverClone,
        [
          { transform: 'perspective(1200px) rotateY(-120deg)', filter: 'brightness(0.35)' },
          { transform: 'perspective(1200px) rotateY(0deg)', filter: 'brightness(1)' }
        ],
        { duration: BOOK_COVER_SWING, easing: CLOSE_EASE, fill: 'forwards' }
      )
      if (b.banner) {
        runAnim(f, b.banner, [{ opacity: 0 }, { opacity: 1 }], {
          duration: 300,
          fill: 'forwards'
        })
      }
    },
    coverDelay
  )
  later(f, finish, coverDelay + BOOK_COVER_SWING)
}

/**
 * 书本关闭（打开的倒放，书原地不动）：
 * 起手把仍在渲染的阅读器 Teleport 进全屏舞台（矩形一致无跳动）；封面克隆
 * 无过渡地摆在 120° 打开姿态、沉在舞台之下、真实封面隐藏——书在网格里
 * 呈翻开状，内容是阅读器本体。随后内容舞台等比缩回书位、黑色底板缩满
 * 书脸（封面随之被逐步揭开），落位后封面克隆抬回舞台之上、压着内容合上
 * （横幅回显）；阅读器保持渲染到封面合严才卸载（否则书脸会空洞一瞬）。
 * 合严后归还 Teleport、拆层、恢复卡片。
 * 打断：同卡打开中收到关闭 → reverseBookOpen 原地倒放（核心打断场景）；
 * 同卡关闭中再按返回 → 立即收场并直接关闭（"现在就关"语义）；其它在飞
 * （点击网格开新作品等）→ 收场后走本次流程。
 */
export function flyBookClose(
  cardEl: HTMLElement | undefined,
  onClose: () => void,
  isStillClosing: () => boolean = () => true
) {
  const prev = activeFlight
  if (prev && cardEl && prev.kind === 'book-open' && prev.cardEl === cardEl) {
    reverseBookOpen(prev, onClose, isStillClosing)
    return
  }
  if (prev) {
    settleFlight(prev)
    // 关闭中再关：收场后直接关闭，不再重播一遍关闭动画
    if (cardEl && prev.kind === 'book-close' && prev.cardEl === cardEl) {
      onClose()
      return
    }
  }
  if (!cardEl) {
    onClose()
    return
  }
  const cover = cardEl.querySelector('.cover-container') as HTMLElement | null
  if (!cover) {
    onClose()
    return
  }

  const rect = layoutBoxOf(cardEl)
  const { layer, hostRect } = createFlyingLayer(cardEl)
  const flight: Flight = {
    kind: 'book-close',
    cardEl,
    layer,
    startTime: performance.now(),
    timers: [],
    anims: []
  }
  activeFlight = flight

  // 内容舞台全屏恒等姿态（阅读器 Teleport 进来矩形一致无跳动），黑色底板
  // 同为恒等；封面克隆摆在 120° 打开姿态且沉在舞台之下（z50）——随内容
  // 缩回被逐步揭开，不浮在阅读器上
  const stage = document.createElement('div')
  stage.className = 'flying-content-stage'
  layer.appendChild(stage)
  const backdrop = document.createElement('div')
  backdrop.className = 'flying-content-backdrop'
  layer.insertBefore(backdrop, stage)
  const { wrap, clone: coverClone, banner } = createBookCoverClone(
    cardEl,
    cover,
    rect,
    hostRect,
    true
  )
  layer.appendChild(wrap)

  cover.style.visibility = 'hidden'
  const badge = cardEl.querySelector('.stamp-badge') as HTMLElement | null
  if (badge) badge.style.opacity = '0'
  cardEl.style.pointerEvents = 'none'
  cardEl.style.transition = ''
  cardEl.style.transform = ''

  flight.book = {
    cover,
    badge,
    stage,
    backdrop,
    wrap,
    coverClone,
    banner,
    coverAnim: null,
    bannerAnim: null,
    zoomStarted: true,
    zoomStartAt: performance.now(),
    fitTransform: contentStageFitTransform(rect, hostRect),
    fillBackdrop: contentBackdropTransform(rect, hostRect)
  }

  flyStageEl.value = stage

  // 等 Teleport 移入落地后的下一帧再倒放：内容缩回书位（舞台等比保比例、
  // 底板铺满书脸），保持可见直到被封面盖上
  nextTick(() =>
    requestAnimationFrame(() => {
      if (activeFlight !== flight || !flight.book) return
      const b = flight.book
      stage.style.transition = `transform ${BOOK_ZOOM}ms ${CLOSE_EASE}`
      stage.style.transform = b.fitTransform
      backdrop.style.transition = `transform ${BOOK_ZOOM}ms ${CLOSE_EASE}`
      backdrop.style.transform = b.fillBackdrop
    })
  )

  // 封面合上（与内容落位尾部略重叠）：先把封面克隆抬回舞台之上（z200，
  // 此刻内容已缩回书位、与封面不再重叠，切换无感），压着内容合上、
  // 横幅回显
  later(
    flight,
    () => {
      wrap.style.zIndex = '200'
      runAnim(
        flight,
        coverClone,
        [
          { transform: 'perspective(1200px) rotateY(-120deg)', filter: 'brightness(0.35)' },
          { transform: 'perspective(1200px) rotateY(0deg)', filter: 'brightness(1)' }
        ],
        { duration: BOOK_COVER_SWING, easing: CLOSE_EASE, fill: 'forwards' }
      )
      if (banner) {
        runAnim(flight, banner, [{ opacity: 0 }, { opacity: 1 }], {
          duration: 300,
          fill: 'forwards'
        })
      }
    },
    BOOK_ZOOM - 50
  )

  // 封面合严后清理：先卸载阅读器（仍是这部在关才卸，合严的封面盖着、
  // 卸载不可见），再归还 Teleport、拆层、恢复卡片（settleFlight 幂等）
  later(
    flight,
    () => {
      if (isStillClosing()) onClose()
      settleFlight(flight)
    },
    BOOK_CLOSE_TOTAL
  )
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
 *    垫在盘片之上翻开 120°（真实封面层级低于飞行层，直接翻会被飞行盘盖住）；
 * 2. 克隆银盘（保留银光旋转与中心孔，转速加快到 2s）固定在原位，待封面
 *    完全翻开后（600ms）卡扣式原地弹出（WAAPI：80ms 内放大到峰值，随后
 *    回弹落定）；
 * 3. 盘片中心孔放大成黑洞，吞掉整个阅读器区域（缩放按孔心到区域四角的
 *    最远距离计算，保证铺满）；
 * 4. 铺满瞬间 onArrive 打开阅读器（黑底与黑洞无缝衔接），随后恢复卡片、
 *    清理飞行层。
 * 与书本打开不同：阅读器不经 Teleport 挂入舞台，直接由黑洞切入。
 * 打断：打开途中（阅读器尚未挂载、无返回可按）再点一下盘片或封面克隆
 * 即取消——reverseDiscOpen 原地倒放合回；被其它打开/关闭顶掉则 settle
 * 立即收场（真封面走自带过渡柔和合上）。
 */
export function flyDiscOpen(cardEl: HTMLElement | undefined, onArrive: () => void) {
  if (activeFlight) settleFlight(activeFlight)
  if (!cardEl) {
    onArrive()
    return
  }
  const disc = cardEl.querySelector('.cd-disc') as HTMLElement | null
  if (!disc) {
    onArrive()
    return
  }

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
  const flight: Flight = {
    kind: 'disc-open',
    cardEl,
    layer,
    startTime: performance.now(),
    timers: [],
    anims: []
  }
  activeFlight = flight

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
    // 回流固化闭合起始姿态，否则翻开过渡不会触发（设置过渡目标前须先让
    // 起始姿态参与一次布局计算的同类坑）
    void coverClone.offsetHeight
    cover.style.visibility = 'hidden'
  }

  flight.disc = { disc, cover, clone, hole, coverClone, popAnim: null, holeAnim: null }

  // 盘片卡扣回弹：原地朝观察者放大（示例的 translateZ 透视对居中元素等效于
  // 缩放；盘片在网格里偏离透视图心，直接 translateZ 会向旁滑移，故用等效倍率）；
  // 延迟一个封面翻开的时长——盘片等封面完全打开后才起跳，期间透过透明
  // 面板可见其静卧盒中
  flight.disc.popAnim = runAnim(
    flight,
    clone,
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
  flight.disc.holeAnim = runAnim(
    flight,
    hole,
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

  // 打开途中点击盘片/封面克隆：立即取消倒放（层本身指针穿透，只有克隆
  // 区域可点，不影响网格其余部分）。阅读器尚未打开，无状态需要收尾，
  // 故 onClose 传空、isStillClosing 恒 false 跳过尾部回调
  const cancelOpen = () => {
    if (activeFlight === flight && flight.kind === 'disc-open') {
      reverseDiscOpen(flight, () => {}, () => false)
    }
  }
  clone.style.pointerEvents = 'auto'
  clone.style.cursor = 'pointer'
  clone.addEventListener('click', cancelOpen, { once: true })
  if (coverClone) {
    coverClone.style.pointerEvents = 'auto'
    coverClone.style.cursor = 'pointer'
    coverClone.addEventListener('click', cancelOpen, { once: true })
  }
  // 鼠标侧键同样取消：书本打开时阅读器 0ms 即挂载、其 window mousedown
  // 监听天然覆盖动画全程；光盘的阅读器要等黑洞铺满才挂载，这里补一个
  // 临时侧键监听对齐体验（返回手势同语义）。onArrive 前必须先摘除，
  // 否则与阅读器自己的监听在同一按键上双触发
  const onSideButton = (e: MouseEvent) => {
    if (e.button === 3 || e.button === 4) {
      e.preventDefault()
      cancelOpen()
    }
  }
  const detachSideButton = () => window.removeEventListener('mousedown', onSideButton)
  window.addEventListener('mousedown', onSideButton)
  flight.onSettle = detachSideButton

  // 封面克隆下一帧翻开（与真实封面原时机一致：0.6s 过渡由 scoped 样式提供）；
  // 克隆内的横幅同步淡出（真实侧由 disc-opening 驱动）
  requestAnimationFrame(() => {
    if (activeFlight !== flight || !coverClone) return
    coverClone.style.transform =
      'perspective(1200px) scale(0.976) rotateY(-120deg) translateZ(var(--box-thickness))'
    const banner = coverClone.querySelector('.comic-title-banner') as HTMLElement | null
    if (banner) banner.style.opacity = '0'
  })

  // 黑洞铺满后打开阅读器（黑底无缝接棒）；期间被顶掉收场则定时器不触发。
  // 侧键监听先于 onArrive 摘除，交棒给阅读器自身的返回监听
  later(
    flight,
    async () => {
      detachSideButton()
      onArrive()
      await nextTick()
      settleFlight(flight)
    },
    Math.max(DISC_OPEN_DURATION, HOLE_DELAY + HOLE_DURATION)
  )
}

/**
 * 光盘打开中途被打断（同卡关闭/点击取消）：复用原飞行层从当前姿态倒放。
 * 盘片/黑洞（WAAPI，fill:forwards）在 cancelTimeline 前定格插值矩阵：
 * 盘片以正常关闭手感缩回盒内、黑洞已实质扩张则按剩余比例收拢回盘心。
 * 封面不做定格倒放——克隆与真封面是同一帧起跑的同一条 0.6s CSS 过渡
 * （克隆可见、真身隐藏、姿态天然同步），接管瞬间摘掉 disc-opening 让
 * 真封面从当前姿态自然合上，无接缝。打开期间阅读器尚未挂载（onArrive
 * 在黑洞铺满后才触发），无需卸载；onClose 仍按 isStillClosing 约定调用
 * （点击取消路径传恒 false 跳过）。
 */
function reverseDiscOpen(f: Flight, onClose: () => void, isStillClosing: () => boolean) {
  const d = f.disc!
  const cloneMatrix = getComputedStyle(d.clone).transform
  const holeP = progressOf(d.holeAnim)
  const holeMatrix = getComputedStyle(d.hole).transform
  cancelTimeline(f)
  f.kind = 'disc-close'

  // 盘片缩回盒内（与正常关闭同手感）；尚未起跳（延迟期内）则无需缩回
  let settleDur = 0
  if (cloneMatrix !== 'none' && cloneMatrix !== 'matrix(1, 0, 0, 1, 0, 0)') {
    d.clone.style.transform = cloneMatrix
    runAnim(
      f,
      d.clone,
      [{ transform: cloneMatrix }, { transform: 'scale(1)' }],
      { duration: DISC_CLOSE_RETURN, easing: 'ease-out', fill: 'forwards' }
    )
    settleDur = DISC_CLOSE_RETURN
  }

  // 黑洞已实质扩张：定格后按剩余比例收拢；未起跑（延迟期被取消）或刚
  // 起步（≈原尺寸小孔，与盘心孔同观感）则保持原样随层清场
  if (d.holeAnim && holeP > 0.01) {
    const holeDur = clamp((1 - holeP) * HOLE_DURATION, MIN_REVERSE_MS, HOLE_DURATION)
    d.hole.style.transform = holeMatrix
    runAnim(
      f,
      d.hole,
      [{ transform: holeMatrix }, { transform: 'translate(-50%, -50%) scale(1)' }],
      { duration: holeDur, easing: HOLE_EASE_REVERSE, fill: 'forwards' }
    )
    settleDur = Math.max(settleDur, holeDur)
  }

  // 盘/洞落定后真卡接管：隐藏克隆（封面克隆此刻与真封面同姿态）、恢复
  // 真盘真封面、摘掉 disc-opening——真封面从当前姿态走自带 0.6s 过渡合上
  later(
    f,
    () => {
      d.clone.style.display = 'none'
      d.hole.style.display = 'none'
      if (d.coverClone) d.coverClone.style.display = 'none'
      d.disc.style.opacity = ''
      if (d.cover) d.cover.style.visibility = ''
      f.cardEl.classList.remove('disc-opening')
    },
    settleDur + 50
  )

  later(
    f,
    () => {
      if (isStillClosing()) onClose()
      settleFlight(f)
    },
    settleDur + 50 + DISC_CLOSE_COVER
  )
}

/**
 * 光盘关闭（打开的倒放，盒子原地不动）：
 * 起手铺满的黑洞与阅读器黑底同形（阅读器立即卸载、无缝接管），真实卡被
 * 无过渡地摆到打开态垫底；随后黑洞收拢回盘心揭开网格、克隆盘原地缩回
 * 盒内，最后移除 disc-opening 让封面绕左缘合上（自带 0.6s 过渡）。
 * 盒底与卡片全程留在原位，不参与任何缩放。
 * 打断：同卡打开中收到关闭 → reverseDiscOpen 原地倒放；同卡关闭中再关 →
 * 立即收场直接关闭；其它在飞 → 收场后走本次流程。
 */
export function flyDiscClose(
  cardEl: HTMLElement | undefined,
  onClose: () => void,
  isStillClosing: () => boolean = () => true
) {
  const prev = activeFlight
  if (prev && cardEl && prev.kind === 'disc-open' && prev.cardEl === cardEl) {
    reverseDiscOpen(prev, onClose, isStillClosing)
    return
  }
  if (prev) {
    settleFlight(prev)
    if (cardEl && prev.kind === 'disc-close' && prev.cardEl === cardEl) {
      onClose()
      return
    }
  }
  if (!cardEl) {
    onClose()
    return
  }
  const disc = cardEl.querySelector('.cd-disc') as HTMLElement | null
  if (!disc) {
    onClose()
    return
  }

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
  const flight: Flight = {
    kind: 'disc-close',
    cardEl,
    layer,
    startTime: performance.now(),
    timers: [],
    anims: []
  }
  activeFlight = flight

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
  flight.disc = {
    disc,
    cover: cardEl.querySelector('.cover-container') as HTMLElement | null,
    clone,
    hole,
    coverClone: null,
    popAnim: null,
    holeAnim: null
  }

  // 真实卡无过渡地摆到打开态（封面已翻开、露出空盒），真实盘隐藏
  const cover = flight.disc.cover
  if (cover) cover.style.transition = 'none'
  cardEl.classList.add('disc-opening')
  void cardEl.offsetHeight
  if (cover) cover.style.transition = ''
  disc.style.opacity = '0'

  // 阅读器立即卸载：铺满的黑洞黑面无缝接管。已不是这部在关则只撤场
  // （阅读器归属已变，不得经此处的 onClose 误卸载新的）
  if (!isStillClosing()) {
    settleFlight(flight)
    return
  }
  onClose()

  // 下一帧倒放：黑洞收拢回盘心，随后盘片原地缩回盒内
  nextTick(() =>
    requestAnimationFrame(() => {
      if (activeFlight !== flight) return
      runAnim(
        flight,
        hole,
        [
          { transform: `translate(-50%, -50%) scale(${maxScale})` },
          { transform: 'translate(-50%, -50%) scale(1)' }
        ],
        { duration: HOLE_DURATION, easing: HOLE_EASE_REVERSE, fill: 'forwards' }
      )
      runAnim(
        flight,
        clone,
        [
          { transform: `scale(${DISC_POP_SCALE_REST})` },
          { transform: 'scale(1)' }
        ],
        { duration: DISC_CLOSE_RETURN, delay: DISC_CLOSE_RETURN_DELAY, easing: 'ease-out', fill: 'forwards' }
      )
    })
  )

  // 盘已落回：撤克隆与黑洞（已收拢为盘心黑点，随盘一起消失，不留浮点）、
  // 恢复真实盘，移除打开态让封面合上（0.6s 过渡）；被打断则 settle 已清场
  later(
    flight,
    () => {
      clone.style.display = 'none'
      hole.style.display = 'none'
      disc.style.opacity = ''
      cardEl.classList.remove('disc-opening')
    },
    DISC_CLOSE_COVER
  )

  // 封面合上后清理（settleFlight 幂等）
  later(flight, () => settleFlight(flight), DISC_CLOSE_TOTAL)
}

/* ===== 封面取色（书脊/光盘切面共用） ===== */

/** 取色区域（0~1 比例，相对封面整图）；缺省整图 */
export interface CoverColorRegion {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 从封面图提取主色调：缩小到 64px canvas 采样（可限定 0~1 比例的采样
 * 区域——书脊取整图，光盘四切面各取对应边缘条带），过滤太暗/太亮/低饱和
 * 像素，按色相分桶取数量最多的桶的均值。跨域封面读取像素会抛错，返回
 * null 走默认色。
 */
export function extractDominantColor(
  img: HTMLImageElement,
  region?: CoverColorRegion
): { r: number; g: number; b: number } | null {
  try {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)

    // 采样窗口（像素，向内钳制防越界）
    const rx = Math.min(Math.max(region ? Math.round(region.x * size) : 0, 0), size - 1)
    const ry = Math.min(Math.max(region ? Math.round(region.y * size) : 0, 0), size - 1)
    const rw = Math.max(1, Math.min(region ? Math.round(region.w * size) : size, size - rx))
    const rh = Math.max(1, Math.min(region ? Math.round(region.h * size) : size, size - ry))

    const buckets = Array.from({ length: 360 }, () => ({ r: 0, g: 0, b: 0, count: 0 }))
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        const i = (y * size + x) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (data[i + 3] < 200) continue

        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const delta = max - min
        const v = max / 255
        const s = max === 0 ? 0 : delta / max
        if (v < 0.18 || v > 0.95 || s < 0.18) continue

        let h = 0
        if (delta !== 0) {
          if (max === r) h = 60 * (((g - b) / delta) % 6)
          else if (max === g) h = 60 * ((b - r) / delta + 2)
          else h = 60 * ((r - g) / delta + 4)
        }
        if (h < 0) h += 360

        const bucket = buckets[Math.floor(h) % 360]
        bucket.r += r
        bucket.g += g
        bucket.b += b
        bucket.count++
      }
    }

    let best: { r: number; g: number; b: number; count: number } | null = null
    for (const bucket of buckets) {
      if (bucket.count > 0 && (!best || bucket.count > best.count)) best = bucket
    }
    if (!best) return null
    return { r: best.r / best.count, g: best.g / best.count, b: best.b / best.count }
  } catch {
    // 跨域封面无法读取像素，保持默认配色
    return null
  }
}

/** 提亮增饱和：先放大亮度，再以均值为锚提升对比，让取出的颜色更鲜明 */
export function boostColor(r: number, g: number, b: number, factor = 1.15) {
  const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n)))
  let nr = r * factor
  let ng = g * factor
  let nb = b * factor
  const avg = (nr + ng + nb) / 3
  const contrast = 1.1
  nr = (nr - avg) * contrast + avg
  ng = (ng - avg) * contrast + avg
  nb = (nb - avg) * contrast + avg
  return { r: clamp(nr), g: clamp(ng), b: clamp(nb) }
}

/** 离屏加载图片（不进 DOM、命中缓存）：封面以 CSS 变量单份渲染的卡片
 *  （光盘盒，无 <img>）用它取色；加载失败返回 null */
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
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
