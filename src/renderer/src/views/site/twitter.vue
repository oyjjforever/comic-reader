<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, defineExpose } from 'vue'
import { useMessage } from 'naive-ui'
import { useSettingStore } from '@renderer/plugins/store'
const message = useMessage()
const settingStore = useSettingStore()
let msgReactive: any = null
function showPageProgress(current: number, total: number) {
  if (msgReactive) msgReactive.content = `下载进度：${current} / ${total}`
}
const CONCURRENCY = 4
async function runPool<T>(
  items: T[],
  worker: (item: T, idx: number) => Promise<any>,
  limit = CONCURRENCY
) {
  return new Promise((resolve) => {
    const results: any[] = new Array(items.length)
    let i = 0
    let active = 0
    function next() {
      while (active < limit && i < items.length) {
        const idx = i++
        active++
        Promise.resolve(worker(items[idx], idx))
          .then((val) => {
            results[idx] = val
          })
          .catch((err) => {
            results[idx] = err
          })
          .finally(() => {
            active--
            if (i === items.length && active === 0) resolve(results)
            else next()
          })
      }
    }
    next()
  })
}
const { ipcRenderer } = (window as any).electron || require('electron')

const url = ref('https://x.com/')
const webviewRef = ref<any>(null)
const canDownload = ref(false)
function updateCanDownload() {
  try {
    const wv = webviewRef.value
    if (!wv) return
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    canDownload.value = !!currentUrl && currentUrl.includes('media')
  } catch {
    canDownload.value = false
  }
}
function extractMediaUrlsDeep(data: unknown): string[] {
  const urls: string[] = []
  const stack: any[] = [data]

  while (stack.length) {
    const cur = stack.pop()
    if (cur == null) continue

    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item)
    } else if (typeof cur === 'object') {
      for (const [key, val] of Object.entries(cur)) {
        if (key === 'media_url_https' && typeof val === 'string') {
          urls.push(val)
        }
        stack.push(val)
      }
    }
  }

  // 去重
  return Array.from(new Set(urls))
}
/**
 * 从与 temp.json 同结构的对象中提取所有 cursorType === "Bottom" 的 value 值
 * @param root 任意对象（如 JSON.parse(temp.json) 的结果）
 * @returns 去重后的 value 列表
 */
function extractBottomCursorValues(root: unknown): string {
  const out: string[] = []
  const stack: any[] = [root]

  while (stack.length) {
    const cur = stack.pop()
    if (cur == null) continue

    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item)
    } else if (typeof cur === 'object') {
      // 命中条件：存在 "cursorType": "Bottom" 且有字符串类型的 "value"
      if ((cur as any).cursorType === 'Bottom' && typeof (cur as any).value === 'string') {
        out.push((cur as any).value as string)
      }
      // 继续遍历所有属性
      for (const val of Object.values(cur)) {
        stack.push(val)
      }
    }
  }

  // 去重
  return Array.from(new Set(out))[0]
}
function getScreenNameFromUrl(url: string = location.href): string | null {
  try {
    const wv = webviewRef.value
    if (!wv) {
      message.error('webview 未准备好')
      return
    }
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    const u = new URL(currentUrl)
    // 形如 https://x.com/<screen_name>/media
    const parts = u.pathname.split('/').filter(Boolean)
    // parts[0] 是 screen_name；当第二段是 'media' 时有效
    if (parts.length >= 1) return parts[0]
    return null
  } catch {
    return null
  }
}
async function buildHeader() {
  const wv = webviewRef.value
  if (!wv) throw new Error('webview 未准备好')
  const cookies = await wv.executeJavaScript(`(async () => {
    try {
      return document.cookie || '';
    } catch (e) {
      return '';
    }
  })()`)
  const ct0 = (cookies.match(/ct0=([^;]+)/) || [])[1] || ''
  const header = {
    Authorization:
      'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    'x-twitter-active-user': 'yes',
    'X-Twitter-Auth-Type': 'OAuth2Session',
    'x-csrf-token': ct0,
    'X-Client-Transaction-Id':
      '+ifp8By2H0O/DBmRL0XFg6lCxu5mSkrP7aho/uYrEu86JgnS3p/d+BdcIjkq7yI+jWGzb/5ZExMMlI86jfQYjP0tFW6e+Q',
    'X-Xp-Forwarded-For':
      '3939bfeaab22b444d596f61102bd4dfc149fe08c2311b7e5a2a6c14ea0b5b515ad297adc208992890532d6a6cf59d0f791b925d383c8a6c8b8706c7a6f7813e991b58fbe402e5991813b2b7c5bd6364615a050132df33c8e71146e1a42f4038edd7728c0f1897393f54a341f3e6d761411cb1d47e84dc8ad10d90d69418902dcb32da7ea285d973b72cf256d4e2e21455060072570da45c2a6314f39d119ebde77465abb0b5d408998dd2f4869bb676a3ef383f833cc8f8467a70f94522443bdfa6f7c6b71d637a89aef651ce2184a3110e293956b2072dbfcfac1a8274449f11cd2610d8514b45e5c95bcb48d3fef466ffeda1b3ef7a01604140b5a6b057bd859e6edafeec6822abeed7cae7388f55495b7edd99708ce2c80b5a697bf73'
  }
  return header
}
async function fetchUserIdByScreenName(screenName: string): Promise<string> {
  const wv = webviewRef.value
  if (!wv) throw new Error('webview 未准备好')

  const variables = { screen_name: screenName, withGrokTranslatedBio: false }
  const features = {
    hidden_profile_subscriptions_enabled: true,
    payments_enabled: false,
    profile_label_improvements_pcf_label_in_post_enabled: true,
    rweb_tipjar_consumption_enabled: true,
    verified_phone_label_enabled: false,
    subscriptions_verification_info_is_identity_verified_enabled: true,
    subscriptions_verification_info_verified_since_enabled: true,
    highlights_tweets_tab_ui_enabled: true,
    responsive_web_twitter_article_notes_tab_enabled: true,
    subscriptions_feature_can_gift_premium: true,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true
  }
  const fieldToggles = { withAuxiliaryUserLabels: true }

  const url = `https://x.com/i/api/graphql/96tVxbPqMZDoYB5pmzezKA/UserByScreenName?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(features))}&fieldToggles=${encodeURIComponent(JSON.stringify(fieldToggles))}`
  const header = await buildHeader()
  const data = await wv.executeJavaScript(`(async () => {
    try {
      const resp = await fetch(${JSON.stringify(url)}, { credentials: 'include',headers: ${JSON.stringify(header)}});
      if (!resp.ok) return { error: true, status: resp.status };
      return await resp.json();
    } catch (e) {
      return { error: true, message: String(e) };
    }
  })()`)
  if (data?.error)
    throw new Error('UserByScreenName 执行失败: ' + (data.status || data.message || 'unknown'))
  const userId = data?.data?.user?.result?.rest_id
  if (!userId) throw new Error('未获取到 rest_id')
  return userId
}
let cursor = null
async function fetchUserMediaUrls(userId: string): Promise<string[]> {
  const wv = webviewRef.value
  if (!wv) throw new Error('webview 未准备好')

  const variables = {
    userId,
    cursor,
    count: 50,
    includePromotedContent: false,
    withClientEventToken: false,
    withBirdwatchNotes: false,
    withVoice: true
  }
  const features = {
    rweb_video_screen_enabled: false,
    payments_enabled: false,
    profile_label_improvements_pcf_label_in_post_enabled: true,
    rweb_tipjar_consumption_enabled: true,
    verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    premium_content_api_read_enabled: false,
    communities_web_enable_tweet_community_results_fetch: true,
    c9s_tweet_anatomy_moderator_badge_enabled: true,
    responsive_web_grok_analyze_button_fetch_trends_enabled: false,
    responsive_web_grok_analyze_post_followups_enabled: true,
    responsive_web_jetfuel_frame: true,
    responsive_web_grok_share_attachment_enabled: true,
    articles_preview_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false,
    responsive_web_grok_show_grok_translated_post: false,
    responsive_web_grok_analysis_button_from_backend: true,
    creator_subscriptions_quote_tweet_preview_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_grok_image_annotation_enabled: true,
    responsive_web_grok_imagine_annotation_enabled: true,
    responsive_web_grok_community_note_auto_translation_is_enabled: false,
    responsive_web_enhance_cards_enabled: false
  }
  const fieldToggles = { withArticlePlainText: false }

  const url = `https://x.com/i/api/graphql/1sfLYBlfEneWDhkHSv_9hw/UserMedia?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(features))}&fieldToggles=${encodeURIComponent(JSON.stringify(fieldToggles))}`
  const header = await buildHeader()
  const json = await wv.executeJavaScript(`(async () => {
    try {
      const resp = await fetch(${JSON.stringify(url)}, { credentials: 'include',headers: ${JSON.stringify(header)}});
      if (!resp.ok) return { error: true, status: resp.status };
      return await resp.json();
    } catch (e) {
      return { error: true, message: String(e) };
    }
  })()`)
  if (json?.error)
    throw new Error('UserMedia 执行失败: ' + (json.status || json.message || 'unknown'))

  const urls = extractMediaUrlsDeep(json)
  cursor = extractBottomCursorValues(json)
  return urls
}

// 组合入口：从当前URL获取 screen_name -> userId -> media_url_https 列表
async function fetchCurrentPageMediaUrls(): Promise<string[]> {
  const screenName = getScreenNameFromUrl()
  if (!screenName) throw new Error('无法从当前URL解析 screen_name')
  const userId = await fetchUserIdByScreenName(screenName)
  const all: string[] = []
  cursor = null
  let count = 0
  while (true) {
    msgReactive.content = `获取分页中，正在获取第${++count}页...`
    const urls = await fetchUserMediaUrls(userId)
    if (urls?.length) all.push(...urls)
    if (!urls || urls.length < 20) break
  }
  return Array.from(new Set(all))
}

async function download() {
  try {
    msgReactive = message.create(`获取分页中`, { type: 'loading', duration: 0 })
    const urls = await fetchCurrentPageMediaUrls()
    if (!urls || urls.length === 0) {
      message.warning('未解析到可下载的媒体')
      return
    }
    msgReactive.content = `获取分页结束，共${urls.length}个文件，开始下载...`
    let defaultDownloadPath = settingStore.setting?.defaultDownloadPath
    if (!defaultDownloadPath) {
      const result = await (window as any).electron?.ipcRenderer?.invoke('dialog:openDirectory')
      if (result && !result.canceled && result.filePaths?.length > 0) {
        defaultDownloadPath = result.filePaths[0]
      }
    }
    if (!defaultDownloadPath) {
      message.error('未选择下载路径')
      msgReactive?.destroy()
      return
    }

    const screenName = getScreenNameFromUrl() || '未分类'
    let current = 0
    await runPool(
      urls,
      async (mediaUrl, idx) => {
        try {
          const u = new URL(mediaUrl)
          const basename = u.pathname.split('/').pop() || `p${idx}`
          const qExt = (u.searchParams.get('format') || '').trim()
          const ext =
            qExt || (basename.includes('.') ? (basename.split('.').pop() as string) : 'jpg')
          const fileName = basename.includes('.') ? basename : `${basename}.${ext}`

          await ipcRenderer.invoke('download:start', {
            url: mediaUrl,
            fileName,
            savePath: `${defaultDownloadPath}/${screenName}`,
            autoExtract: false,
            headers: { Referer: 'https://x.com/' }
          })
          current += 1
          showPageProgress(current, urls.length)
        } catch (e: any) {
          current += 1
          message.error(`下载失败：${e?.message || '未知错误'}`)
          showPageProgress(current, urls.length)
        }
      },
      CONCURRENCY
    )

    if (current === urls.length) {
      msgReactive?.destroy()
      message.success('全部下载完成')
    }
  } catch (e: any) {
    msgReactive?.destroy()
    message.error(`下载异常：${e?.message || e}`)
  }
}
onMounted(async () => {
  const wv = webviewRef.value
  if (!wv) return
  updateCanDownload()
  wv.addEventListener('did-navigate', updateCanDownload)
  wv.addEventListener('did-navigate-in-page', updateCanDownload)
  wv.addEventListener('dom-ready', updateCanDownload)
})
// 暴露方法
defineExpose({
  download,
  canDownload
})
</script>

<style lang="scss">
.site {
  padding: 10px;
  height: 100%;
  webview {
    width: 100%;
    height: 100%;
    background: #fff;
    border-radius: 14px;
    overflow: hidden;
  }
}
</style>
