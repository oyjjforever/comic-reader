import { computed, nextTick } from 'vue'
import { useSettingStore } from '@renderer/plugins/store'

/** 界面主题：'dark' 黑橙玻璃（默认）/ 'light' 白玻璃 + 淡紫灰 */
export type UiTheme = 'dark' | 'light'

// 圆形扩散过渡：快起慢收；半径取圆心到视口最远角的距离
const REVEAL_DURATION_MS = 1000
const REVEAL_EASING = 'cubic-bezier(0.6, 0, 0, 1)'
// 按下到松开位移超过它就不算点击（是拖动），不补发
const CLICK_SLOP_PX = 8

/** 把界面主题写到 <html data-theme>：全局令牌（styles/theme.css）据此翻转 */
export function applyThemeAttribute(theme: UiTheme) {
  document.documentElement.dataset.theme = theme
}

// 最近一次切换请求的目标主题。过渡回调要等浏览器拍完旧画面才执行，在那之前 store 里
// 还是旧值——连点时若按 store 判断"下一个主题"，两次会算出同一个目标。
// 用自增序号标记请求，只有最新一次请求的回调才负责清掉它
let pendingSwitch: { id: number; theme: UiTheme } | null = null
let switchSeq = 0

export function useTheme() {
  const settingStore = useSettingStore()

  // 仅 'light' 走浅色：字段缺失或为非法值的存量库一律回落深色
  const uiTheme = computed<UiTheme>(() =>
    settingStore.setting.uiTheme === 'light' ? 'light' : 'dark'
  )
  const isLight = computed(() => uiTheme.value === 'light')

  // 整体回写并入库（setSetting），其余设置项原样带上。
  // 传 origin（视口坐标）时以它为圆心做圆形扩散过渡：View Transitions 把旧画面留作
  // 快照铺底，新画面沿不断扩张的圆形裁剪区露出。浏览器不支持、或系统开了
  // "减少动画"时不做过渡，直接切换
  function toggleTheme(origin?: { x: number; y: number }): Promise<void> {
    const current = pendingSwitch ? pendingSwitch.theme : uiTheme.value
    const next: UiTheme = current === 'light' ? 'dark' : 'light'
    const id = ++switchSeq
    pendingSwitch = { id, theme: next }
    const save = () => settingStore.setSetting({ ...settingStore.setting, uiTheme: next })
    // 等 Vue 把依赖主题的 DOM（切换按钮图标、设置页 / 搜索页的内层 provider 等）刷完；
    // 最新一次请求落地后清掉待定标记，之后再次切换以 store 为准
    const settle = async () => {
      await nextTick()
      if (pendingSwitch && pendingSwitch.id === id) pendingSwitch = null
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!origin || reduceMotion || !document.startViewTransition) {
      return save().then(settle)
    }

    const { x, y } = origin
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )
    let saved: Promise<void> = Promise.resolve()
    const transition = document.startViewTransition(async () => {
      applyThemeAttribute(next)
      // setSetting 的同步段立刻换掉 store 里的设置对象（Vue 随之刷新依赖主题的
      // DOM），数据库写入在后台进行，不让过渡等它
      saved = save()
      await settle()
    })
    let reveal: Animation | undefined
    transition.ready.then(
      () => {
        reveal = document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`
            ]
          },
          {
            duration: REVEAL_DURATION_MS,
            easing: REVEAL_EASING,
            pseudoElement: '::view-transition-new(root)'
          }
        )
      },
      // 过渡还没起跑就被打断（期间又切了一次、页面被隐藏等）：画面已是新主题，无需处理
      () => { }
    )

    // 过渡进行期间 Chromium 不对页面做命中测试（鼠标事件的目标都是 <html>），这段时间里
    // 页面点不动、滚轮也滚不动。所以做成可被打断的动画：
    // - 一有按下 / 滚轮就立刻结束过渡，让页面恢复响应；
    // - 被吃掉的这一下点击按坐标找回真正的目标补发一次（仅主键、且没怎么移动），
    //   这样切完主题紧接着点别处不会点空，连点切换按钮也能切回
    const onWheel = () => transition.skipTransition()
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      transition.skipTransition()
      const { clientX: downX, clientY: downY } = e
      // pointerup / pointercancel 只会来一个，来哪个都收尾
      const settlePress = (up: PointerEvent) => {
        document.removeEventListener('pointerup', settlePress, true)
        document.removeEventListener('pointercancel', settlePress, true)
        const { clientX, clientY } = up
        if (up.type !== 'pointerup' || up.button !== 0) return
        if (Math.hypot(clientX - downX, clientY - downY) > CLICK_SLOP_PX) return
        // 让浏览器先把这次交互自己的 mouseup / click（目标仍是 <html>）派发完，再补
        setTimeout(() => {
          const target = document.elementFromPoint(clientX, clientY)
          if (!target || target === document.documentElement || target === document.body) return
          target.dispatchEvent(
            new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX,
              clientY,
              button: 0
            })
          )
        }, 0)
      }
      document.addEventListener('pointerup', settlePress, true)
      document.addEventListener('pointercancel', settlePress, true)
    }
    document.addEventListener('wheel', onWheel, { capture: true, passive: true })
    document.addEventListener('pointerdown', onPointerDown, true)
    const stopWatching = () => {
      document.removeEventListener('wheel', onWheel, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      // 过渡被提前结束时扩散动画不会自己停（会空转到满 500ms，而新过渡复用同名伪元素）
      reveal?.cancel()
    }
    transition.finished.then(stopWatching, stopWatching)

    return transition.updateCallbackDone.then(() => saved)
  }

  return { uiTheme, isLight, toggleTheme }
}
