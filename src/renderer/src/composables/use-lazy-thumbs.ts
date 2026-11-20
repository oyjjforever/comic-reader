import { onBeforeUnmount, reactive } from 'vue'

export interface LazyThumbState {
  /** 解析出的缩略图地址（dataURL 或 file://），空串 = 无图（落占位符） */
  src: string
  loading: boolean
}

/**
 * 缩略图视口懒加载（自 thumbnail-panel 抽出的公共机制）：
 * 模板 :ref 回调登记元素，进入视口（含 rootMargin 预载带）才调用 resolve，
 * 每个 key 只解析一次，失败静默落占位符。
 *
 * 状态按 key 存放：列表过滤/局部增删不触发已有项重解析；
 * remove/clear 供条目删除与整体换源时释放状态。
 */
export function useLazyThumbs<Item>(options: {
  getKey: (item: Item) => string
  resolve: (item: Item) => Promise<string>
  observerInit?: IntersectionObserverInit
}) {
  const states = reactive<Record<string, LazyThumbState & { tried: boolean }>>({})
  const elItems = new Map<Element, Item>()
  let observer: IntersectionObserver | null = null

  const stateOf = (item: Item) => {
    const key = options.getKey(item)
    let s = states[key]
    if (!s) {
      s = { src: '', loading: false, tried: false }
      states[key] = s
    }
    return s
  }

  const ensureObserver = () => {
    if (observer) return
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const el = entry.target
          observer?.unobserve(el)
          const item = elItems.get(el)
          elItems.delete(el)
          if (!item) continue
          const s = stateOf(item)
          if (s.tried) continue
          s.tried = true
          s.loading = true
          options
            .resolve(item)
            .then(
              (src) => {
                s.src = src || ''
              },
              () => {
                s.src = ''
              }
            )
            .finally(() => {
              s.loading = false
            })
        }
      },
      options.observerInit ?? { rootMargin: '200px', threshold: 0.05 }
    )
  }

  /** 模板 :ref 回调：元素挂载/换绑时登记，与数据项一一对应 */
  const register = (el: unknown, item: Item) => {
    if (!(el instanceof HTMLElement)) return
    ensureObserver()
    elItems.set(el, item)
    observer!.observe(el)
  }

  /** 删除单条：丢弃状态，条目重新出现时会重新解析 */
  const remove = (item: Item) => {
    delete states[options.getKey(item)]
  }

  /** 清扫已脱离 DOM 的登记元素：IntersectionObserver 对 target 是强引用，
   * 列表过滤/重排卸载的单元格不扫掉会滞留到组件卸载 */
  const sweep = () => {
    if (!observer) return
    for (const el of elItems.keys()) {
      if (!el.isConnected) {
        observer.unobserve(el)
        elItems.delete(el)
      }
    }
  }

  /** 只保留传入 key 的状态（列表删除条目后丢弃其缩略图缓存） */
  const prune = (keep: Iterable<string>) => {
    const set = keep instanceof Set ? keep : new Set(keep)
    for (const key of Object.keys(states)) {
      if (!set.has(key)) delete states[key]
    }
  }

  /** 整体换源（如切换作品）：清空全部状态与观察关系 */
  const clear = () => {
    for (const key of Object.keys(states)) delete states[key]
    observer?.disconnect()
    elItems.clear()
  }

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return { stateOf, register, remove, sweep, prune, clear }
}
