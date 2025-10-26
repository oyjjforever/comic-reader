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
  - 下载队列：批量下载任务管理、进度显示、任务取消、任务管理

- 特别关注

  - 关注用户：查看最新作品和本地下载情况
  - 类型： 支持关注上述三个网站的用户

- 系统能力

  - 自动更新：`electron-updater`
  - 日志系统：`electron-log`（按日期目录维护，定期清理）
  - 自定义无边框窗口、全屏/还原、窗口控制 IPC
  - 一键打开 DevTools：`Ctrl/Cmd + Alt + Shift + L`

## 截图与演示

将你的实际截图或动图放入 `docs/screenshots`，文件名可沿用以下占位：

- 漫画阅读（图片）
  ![Image Reader](docs/books.png)
- 漫画阅读（图片/PDF/EPUB）
  ![Image Reader](docs/reader.png)
- 视频模块（资源/播放/书签/DLNA）
  ![Image Reader](docs/dlna.png)
  ![Image Reader](docs/start-timepoint.png)
- 第三方网站预览与下载
  ![Image Reader](docs/download-queue.png)
- 特别关注
  ![Image Reader](docs/special-attention.png)

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

## 技术栈

- 主进程：Electron、electron-updater、electron-log
- 预加载：@electron-toolkit/preload（contextBridge 安全暴露 API）
- 渲染层：Vue 3、Vite、Pinia、Vue Router、Naive UI、Tailwind CSS
- 阅读器：epubjs、vue-pdf-embed
- 数据与存储：sqlite/sqlite3（收藏/书签等）
- 其他：lodash、dlnacasts、mime-types

## 许可证

本项目基于 MIT License 开源（见 `LICENSE`）。
