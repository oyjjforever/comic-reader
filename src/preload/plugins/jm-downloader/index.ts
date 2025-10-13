import { JmClient } from './jm_client.js'
import path from 'path'
const jm = new JmClient({ proxyMode: 'Custom', proxyHost: '127.0.0.1', proxyPort: 7890 }) // 或 { proxyMode: 'Custom', proxyHost: '127.0.0.1', proxyPort: 7890 }
// await jm.login('odoj', '83212789')

async function download(savePath, comicId) {

  let comic_resp_data = await jm.get_comic(comicId)

  let comic = jm.from_comic_resp_data(comic_resp_data)
  const chapter_ids = (comic.chapter_infos || [])
    .filter((c) => c.is_downloaded !== true && c.is_downloaded !== 'true' && c.is_downloaded !== 1)
    .map((c) => c.chapter_id)

  for (const chapter_id of chapter_ids) {
    const scramble_id = jm.get_scramble_id(chapter_id)
    const chapter_resp_data = await jm.get_chapter(chapter_id)
    const urls_with_block_num = jm.get_urls_with_block_num(chapter_id, scramble_id, chapter_resp_data)
    let index = 0
    for (const [url, block_num] of urls_with_block_num) {
      const [img_data, format] = await jm.get_img_data_and_format(url)
      const user_format_path = path.join(savePath, `${index++}.jpeg`)
      await jm.saveImg(user_format_path, 'jpeg', block_num, img_data, format)
    }
  }
}
export default {
  download
}