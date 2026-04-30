import { WnacgClient } from './wnacg_client.js'

const wnacg = new WnacgClient({ proxyMode: 'Custom', proxyHost: '127.0.0.1', proxyPort: 7890 })

async function search(keyword, page) {
  return await wnacg.searchByKeyword(keyword, page)
}

async function searchByTag(tagName, page) {
  return await wnacg.searchByTag(tagName, page)
}

async function getComicInfo(comicId) {
  const comic = await wnacg.getComic(comicId)
  comic.author = 'picaman'
  // 将 imgList 转换为图片 URL 列表
  comic.imgList = comic.imgList
    .filter((img) => !img.url.includes('shoucang.jpg'))
    .map((img, idx) => {
      const url = img.url.startsWith('//') ? `https:${img.url}` : img.url
      return {
        index: idx + 1,
        caption: img.caption || `${String(idx + 1).padStart(3, '0')}`,
        url
      }
    })
  return comic
}

async function getChapterImages(comicId) {
  try {
    const comic = await getComicInfo(comicId)
    return comic.imgList.map((img) => [img.url, 0])
  } catch (error) {
    console.log(error)
    return []
  }
}

async function getImage(url) {
  const [imgData] = await wnacg.getImgDataAndFormat(url)
  const blob = new Blob([imgData])
  const coverUrl = URL.createObjectURL(blob)
  return coverUrl
}

async function downloadImage(savePath, url) {
  const { default: fsp } = await import('fs/promises')
  const { default: path } = await import('path')
  const { default: fs } = await import('fs')

  const folderPath = path.dirname(savePath)
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true })
  }

  const [imgData] = await wnacg.getImgDataAndFormat(url)
  await fsp.writeFile(savePath, imgData)
}

async function login(username, password) {
  const cookie = await wnacg.login(username, password)
  return cookie
}

async function getUserProfile() {
  return await wnacg.getUserProfile()
}

async function getShelf(shelfId, page) {
  return await wnacg.getShelf(shelfId, page)
}

export default {
  search,
  searchByTag,
  getComicInfo,
  getChapterImages,
  downloadImage,
  getImage,
  login,
  getUserProfile,
  getShelf
}
