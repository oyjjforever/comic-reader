// 站点白名单（部署配置）：主进程读取打包资源里的 resources/config/site-whitelist.json。
// siteWhitelist 为 null=未加载 / []=不限制；限制时白名单外的站点从站点菜单与
// 设置页「站点显示」中移除（用户无法再打开）
import { ref } from 'vue'

export const siteWhitelist = ref(null)

/** 站点是否可用（未加载/不限制时恒 true） */
export function isSiteAllowed(key) {
  const list = siteWhitelist.value
  return !list || list.length === 0 || list.includes(key)
}

/** 幂等加载：layout 挂载时调用一次，设置页等后开的面板自带兜底。
 *  失败不立即定格为「不限制」——短暂退避重试，避免瞬时异常（如 invoke 早于
 *  handler 就绪）被误当成无限制配置；重试耗尽才回退不限制 */
export async function loadSiteWhitelist() {
  if (siteWhitelist.value !== null) return
  for (let attempt = 1; ; attempt++) {
    try {
      siteWhitelist.value = await window.systemInterface.getSiteWhitelist()
      return
    } catch (e) {
      if (attempt >= 3) {
        console.warn('读取站点白名单失败（已重试），按不限制处理:', e)
        siteWhitelist.value = []
        return
      }
      await new Promise((r) => setTimeout(r, 500 * attempt))
    }
  }
}
