import { useSettingStore, pinia } from '@renderer/plugins/store'
import PixivUtil from './pixiv.js'
import TwitterUtil from './twitter.js'
import WeiboUtil from './weibo.js'
import JmttUtil from './jmtt.js'
import jmttImg from '@renderer/assets/jmtt.jpg'
import pixivImg from '@renderer/assets/pixiv.jpg'
import twitterImg from '@renderer/assets/twitter.jpg'
import weiboImg from '@renderer/assets/weibo.ico'

const settingStore = useSettingStore(pinia)

// 站点配置映射，以站点类型为键
const sites = {
  pixiv: {
    util: PixivUtil,
    icon: pixivImg,
    downloadPathSetting: 'downloadPathPixiv'
  },
  twitter: {
    util: TwitterUtil,
    icon: twitterImg,
    downloadPathSetting: 'downloadPathTwitter'
  },
  weibo: {
    util: WeiboUtil,
    icon: weiboImg,
    downloadPathSetting: 'downloadPathWeibo'
  },
  jmtt: {
    util: JmttUtil,
    icon: jmttImg,
    downloadPathSetting: 'downloadPathJmtt'
  }
}

/**
 * 获取指定站点的工具函数
 * @param {string} site - 站点名称 (pixiv, twitter, weibo, jmtt)
 * @returns {Object} 站点工具对象
 */
function getSiteUtil(site) {
  return sites[site]?.util
}

/**
 * 获取站点图标
 * @param {string} site - 站点名称
 * @returns {string} 图标URL
 */
function getSiteIcon(site) {
  return sites[site]?.icon
}

/**
 * 获取指定站点的下载路径
 * @param {string} site - 站点名称
 * @returns {string} 下载路径
 */
function getDownloadPath(site) {
  try {
    const settingKey = sites[site]?.downloadPathSetting
    return settingStore.setting?.[settingKey] || settingStore.setting?.defaultDownloadPath
  } catch (error) {
    console.error('获取下载路径失败:', error)
    return settingStore.setting?.defaultDownloadPath
  }
}

/**
 * 获取作者的所有作品
 * @param {string} site - 站点名称
 * @param {string} authorId - 作者ID
 * @returns {Promise<Array>} 作品ID数组
 */
async function fetchArtworks(site, authorId) {
  try {
    const util = getSiteUtil(site)
    if (util && util.fetchArtworks) {
      return await util.fetchArtworks(authorId)
    }
    return null
  } catch (error) {
    console.error('获取作品列表失败:', error)
    return []
  }
}

/**
 * 分页获取作者的作品图片
 * @param {string} site - 站点名称
 * @param {string} authorName - 作者名称
 * @param {string} authorId - 作者ID
 * @param {Object} grid - 网格对象，包含allRows
 * @param {Object} page - 分页对象，包含index和size
 * @returns {Promise<Array>} 作品对象数组
 */
async function pagingImage(site, authorName, authorId, grid, page) {
  try {
    const util = getSiteUtil(site)
    return await util.pagingImage(authorName, authorId, grid, page)
    return []
  } catch (error) {
    console.error('分页获取图片失败:', error)
    return []
  }
}

/**
 * 预览图片
 * @param {string} site - 站点名称
 * @param {string|Array} url - 图片URL或URL数组
 * @returns {Promise<string>} Blob URL
 */
async function previewImage(site, url) {
  try {
    const util = getSiteUtil(site)
    return await util.previewImage(url)
  } catch (error) {
    console.error('预览图片失败:', error)
    return null
  }
}

/**
 * 检查作者是否有新作品
 * @param {string} site - 站点名称
 * @param {string} authorName - 作者名称
 * @param {string} authorId - 作者ID
 * @returns {Promise<boolean>} 如果有新作品返回true
 */
async function hasNewArtwork(site, authorName, authorId) {
  try {
    const util = getSiteUtil(site)
    return await util.hasNewArtwork(authorName, authorId)
  } catch (error) {
    console.error('检查新作品失败:', error)
    return false
  }
}

/**
 * 检查作品是否已本地下载
 * @param {string} site - 站点名称
 * @param {string} authorName - 作者名称
 * @param {string} workName - 作品名称
 * @returns {boolean} 如果已下载返回true
 */
function isLocalDownloaded(site, authorName, workName) {
  try {
    const util = getSiteUtil(site)
    return util.isLocalDownloaded(authorName, workName)
  } catch (error) {
    console.error('检查本地下载状态失败:', error)
    return false
  }
}

/**
 * 下载单个作品
 * @param {string} site - 站点名称
 * @param {Object} row - 作品行对象
 * @param {Object} item - 作者对象
 */
async function downloadArtwork(site, row, item) {
  try {
    const util = getSiteUtil(site)
    const downloadMethods = {
      pixiv: () => util.downloadArtwork(row.artworkId),
      twitter: () => util.downloadImage(item.authorName, item.authorId, row.title, row.url),
      jmtt: () => util.downloadArtwork(item.authorName, row.artworkId),
      weibo: () => util.downloadImage(item.authorName, item.authorId, row.title, row.url)
    }

    const downloadMethod = downloadMethods[site]
    if (downloadMethod) {
      await downloadMethod()
    }
  } catch (error) {
    console.error('下载作品失败:', error)
  }
}

/**
 * 下载作者的所有作品
 * @param {string} site - 站点名称
 * @param {Object} item - 作者对象
 */
async function downloadAll(site, item) {
  try {
    const util = getSiteUtil(site)
    await util.downloadAllMedia(item.authorName, item.authorId)
  } catch (error) {
    console.error('下载全部作品失败:', error)
  }
}

/**
 * 直接获取站点工具对象
 * @param {string} site - 站点名称
 * @returns {Object} 站点工具对象
 */
function getUtil(site) {
  return sites[site]?.util
}

export default {
  getSiteUtil,
  getSiteIcon,
  getDownloadPath,
  getUtil,
  fetchArtworks,
  pagingImage,
  previewImage,
  hasNewArtwork,
  isLocalDownloaded,
  downloadArtwork,
  downloadAll
}
