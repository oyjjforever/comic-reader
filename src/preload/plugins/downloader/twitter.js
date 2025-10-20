import fsp from 'fs/promises'
import file from '../file.ts'
import Api from './api.js'

const api = new Api({
  proxyMode: 'Custom',
  proxyHost: '127.0.0.1',
  proxyPort: '7890'
})
function extractMediaUrlsDeep(data) {
  const urls = []
  const stack = [data]

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
function extractBottomCursorValues(root) {
  const out = []
  const stack = [root]

  while (stack.length) {
    const cur = stack.pop()
    if (cur == null) continue

    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item)
    } else if (typeof cur === 'object') {
      // 命中条件：存在 "cursorType": "Bottom" 且有字符串类型的 "value"
      if (cur.cursorType === 'Bottom' && typeof cur.value === 'string') {
        out.push(cur.value)
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
async function buildHeader(cookies) {
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
async function getUserIdByName(name, cookies) {
  const variables = { screen_name: name, withGrokTranslatedBio: false }
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
  const res = await api.get({
    url: `https://x.com/i/api/graphql/96tVxbPqMZDoYB5pmzezKA/UserByScreenName?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(features))}&fieldToggles=${encodeURIComponent(JSON.stringify(fieldToggles))}`,
    headers: buildHeader(cookies)
  })
  const userId = res?.data?.user?.result?.rest_id
  return userId
}

async function getMediaPerPage(userId, cookies) {
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

  const res = await api.get({
    url: `https://x.com/i/api/graphql/1sfLYBlfEneWDhkHSv_9hw/UserMedia?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(features))}&fieldToggles=${encodeURIComponent(JSON.stringify(fieldToggles))}`,
    headers: buildHeader(cookies)
  })
  return res
}

async function getAllMedia(userId, cookies) {
  let all = [],
    cursor = null
  while (true) {
    const res = await getMediaPerPage(userId, cookies)
    const urls = extractMediaUrlsDeep(res)
    cursor = extractBottomCursorValues(res)
    if (urls?.length) all.push(...urls)
    if (!urls || urls.length < 20) break
  }
  return Array.from(new Set(all))
}

async function downloadImage(url, savePath) {
  const res = await api.get({
    url,
    responseType: 'arraybuffer',
    headers: { Referer: 'https://x.com/' }
  })
  let imageData = Buffer.from(res)
  file.ensureDir(savePath)
  fsp.writeFile(savePath, imageData)
}
export default {
  getUserIdByName,
  getUserIdByName,
  getAllMedia,
  downloadImage
}
