# 新增番茄站点：短剧搜索 / 书架 / 播放

## 结论先行
参考 `fq-reader-chrome/src/shared/`（纯逻辑层、无 Chrome 依赖、签名经黄金向量验证）整体移植到 comic-reader 的 preload，UI 采用 missav 模式（专属视图 + preload 插件 + 播放 overlay）。书架做成番茄视图内置标签页（参考 missav 用 localStorage），播放采用 fq-reader-chrome 的"全量下载→解密→本地播放"模式（番茄直链带时效且可能 CENC 加密，无法真正边下边播）。第一期不做用户目录下载。

## 一、preload 插件 `src/preload/plugins/fanqie/`（核心，大部分原样移植）

从 `W:\Workplace\fq-reader-chrome\src\shared\api\` 原样移植（仅改 import 路径）：
- `sign.ts` — 字节系签名（X-Argus/X-Ladon/X-Gorgon/SM3/Simon）
- `md5.ts`、`crypto.ts` — 纯 JS 加密原语（需新增依赖 `aes-js`、`js-sha512`；`buffer` 走 Node 内置）
- `deviceCrypto.ts` — ttEncrypt / registerkey
- `cenc.ts` — MP4 CENC(AES-CTR) 解密（内存 Buffer 进出改为写回文件）
- `mobileApi.ts` — 设备注册四步 + signedJsonRequest；`chrome.storage.local` → 现有 sqlite kv `window.appData`（key `fqMobileSession`）；保留注册失败 30 分钟熔断
- `comments.ts` — all_items 剧集列表（item_id 即 videoId）
- `drama.ts` — searchDramas / fetchDramaTitle / fetchShortplayModel+phoenix 补档 / decryptSpadeUrl / deriveSpadeContentKey / variantScore（H.264 优先）
- `types.ts`

重写适配：
- `http.ts` — 替代 chrome 版 client.ts：preload 里用全局 fetch（Electron Node 侧无 Origin 头，DNR 逻辑整体丢弃）
- `cache.ts` — 替代 IndexedDB：fs 缓存目录 `<userData>/fanqie-cache/<seriesId>/<序号>_<videoId>.mp4`；下载断连重试 3 次
- `index.ts` — `window.fanqie` 门面：`searchDramas(query)`、`getSeries(seriesId)`（标题+集数列表）、`ensureEpisode(seriesId, videoId)`（选流→下载→CENC解密→缓存命中直接返回本地路径）、`getDeviceStatus()/resetDevice()`、`clearCache()`

## 二、注册与入口
- `src/preload/index.ts` — exposeInMainWorld('fanqie', …)
- `src/main/index.ts` — 2 个 IPC：`fanqie:getCacheDir`、`fanqie:clearCache`
- 路由 `router/modules/index.ts` — `site/fanqie` → fanqie.vue
- 侧栏 `layout/index.vue` — routeMenuConfig 加「番茄短剧」（图标先用应用图标占位，同 yfantasy 先例）

## 三、番茄视图 `src/renderer/src/views/site/fanqie.vue`
- 顶部：搜索框 + 设备状态角标（未注册可重试）
- 标签页：搜索 / 书架
- 搜索结果：responsive-virtual-grid 封面卡片（标题、全N集）；点击进剧集详情面板（封面、简介、加入书架、集数网格）
- 书架：localStorage `fanqie:shelf`，含上次观看进度（第N集+时间点），支持移除、一键续播
- 播放 overlay：`<video>` file:// 播放缓存 mp4；顶栏（返回/标题/第N集）；上一集/下一集；ended 自动下一集；后台预取下一集；进度节流保存（5s+退出时）

## 四、全局搜索页接入（轻量）
- `site-utils/fanqie.js`：`searchArtworks`（返回 seriesId）、`getArtworkInfo`（标题/封面/集数/artworkType:'视频'）、`previewImage`（ensureEpisode 第1集返回 file:// 路径；preview-dialog 已支持视频）
- `site-utils/index.js` 注册；`views/search/index.vue` typeOptions 加「番茄短剧」并纳入"全部"

## 五、依赖与验证
- package.json：+ `aes-js`、`js-sha512`
- 新增 `scripts/fanqie-diag.mjs`（参考 chrome 版 test/diag-drama.mjs）：Node 直连真实 API 跑通 注册→搜索→剧集→video_model→spade 解密，先验证签名移植
- `npm run build`（typecheck 有存量报错，按本次涉及文件过滤）+ `npm run dev` 手工链路验证：搜索→详情→加书架→播放→自动连播→重开续播

## 风险
- 设备注册受出口 IP 风控，失败则站点整体不可用：已有熔断+手动重试；必要时后续加代理支持（missav 有先例）
- 仅 HEVC 的剧集在无解码器机器无法原生播放（h265web WASM 移植列为后续可选项）