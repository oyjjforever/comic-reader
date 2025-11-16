import { JmClient } from './jm_client.js'

const jm = new JmClient({ proxyMode: 'Custom', proxyHost: '127.0.0.1', proxyPort: 7890 }) // 或 { proxyMode: 'Custom', proxyHost: '127.0.0.1', proxyPort: 7890 }
// await jm.login('odoj', '83212789')

async function getComicsByAuthor(author) {
  const comics = await jm.search(author, 1, 'hot', 2)
  return comics
}
async function getComicInfo(comicId) {
  const comic_resp_data = await jm.get_comic(comicId)
  const comic = jm.from_comic_resp_data(comic_resp_data)
  comic.chapter_infos = comic.chapter_infos.map((c, idx) => ({
    index: idx + 1,
    id: c.chapter_id,
    name: c.name || c.title || `第${idx + 1}章`,
    is_downloaded: c.is_downloaded
  }))
  return comic
}
async function getChapterImages(chapter_id) {
  try {
    const scramble_id = jm.get_scramble_id(chapter_id)
    const chapter_resp_data = await jm.get_chapter(chapter_id)
    const urls_with_block_num = jm.get_urls_with_block_num(chapter_id, scramble_id, chapter_resp_data)
    return urls_with_block_num
  } catch (error) {
    console.log(error)
    return []
  }

}
async function getImage([url, block_num]) {
  const [img_data] = await jm.get_img_data_and_format(url)
  const res = await jm.decodeImage('webp', block_num, img_data)
  let imageStream = Buffer.from(res)
  const blob = new Blob([imageStream])
  const coverUrl = URL.createObjectURL(blob)
  return coverUrl
}
async function downloadImage(savePath, [url, block_num]) {
  const [img_data, format] = await jm.get_img_data_and_format(url)
  await jm.saveImg(savePath, savePath.split('.').pop(), block_num, img_data, format)
}

// async function download(savePath, comicId) {
//   const comic_resp_data = await jm.get_comic(comicId)
//   const comic = jm.from_comic_resp_data(comic_resp_data)
//   const chapter_ids = (comic.chapter_infos || [])
//     .filter((c) => c.is_downloaded !== true && c.is_downloaded !== 'true' && c.is_downloaded !== 1)
//     .map((c) => c.chapter_id)

//   let i = 1
//   for (const chapter_id of chapter_ids) {
//     const capter_name = path.join(savePath, `第${i++}章`)
//     if (fs.existsSync(capter_name)) continue
//     fs.mkdirSync(capter_name, { recursive: true })

//     const scramble_id = jm.get_scramble_id(chapter_id)
//     const chapter_resp_data = await jm.get_chapter(chapter_id)
//     const urls_with_block_num = jm.get_urls_with_block_num(
//       chapter_id,
//       scramble_id,
//       chapter_resp_data
//     )
//     let index = 0
//     for (const [url, block_num] of urls_with_block_num) {
//       const [img_data, format] = await jm.get_img_data_and_format(url)
//       const user_format_path = path.join(capter_name, `${index++}.jpeg`)
//       await saveImgInMain(user_format_path, 'jpeg', block_num, img_data, format)
//     }
//   }
// }

export default {
  // download,
  getComicsByAuthor,
  getComicInfo,
  getChapterImages,
  downloadImage,
  getImage
}
