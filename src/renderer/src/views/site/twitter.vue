<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, defineExpose } from 'vue'
import { useMessage } from 'naive-ui'
const message = useMessage()
const { ipcRenderer } = (window as any).electron || require('electron')

const url = ref('https://x.com/')
const webviewRef = ref<any>(null)
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

  const data = await wv.executeJavaScript(`(async () => {
    try {
      const targetUrl = ${JSON.stringify(url)};
      const DEFAULT_BEARER = 'Bearer AAAAAAAAAAAAAAAAAAAAAANRILgAAAAAAAPy5ey9s2q3iEo0Zs8S+Qv4B1aY=';
      const cookies = document.cookie || '';
      const ct0 = (cookies.match(/(?:^|;\\s*)ct0=([^;]+)/) || [])[1] || '';
      const buildBaseHeaders = () => {
        const h = {
          'accept': 'application/json',
          'x-twitter-active-user': 'yes',
          'x-twitter-client-language': navigator.language || 'en',
          'referer': location.href
        };
        if (ct0) h['x-csrf-token'] = ct0;
        return h;
      };
      const activateGuest = async () => {
        try {
          const resp = await fetch('https://api.twitter.com/1.1/guest/activate.json', {
            method: 'POST',
            headers: { 'Authorization': DEFAULT_BEARER, 'accept': 'application/json' }
          });
          if (!resp.ok) return null;
          const j = await resp.json();
          return j?.guest_token || null;
        } catch { return null; }
      };

      let headers = buildBaseHeaders();
      let resp = await fetch(targetUrl, { credentials: 'include', headers });
      if (resp.status === 401 || resp.status === 403) {
        let guestToken = localStorage.getItem('gt');
        if (!guestToken) {
          guestToken = await activateGuest();
          if (guestToken) localStorage.setItem('gt', guestToken);
        }
        headers = {
          ...headers,
          'Authorization': DEFAULT_BEARER,
          'x-guest-token': guestToken || '',
          'x-twitter-auth-type': 'OAuth2Client'
        };
        resp = await fetch(targetUrl, { credentials: 'include', headers });
      }
      if (!resp.ok) return { error: true, status: resp.status };
      return await resp.json();
    } catch (e) {
      return { error: true, message: String(e) };
    }
  })()`)
  if (data?.error) throw new Error('UserByScreenName 执行失败: ' + (data.status || data.message || 'unknown'))
  const userId = data?.data?.user?.result?.rest_id
  if (!userId) throw new Error('未获取到 rest_id')
  return userId
}

async function fetchUserMediaUrls(userId: string): Promise<string[]> {
  const wv = webviewRef.value
  if (!wv) throw new Error('webview 未准备好')

  const variables = {
    userId,
    count: 20,
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

  const json = await wv.executeJavaScript(`(async () => {
    try {
      const targetUrl = ${JSON.stringify(url)};
      const DEFAULT_BEARER = 'Bearer AAAAAAAAAAAAAAAAAAAAAANRILgAAAAAAAPy5ey9s2q3iEo0Zs8S+Qv4B1aY=';
      const cookies = document.cookie || '';
      const ct0 = (cookies.match(/(?:^|;\\s*)ct0=([^;]+)/) || [])[1] || '';
      const buildBaseHeaders = () => {
        const h = {
          'accept': 'application/json',
          'x-twitter-active-user': 'yes',
          'x-twitter-client-language': navigator.language || 'en',
          'referer': location.href
        };
        if (ct0) h['x-csrf-token'] = ct0;
        return h;
      };
      const activateGuest = async () => {
        try {
          const resp = await fetch('https://api.twitter.com/1.1/guest/activate.json', {
            method: 'POST',
            headers: { 'Authorization': DEFAULT_BEARER, 'accept': 'application/json' }
          });
          if (!resp.ok) return null;
          const j = await resp.json();
          return j?.guest_token || null;
        } catch { return null; }
      };

      let headers = buildBaseHeaders();
      let resp = await fetch(targetUrl, { credentials: 'include', headers });
      if (resp.status === 401 || resp.status === 403) {
        let guestToken = localStorage.getItem('gt');
        if (!guestToken) {
          guestToken = await activateGuest();
          if (guestToken) localStorage.setItem('gt', guestToken);
        }
        headers = {
          ...headers,
          'Authorization': DEFAULT_BEARER,
          'x-guest-token': guestToken || '',
          'x-twitter-auth-type': 'OAuth2Client'
        };
        resp = await fetch(targetUrl, { credentials: 'include', headers });
      }
      if (!resp.ok) return { error: true, status: resp.status };
      return await resp.json();
    } catch (e) {
      return { error: true, message: String(e) };
    }
  })()`)
  if (json?.error) throw new Error('UserMedia 执行失败: ' + (json.status || json.message || 'unknown'))

  const urls = extractMediaUrlsDeep(json)
  return urls
}

// 组合入口：从当前URL获取 screen_name -> userId -> media_url_https 列表
async function fetchCurrentPageMediaUrls(): Promise<string[]> {
  const screenName = getScreenNameFromUrl()
  if (!screenName) throw new Error('无法从当前URL解析 screen_name')
  const userId = await fetchUserIdByScreenName(screenName)
  return await fetchUserMediaUrls(userId)
}

async function download() {
    const res = await fetchCurrentPageMediaUrls()
    console.log(res)
}
onMounted(async () => {})
// 暴露方法
defineExpose({
  download
})
</script>

<style lang="scss">
.site {
  padding: 10px;
  height: calc(100% - 24px);
  webview {
    width: 100%;
    height: 100%;
    background: #fff;
    border-radius: 14px;
    overflow: hidden;
  }
}
</style>
