<template>
  <div class="sa-page">
    <div class="sa-header">
      <h2>特别关注</h2>
      <n-button type="primary" size="small" @click="refresh">刷新</n-button>
    </div>
    <div class="sa-list">
      <div v-for="u in items" :key="u.id" class="sa-card">
        <div class="sa-card__left">
          <div class="sa-title">
            <span class="sa-source">[{{ u.source }}]</span>
            <span class="sa-author">{{ u.authorName || u.authorId }}</span>
            <span class="sa-id">({{ u.authorId }})</span>
          </div>

          <div class="sa-actions">
            <n-button size="small" @click="getLatest(u)">获取最新</n-button>
            <n-button size="small" type="error" tertiary @click="onRemove(u.id)">移除</n-button>
          </div>

          <div v-if="u._latest" class="sa-latest">
            <div class="sa-list-title">作品列表（{{ u._latest.length }}）</div>
            <div class="sa-works">
              <div
                v-for="it in u._latest"
                :key="it.artworkId"
                class="sa-work"
                :class="{ 'sa-work--new': !it.downloaded }"
              >
                <div class="sa-work__meta">
                  <span class="sa-work__id">#{{ it.artworkId }}</span>
                  <span class="sa-work__title">{{ it.title || '-' }}</span>
                  <span class="sa-work__author">{{ it.author || '-' }}</span>
                  <span v-if="!it.downloaded" class="sa-work__badge">未下载</span>
                  <span v-else class="sa-work__ok">已下载</span>
                </div>
                <div class="sa-work__ops">
                  <n-button
                    v-if="!it.downloaded && u.source === 'pixiv'"
                    size="tiny"
                    type="primary"
                    @click="enqueuePixiv(it)"
                  >
                    加入下载
                  </n-button>
                </div>
              </div>
            </div>
          </div>
          <!-- 其它站点可按需扩展 -->
        </div>
      </div>
      <div v-if="!items.length" class="sa-empty">暂无特别关注</div>
    </div>
  </div>
</template>

<script setup lang="ts" name="special-attention">
import { ref, onMounted } from 'vue'
import { NButton, useMessage } from 'naive-ui'
import { queue } from '@renderer/plugins/store/downloadQueue'
import { getDefaultDownloadPath } from './site/utils.js'

const message = useMessage()
const { pixiv, file } = window as any

type PixivLatestItem = {
  artworkId: string
  title?: string
  author?: string
  downloaded: boolean
}

type SpecialAttentionItem = {
  id: number
  source: 'pixiv' | 'jmtt' | 'twitter'
  authorId: string
  authorName?: string | null
  extra?: any
  createdAt: number
}
const items = ref<(SpecialAttentionItem & { _latest?: PixivLatestItem[] })[]>([])

async function refresh() {
  const list = await (window as any).specialAttention.list()
  items.value = list
}

async function onRemove(id: number) {
  await (window as any).specialAttention.remove(id)
  message.success('已移除')
  await refresh()
}


async function getLatest(u: SpecialAttentionItem & { _latest?: PixivLatestItem[] }) {
  if (u.source !== 'pixiv') return
  // 1) 获取作者的作品 ID 列表
  const profile = await pixiv.getArtworksByUserId(u.authorId)
  const illustIds: string[] = Object.keys(profile.illusts || {}).reverse()

  // 2) 确定作者目录，并扫描 info.json 构建已下载集合
  const baseDir = await getDefaultDownloadPath('downloadPathPixiv')
  // 优先使用已保存的作者名，否则取第一个作品详情的作者名
  let authorName = u.authorName
  if (!authorName && illustIds.length) {
    try {
      const firstInfo = await pixiv.getArtworkInfo(illustIds[0])
      authorName = firstInfo?.author
    } catch {}
  }
  const downloaded = new Set<string>()
  if (authorName) {
    const authorDir = `${baseDir}/${file.simpleSanitize(authorName)}`
    try {
      // 列出作者目录下的作品文件夹，读取其中的 info.json（若存在）
      if (file.pathExists(authorDir)) {
        const folders = await file.getDirectChildrenFolders(authorDir)
        for (const folder of folders) {
          const infoPath = `${folder.fullPath}/info.json`
          try {
            if (file.pathExists(infoPath)) {
              const buf = await file.readFileBuffer(infoPath)
              const info = JSON.parse(buf.toString())
              if (info?.site === 'pixiv' && info?.id) {
                downloaded.add(String(info.id))
              }
            }
          } catch {
            // 单个文件夹读取失败忽略
          }
        }
      }
    } catch {
      // 读取作者目录失败忽略
    }
  }

  // 3) 为了展示标题/作者信息，仅对前 20 个作品拉取详情
  const firstIds = illustIds.slice(0, 20)
  const detailCache: Record<string, any> = {}
  await Promise.all(
    firstIds.map(async (id: string) => {
      try {
        detailCache[id] = await pixiv.getArtworkInfo(id)
      } catch {}
    })
  )

  // 4) 组装列表，标记是否已下载
  const list: PixivLatestItem[] = []
  for (const id of illustIds) {
    const info = detailCache[id]
    list.push({
      artworkId: id,
      title: info?.title,
      author: info?.author ?? authorName,
      downloaded: downloaded.has(String(id))
    })
  }
  u._latest = list
  items.value = [...items.value]
}

async function enqueuePixiv(it: PixivLatestItem) {
  const info = await pixiv.getArtworkInfo(it.artworkId)
  queue.addTask({
    site: 'pixiv',
    title: `[${info.author}]${info.title}`,
    payload: {
      artworkId: it.artworkId,
      artworkInfo: info
    }
  })
  const target = items.value.find(card => card._latest?.some(w => w.artworkId === it.artworkId))
  if (target && target._latest) {
    const w = target._latest.find(w => w.artworkId === it.artworkId)
    if (w) w.downloaded = true
  }
}

onMounted(refresh)
</script>

<style scoped>
.sa-page { padding: 12px; }
.sa-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.sa-list { display: flex; flex-direction: column; gap: 10px; }
.sa-card { padding: 12px; border: 1px solid #eee; border-radius: 8px; background: #fff; }
.sa-title { font-size: 14px; font-weight: 600; display: flex; gap: 6px; align-items: baseline; }
.sa-source { color: #888; }
.sa-id { color: #aaa; font-size: 12px; }
.sa-actions { margin: 8px 0; display: flex; gap: 8px; }
.sa-latest { margin-top: 8px; }
.sa-list-title { font-weight: 600; margin-bottom: 6px; }
.sa-works { display: flex; flex-direction: column; gap: 6px; max-height: 360px; overflow: auto; }
.sa-work { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-radius: 6px; border: 1px solid #f0f0f0; }
.sa-work--new { background: #fff7e6; border-color: #ffd591; }
.sa-work__meta { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.sa-work__badge { color: #c41d7f; font-weight: 700; }
.sa-work__ok { color: #52c41a; }
.sa-empty { text-align: center; color: #999; padding: 40px 0; }
</style>