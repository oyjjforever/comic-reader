# Comic Reader

本地漫画/视频阅读与第三方网站预览下载工具。基于 Electron + Vue3 + Vite，支持图片/PDF/EPUB 漫画阅读，视频资源浏览与播放（含书签收藏、DLNA 投屏），以及 Twitter/Pixiv/精选站点的 WebView 预览与下载抓取。

- 跨平台：Windows / macOS / Linux
- 一体化体验：本地内容管理 + 在线预览与下载
- 性能优化：虚拟列表、Keep-Alive 缓存，流畅浏览大量资源

## 功能特性

- 漫画阅读模块
  - 图片阅读器：翻页、缩放、键鼠操作（`src/renderer/src/components/image-reader.vue`）
  - PDF 阅读：基于 `vue-pdf-embed`（`src/renderer/src/components/pdf-reader.vue`）
  - EPUB 阅读：基于 `epubjs`（`src/renderer/src/components/epub-reader.vue`）
  - 资源浏览器：文件夹扫描、收藏夹、虚拟网格高性能渲染（`resource-browser.vue`、`virtual-grid.vue`、`responsive-virtual-grid.vue`）
- 视频模块
  - 资源浏览：指定资源路径下的树/文件列表与收藏（`views/video/index.vue`）
  - 播放器：原生 video 播放（本地文件），进度管理（`views/video/player.vue`）
  - 书签功能：时间点收藏、增删改查（预加载暴露 `window.videoBookmarks`）
  - DLNA 投屏：局域网设备发现与投屏（`views/video/dlna-cast.vue`，预加载暴露 `window.dlna`）
- 第三方网站预览与下载
  - Twitter、Pixiv、JM 站 WebView 预览（`persist:thirdparty` 分区，启用 `webviewTag`）
  - Cookie/Headers 注入、GraphQL/API 解析、批量下载（通过 `ipcRenderer` 与主进程 `download:start` 协作）
  - 自动解压 zip/rar/7z 等归档（系统安装 7-Zip 时启用；zip 默认走 Node 解压）
- 系统能力
  - 自动更新：`electron-updater`
  - 日志系统：`electron-log`（按日期目录维护，定期清理）
  - 自定义无边框窗口、全屏/还原、窗口控制 IPC
  - 一键打开 DevTools：`Ctrl/Cmd + Alt + Shift + L`

## 截图与演示

将你的实际截图或动图放入 `docs/screenshots`，文件名可沿用以下占位：

- 漫画阅读（图片）
  - `docs/screenshots/image-reader.png`
- 漫画阅读（PDF/EPUB）
  - `docs/screenshots/pdf-reader.png`
  - `docs/screenshots/epub-reader.png`
- 视频模块（资源/播放/书签/DLNA）
  - `docs/screenshots/video-browser.png`
  - `docs/screenshots/video-player.png`
  - `docs/screenshots/dlna-cast.png`
- 第三方网站预览与下载
  - `docs/screenshots/twitter-webview.png`
  - `docs/screenshots/pixiv-webview.png`
  - `docs/screenshots/jmtt-webview.png`

你也可以在 README 中直接内联引用：
```md
![Image Reader](docs/screenshots/image-reader.png)
![PDF Reader](docs/screenshots/pdf-reader.png)
![EPUB Reader](docs/screenshots/epub-reader.png)
![Video Browser](docs/screenshots/video-browser.png)
![Video Player + Bookmarks](docs/screenshots/video-player.png)
![DLNA Cast](docs/screenshots/dlna-cast.png)
![Twitter WebView](docs/screenshots/twitter-webview.png)
![Pixiv WebView](docs/screenshots/pixiv-webview.png)
![JM WebView](docs/screenshots/jmtt-webview.png)
```

## 快速开始

前置条件
- Node.js 18+
- npm 或 yarn
- Windows 推荐安装 7-Zip（用于 rar/7z 自动解压），macOS/Linux 请自行配置解压工具或仅使用 zip

安装与启动
- 安装依赖
  - `npm install`
- 开发调试
  - `npm run dev`
- 预览（打包后预览）
  - `npm run start`
- 类型检查
  - `npm run typecheck`
- 代码格式化
  - `npm run format`

打包构建
- 通用构建
  - `npm run build`
- 针对平台的构建产物
  - Windows: `npm run build:win`
  - macOS: `npm run build:mac`
  - Linux: `npm run build:linux`

提示
- 开发模式打开 DevTools：`Ctrl/Cmd + Alt + Shift + L`
- 渲染进程 URL 由 `electron-vite` 管理，开发环境自动加载

## 使用指南

- 资源路径配置
  - 视频模块读取自 Setting 中的 `videoResourcePath`（Pinia: `src/renderer/src/plugins/store/setting.ts`），请在应用设置页配置本地视频根目录。
- 资源浏览与收藏
  - `ResourceBrowser` 组件提供树与文件列表，支持收藏夹聚合（`window.favorite`）。
- 视频播放器与书签
  - 播放本地文件，支持时间点收藏（`window.videoBookmarks`），可在播放时添加/管理书签。
- DLNA 投屏
  - 在同一局域网内，打开投屏面板搜索设备，选择后由主进程/预加载协调传输。
- 第三方站点预览与下载
  - Twitter/Pixiv/JM 页面在 WebView 中打开（`persist:thirdparty` 分区，`webviewTag: true`）。
  - 解析所需的 Cookie/Headers 由 WebView `executeJavaScript` 获取并注入请求。
  - 触发下载后，主进程通过 `net` 流式写入文件，并可自动解压归档到同名目录。

## 目录结构（节选）

- `src/main/index.ts`: Electron 主进程（窗口/更新/下载/会话）
- `src/preload/index.ts`: 预加载，暴露 `electron`、`book`、`video`、`favorite`、`videoBookmarks`、`dlna` 等 API
- `src/renderer/src/views`
  - `book/`: 本地书籍/漫画视图（`index.vue`、`reader.vue`）
  - `video/`: 视频浏览/播放器/投屏（`index.vue`、`player.vue`、`dlna-cast.vue`）
  - `site/`: 第三方站点 WebView 页（`twitter.vue`、`pixiv.vue`、`jmtt.vue`）
- `src/renderer/src/components`
  - `image-reader.vue` / `pdf-reader.vue` / `epub-reader.vue`
  - `resource-browser.vue` / `virtual-grid.vue` / `responsive-virtual-grid.vue`
- `docs/`: 虚拟列表与 Keep-Alive 优化说明

## 技术栈

- 主进程：Electron、electron-updater、electron-log
- 预加载：@electron-toolkit/preload（contextBridge 安全暴露 API）
- 渲染层：Vue 3、Vite、Pinia、Vue Router、Naive UI、Tailwind CSS
- 阅读器：epubjs、vue-pdf-embed
- 数据与存储：sqlite/sqlite3（收藏/书签等）
- 其他：lodash、dlnacasts、mime-types

## 许可证

本项目基于 MIT License 开源（见 `LICENSE`）。