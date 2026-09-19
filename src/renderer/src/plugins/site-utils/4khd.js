import { queue } from '@renderer/plugins/store/downloadQueue'
import { useSettingStore, pinia } from '@renderer/plugins/store'
import { getDefaultDownloadPath } from '@renderer/plugins/site-utils/utils.js'
const settingStore = useSettingStore(pinia)
const { file } = window

const SITE = '4khd'

/**
 * 获取作品列表（分页）
 * @param {number} page
 * @returns {Promise<{list:Array, hasMore:boolean}>}
 */
async function fetchList(page = 1) {
  return await window.fourkhd.fetchList(page)
}

/**
 * 获取作品详情（第 1 页图片 + 相册总页数）
 * @param {string} url 详情页地址
 * @param {string} [fallbackTitle] 列表页标题，详情页标题解析失败时兜底
 */
async function fetchDetail(url, fallbackTitle) {
  return await window.fourkhd.fetchDetail(url, fallbackTitle)
}

/**
 * 获取详情页相册指定分页的图片（滚动增量加载用）
 * @param {string} url 详情页地址
 * @param {number} page 页码
 */
async function fetchDetailPage(url, page) {
  return await window.fourkhd.fetchDetailPage(url, page)
}

/**
 * 添加下载任务到队列
 * 目录直接使用原始作品名（对齐站点显示的名称），不套 4khd 默认目录
 * 只加载了部分分页时，任务执行时会自动补齐剩余分页
 * @param {Object} detail fetchDetail 返回对象（含增量加载的 images）
 */
async function downloadWork(detail) {
  // 优先使用 4khd 专属下载路径，未设置时回退默认下载路径
  const baseDir = await getDefaultDownloadPath('downloadPath4khd')
  const title = String(detail?.title || 'untitled')
  queue.addTask({
    site: SITE,
    title,
    type: 'book',
    payload: {
      images: detail?.images || [],
      url: detail?.url || '',
      maxPage: detail?.maxPage || 1,
      pagesLoaded: detail?.pagesLoaded || 1,
      title,
      baseDir
    }
  })
}

/**
 * 获取作品名的本地目录名（压缩空白 + 仅剔除文件系统非法字符）
 * 与 preload parseDetailHtml 的 clean() 规则保持一致，保证两侧目录名一致
 * @param {string} workTitle
 * @returns {string}
 */
function getWorkDirName(workTitle) {
  return file.simpleSanitize(String(workTitle || 'untitled').replace(/\s+/g, ' ').trim())
}

/**
 * 获取作品的本地下载目录
 * @param {string} workTitle
 * @returns {string}
 */
function getDownloadDir(workTitle) {
  const downloadPath = settingStore.setting?.downloadPath4khd || settingStore.setting?.defaultDownloadPath
  return `${downloadPath}\\${getWorkDirName(workTitle)}`
}

/**
 * 检查作品是否已本地下载
 * @param {string} workTitle
 * @returns {boolean}
 */
function isLocalDownloaded(workTitle) {
  try {
    const dir = getDownloadDir(workTitle)
    return !!dir && file.pathExists(dir)
  } catch (e) {
    console.error('检查本地下载状态失败:', e)
    return false
  }
}

export default {
  SITE,
  fetchList,
  fetchDetail,
  fetchDetailPage,
  downloadWork,
  isLocalDownloaded,
  getDownloadDir,
  getWorkDirName
}
