import { app, BrowserWindow, screen } from 'electron'
import type { Display, Rectangle } from 'electron'

/**
 * 多开窗口宫格平铺（按屏独立）：
 * - 触发时所有屏同时各自宫格：每块屏只排自己屏上的窗口，互不影响；
 *   每块屏各自维护平铺/还原状态
 * - 横屏：列数 = ceil(sqrt(n))；竖屏：竖排优先，每列最多 3 行（列数 = ceil(n/3)），
 *   2 窗即上下叠，与横屏的左右并排互补
 * - 每行窗口均分整行宽度（末行拉通铺满，不留空格）；窗口间无边距，无缝铺满工作区
 * - 平铺基准为该屏工作区（workArea，已扣除任务栏）
 * - 窗口构造时写死的 minWidth/minHeight（1024×720）会顶住小格位，
 *   进入宫格时临时放宽到格位尺寸，还原时恢复原值
 * - 平铺/还原带 ~260ms 缓动（Windows 无原生窗口位移动画，定时器步进实现）
 * - 再按一次触发键：所有屏都已宫格且无人动过 → 全部还原原位，否则平铺/重排变动的屏
 * - 跨屏移动自动重排：窗口被拖到另一块屏后，离开的屏（若宫格中）收缩补位；
 *   自动宫格开启时保持所有屏宫格态，未开启时到达屏仅在宫格中才吸收新窗
 */

interface TileSnapshot {
  bounds: Rectangle
  minSize: [number, number]
}

/** 每块屏独立的宫格状态（还原与偏离检测都以屏为单位） */
interface DisplayTileState {
  tiled: boolean
  snapshots: Map<BrowserWindow, TileSnapshot>
  lastCells: Map<BrowserWindow, Rectangle>
}

const ANIM_DURATION = 260
// 判定「布局被手动改动」的误差容限（px）
const DEVIATION_TOLERANCE = 8
// 竖屏每列最多行数（竖排优先）
const PORTRAIT_MAX_ROWS = 3

let autoTile = false
let suspended = false
const animTimers = new WeakMap<BrowserWindow, ReturnType<typeof setInterval>>()
const displayStates = new Map<number, DisplayTileState>()

export interface GridTileResult {
  tiled: boolean
  windowCount: number
  rows?: number
  cols?: number
}

function isTileable(w: BrowserWindow): boolean {
  if (w.isDestroyed()) return false
  // 置顶辅助窗（剪贴板弹窗）不参与
  if (w.isAlwaysOnTop()) return false
  // 隐藏到托盘的窗口不参与（最小化的算参与，平铺前会还原）
  if (!w.isVisible() && !w.isMinimized()) return false
  try {
    // 分离式 DevTools 窗口不参与
    if (w.webContents.getURL().startsWith('devtools://')) return false
  } catch {
    /* ignore */
  }
  return true
}

function tileableWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter(isTileable)
}

function stateFor(displayId: number): DisplayTileState {
  let state = displayStates.get(displayId)
  if (!state) {
    state = { tiled: false, snapshots: new Map(), lastCells: new Map() }
    displayStates.set(displayId, state)
  }
  return state
}

function pruneDestroyed(state: DisplayTileState): void {
  for (const w of state.snapshots.keys()) {
    if (w.isDestroyed()) state.snapshots.delete(w)
  }
  for (const w of state.lastCells.keys()) {
    if (w.isDestroyed()) state.lastCells.delete(w)
  }
}

function windowsOnDisplay(displayId: number): BrowserWindow[] {
  return tileableWindows().filter(
    (w) => screen.getDisplayMatching(w.getBounds()).id === displayId
  )
}

function cancelAnim(win: BrowserWindow): void {
  const timer = animTimers.get(win)
  if (timer) {
    clearInterval(timer)
    animTimers.delete(win)
  }
}

function animateBounds(win: BrowserWindow, target: Rectangle, duration = ANIM_DURATION): void {
  cancelAnim(win)
  if (win.isDestroyed()) return
  if (duration <= 0) {
    win.setBounds(target)
    return
  }
  const from = win.getBounds()
  const start = Date.now()
  const timer = setInterval(() => {
    if (win.isDestroyed()) {
      cancelAnim(win)
      return
    }
    const p = Math.min(1, (Date.now() - start) / duration)
    const e = 1 - Math.pow(1 - p, 3)
    win.setBounds({
      x: Math.round(from.x + (target.x - from.x) * e),
      y: Math.round(from.y + (target.y - from.y) * e),
      width: Math.round(from.width + (target.width - from.width) * e),
      height: Math.round(from.height + (target.height - from.height) * e)
    })
    if (p >= 1) cancelAnim(win)
  }, 16)
  animTimers.set(win, timer)
}

/** 退出最大化/全屏/最小化等特殊状态（否则 setBounds 不生效或不还原） */
function normalizeWindowState(win: BrowserWindow): void {
  if (win.isFullScreen()) win.setFullScreen(false)
  if (win.isMinimized()) win.restore()
  if (win.isMaximized()) win.unmaximize()
}

/** 横屏列数 = ceil(sqrt(n))；竖屏竖排优先，每列最多 PORTRAIT_MAX_ROWS 行 */
function chooseGrid(n: number, area: Rectangle): [cols: number, rows: number] {
  const portrait = area.height >= area.width
  const cols = portrait ? Math.ceil(n / PORTRAIT_MAX_ROWS) : Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  return [cols, rows]
}

/**
 * 行数固定、每行窗口均分整行宽度（末行拉通铺满）。
 * 窗口间无边距：行高/列宽的取整余量逐格 +1 均摊，格位首尾相接无缝铺满工作区
 */
function cellRects(n: number, cols: number, rows: number, area: Rectangle): Rectangle[] {
  const out: Rectangle[] = []
  const rowBase = Math.floor(area.height / rows)
  const rowRem = area.height % rows
  let y = area.y
  let placed = 0
  for (let r = 0; r < rows; r++) {
    const k = Math.min(cols, n - placed)
    if (k <= 0) break
    const rowH = rowBase + (r < rowRem ? 1 : 0)
    const cellBase = Math.floor(area.width / k)
    const cellRem = area.width % k
    let x = area.x
    for (let c = 0; c < k; c++) {
      const cellW = cellBase + (c < cellRem ? 1 : 0)
      out.push({ x, y, width: cellW, height: rowH })
      x += cellW
      placed++
    }
    y += rowH
  }
  return out
}

/** 平铺后该屏是否有窗口被拖动/缩放，或参与窗口数量变化 */
function isDeviated(state: DisplayTileState, wins: BrowserWindow[]): boolean {
  if (!state.tiled || state.lastCells.size === 0) return true
  if (wins.length !== state.lastCells.size) return true
  for (const w of wins) {
    const cell = state.lastCells.get(w)
    if (!cell) return true
    const b = w.getBounds()
    if (
      Math.abs(b.x - cell.x) > DEVIATION_TOLERANCE ||
      Math.abs(b.y - cell.y) > DEVIATION_TOLERANCE ||
      Math.abs(b.width - cell.width) > DEVIATION_TOLERANCE ||
      Math.abs(b.height - cell.height) > DEVIATION_TOLERANCE
    ) {
      return true
    }
  }
  return false
}

function tileDisplay(display: Display): GridTileResult {
  const wins = windowsOnDisplay(display.id)
  if (wins.length === 0) return { tiled: false, windowCount: 0 }

  const state = stateFor(display.id)
  // 快照仅在首次进入宫格时记录，宫格中的重排/自动重排不覆盖，
  // 保证「还原」始终回到进宫格前的位置
  if (!state.tiled) {
    state.snapshots.clear()
    for (const w of wins) {
      const m = w.getMinimumSize()
      state.snapshots.set(w, {
        bounds: w.getNormalBounds(),
        minSize: [m[0] || 0, m[1] || 0]
      })
    }
  } else {
    pruneDestroyed(state)
  }

  const area = display.workArea
  const [cols, rows] = chooseGrid(wins.length, area)
  const rects = cellRects(wins.length, cols, rows, area)

  state.lastCells.clear()
  wins.forEach((w, i) => {
    const cell = rects[i]
    state.lastCells.set(w, cell)
    normalizeWindowState(w)
    // 最小尺寸临时放宽到格位大小（还原时恢复快照值）
    const origMin = state.snapshots.get(w)?.minSize ?? [0, 0]
    w.setMinimumSize(Math.min(origMin[0], cell.width), Math.min(origMin[1], cell.height))
    animateBounds(w, cell)
  })

  state.tiled = true
  return { tiled: true, windowCount: wins.length, rows, cols }
}

function restoreDisplay(display: Display): GridTileResult {
  const state = displayStates.get(display.id)
  const count = windowsOnDisplay(display.id).length
  if (!state || !state.tiled) {
    return { tiled: false, windowCount: count }
  }
  for (const [w, snap] of state.snapshots) {
    if (w.isDestroyed()) continue
    cancelAnim(w)
    normalizeWindowState(w)
    const [mw, mh] = snap.minSize
    w.setMinimumSize(mw, mh)
    animateBounds(w, snap.bounds)
  }
  state.snapshots.clear()
  state.lastCells.clear()
  state.tiled = false
  return { tiled: false, windowCount: count }
}

function displaysWithWindows(): Display[] {
  return screen.getAllDisplays().filter((d) => windowsOnDisplay(d.id).length > 0)
}

/**
 * 全局平铺：所有有窗口的屏各自宫格。
 * 已宫格且布局未变的屏原地不动，未宫格或已偏离的屏（重新）平铺
 */
function ensureAllDisplaysTiled(): GridTileResult {
  let windowCount = 0
  for (const display of displaysWithWindows()) {
    const wins = windowsOnDisplay(display.id)
    windowCount += wins.length
    const state = displayStates.get(display.id)
    if (!state?.tiled || isDeviated(state, wins)) tileDisplay(display)
  }
  return { tiled: true, windowCount }
}

/** 全局还原：所有处于宫格态的屏整体还原原位（未宫格的屏不动） */
function restoreAllDisplays(): GridTileResult {
  let windowCount = 0
  for (const display of displaysWithWindows()) {
    const state = displayStates.get(display.id)
    if (state?.tiled) {
      windowCount += windowsOnDisplay(display.id).length
      restoreDisplay(display)
    }
  }
  return { tiled: false, windowCount }
}

/**
 * 触发键语义（全局）：所有有窗口的屏都已宫格且布局未被动过 → 全部还原；
 * 有屏未宫格或布局被拖动/增删过 → 平铺/重排这些屏
 */
export function toggleWindowGrid(): GridTileResult {
  const displays = displaysWithWindows()
  if (displays.length === 0) return { tiled: false, windowCount: 0 }
  let needsTile = false
  let anyTiled = false
  for (const display of displays) {
    const state = displayStates.get(display.id)
    if (state?.tiled) {
      anyTiled = true
      if (isDeviated(state, windowsOnDisplay(display.id))) needsTile = true
    } else {
      needsTile = true
    }
  }
  if (anyTiled && !needsTile) return restoreAllDisplays()
  return ensureAllDisplaysTiled()
}

export function setAutoTileWindows(enabled: boolean): void {
  autoTile = enabled
}

/** 自动宫格：窗口增删/跨屏后，保持所有有窗口的屏处于宫格态（已就位的屏原地不动） */
export function ensureGridIfAuto(): void {
  if (!autoTile || suspended) return
  ensureAllDisplaysTiled()
}

/** 重排所有处于宫格态且布局已变化的屏（自动宫格关闭时的跨屏收缩/吸收路径） */
function retileTiledDisplays(): void {
  if (suspended) return
  const displays = screen.getAllDisplays()
  for (const [displayId, state] of displayStates) {
    if (!state.tiled) continue
    const display = displays.find((d) => d.id === displayId)
    if (!display) {
      displayStates.delete(displayId)
      continue
    }
    const wins = windowsOnDisplay(displayId)
    if (wins.length === 0) {
      state.snapshots.clear()
      state.lastCells.clear()
      state.tiled = false
      continue
    }
    if (isDeviated(state, wins)) tileDisplay(display)
  }
}

// ===== 跨屏移动自动重排 =====
// 记录每窗最近所在屏；moved 事件（移动结束才触发，程序化 setBounds 也会触发，
// 但同屏移动不产生屏变化、动画中的位移同理，均为空操作）防抖后比对屏 id，
// 变化了才重排：自动宫格开启时保持所有屏宫格态；
// 未开启时只重排处于宫格态的屏——离开的屏补位收缩，到达的宫格屏吸收新窗
const lastDisplayIds = new WeakMap<BrowserWindow, number>()
const movedDebounces = new WeakMap<BrowserWindow, ReturnType<typeof setTimeout>>()

function onWindowMoved(win: BrowserWindow): void {
  const existing = movedDebounces.get(win)
  if (existing) clearTimeout(existing)
  movedDebounces.set(
    win,
    setTimeout(() => {
      movedDebounces.delete(win)
      if (win.isDestroyed()) return
      const display = screen.getDisplayMatching(win.getBounds())
      const prev = lastDisplayIds.get(win)
      lastDisplayIds.set(win, display.id)
      if (prev == null || prev === display.id) return
      if (autoTile) {
        // 自动宫格开启：保持所有屏宫格态（到达屏入格、离开屏收缩一并完成）
        ensureAllDisplaysTiled()
      } else {
        // 未开启：只重排宫格态的屏——离开的屏收缩补位，到达的宫格屏吸收新窗
        retileTiledDisplays()
      }
    }, 200)
  )
}

/** 退出流程中挂起（before-quit 调用），避免逐窗关闭时剩余窗口被重排抖动 */
export function suspendWindowTiler(): void {
  suspended = true
}

/**
 * 监听窗口增删与跨屏移动：app 级挂一次（须在首个窗口创建前调用，主窗口才能被监听到），
 * 逐窗附加 moved/closed/hide 钩子。
 * closed/hide 的重排对非参与窗（弹窗等）是无害空操作（位置已等于格位）
 */
export function initWindowTiler(): void {
  app.on('browser-window-created', (_event, win) => {
    lastDisplayIds.set(win, screen.getDisplayMatching(win.getBounds()).id)
    win.on('moved', () => onWindowMoved(win))
    win.on('closed', () => ensureGridIfAuto())
    win.on('hide', () => ensureGridIfAuto())
  })
}
