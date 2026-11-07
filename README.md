# 个人工作台

Windows 桌面封装使用 Tauri 2，内置 Node、转换引擎和 WebView2 离线安装程序。构建与验证见 [桌面发行说明](docs/desktop-windows.md)；构建命令为 `npm run desktop:build`，运行时验证为 `npm run desktop:test`。

目录结构：

```text
src/
  css/          公共样式与页面样式
  pages/        页面
  components/   可复用组件
  state/        共享状态
  utils/        前端工具函数
  assets/       前端静态资源
server/
  index.js      Fastify 后端入口
  lib/          解析器、画质探测和媒体处理
  data/         SQLite 数据库
public/         图片、封面等公开资源
tests/          自动测试与联网验证
docs/           项目说明与设计检查记录
artifacts/      截图、测试报告、日志和备份（不提交）
```

界面使用 Element Plus（中文），覆盖导航、按钮、表格、表单、日期选择、弹窗和播放器选择控件。

`/music` 提供本地音乐库、网易云在线搜索与新歌速递、歌单、标签和封面读取、跨页面播放及底部播放器。在线曲目仅保存元数据，播放需要联网；音乐授权、曲库和设置保存在当前浏览器 IndexedDB，不包含在 SQLite 备份中；详情见 [音乐播放器说明](docs/music-player.md)。蓝牙与系统自启尚未接入。

文件转换页已扩展为多引擎格式转换：自动识别源格式，只提供本机实际可用的目标，支持批量转换和独立下载。覆盖文档、表格、演示文稿、图片、音视频、EPUB、数据与字幕；多文件输出自动打包 ZIP。通用转换单文件最大 200MB，PDF 转 Word 仍限制 20MB / 100 页。引擎来源、安装、支持范围和限制见 [多格式转换说明](docs/file-conversion-engines.md)。

`/toolbox/images` 提供批量图片压缩、比例缩放和格式转换，最多 20 张、单张 20MB、本批总计 200MB，统一设置后逐张处理。每张显示独立结果，失败继续处理其他图片，可重试未完成、分别下载或打包 ZIP；同名输出会自动编号，打包结果总大小限 200MB。`/toolbox/files` 提供通用转换与多图合并 A4 PDF。图片合并最多 20 张、单张 20MB、总大小不超过 80MB，可调整页面顺序。动图仅处理第一帧。通用转换中的外部引擎会使用独立临时目录并在任务结束后清理；处理结果在当前页面下载，不自动保存到资料库。

资料库位于 `/library`，支持多级文件夹、批量选择及拖拽上传任意类型文件，单文件最大 2GB；上传进度按文件显示，同名文件不覆盖。支持下载、删除空文件夹及文件，文本（TXT / MD，最大 2MB）、常用图片和浏览器兼容的音视频可本地预览；Office 等其他文件下载后打开。文件元数据保存在 SQLite，文件原件保存在 `server/data/library/`，备份需同时保存数据库和该目录。

每日笔记存储在同一 SQLite 数据库，按创建时间倒序，由后端执行日期、分类、搜索及分页查询。列表仅加载当前页摘要，正文在打开或导出时读取；封面图片按需加载。首次进入笔记页会自动迁移当前浏览器原有笔记，迁移可重试且不会重复导入；旧浏览器数据保留为迁移前副本，不再同步。备份笔记请保存数据库文件。自定义空分类仍保存在浏览器中。

需要 Node.js 22 或更高版本。文档和媒体转换需要对应的本机引擎，见 [转换引擎安装](docs/file-conversion-engines.md)。PDF 转 Word、提取文字和分页图片需要独立 Python 环境，见 [PDF 转 Word 说明](docs/pdf-to-word-sources.md)。最高可用画质探测，以及分离音视频的合并，需要 FFprobe 和 FFmpeg 加入 PATH。

```powershell
npm install
npm start
```

打开 http://127.0.0.1:5173。数据明文保存在 `server/data/workbench.db`，备份时请一并保存。应用仅监听本机地址。

自媒体解析由项目内的 Node.js 模块实现，识别抖音、小红书、B站、快手、TikTok、YouTube 和 X/Twitter。仅读取公开页面，不绕过登录、付费或 DRM 限制；平台改版、登录要求、地域与网络限制可能导致只返回页面信息或解析失败。YouTube 使用 npm 包 youtubei.js，其他平台读取公开页面或公开播放接口，不调用外部 skills、Python 或 yt-dlp。

页面提供“标准画质”和“最高可用画质”。最高模式逐个下载候选，以 FFprobe 实测像素、视频包码率、帧率和大小排序；不会把接口声明的清晰度当作实测结果。候选不可用或达到限制时报告部分探测，不保证上传原片。音视频分离时由 FFmpeg 流复制合并，不重新编码。报告在 API 的 quality_report 字段；缓存约一小时有效。

解析历史保存在同一 SQLite 数据库，按作品链接和画质去重，保留最近 200 条。左侧历史支持搜索、查看、删除和清空，手机端使用抽屉。素材原始链接与预览映射保存在 SQLite，服务重启后仍可使用，不再按一小时强制失效；平台链接本身失效时需要重新解析。

每个候选最大 512MB，总下载预算 1GB，下载阶段总预算 180 秒；探测与合并另有进程超时。最高画质会明显增加时间和流量。标准模式不枚举下载，除非需要合并分离音视频。

独立调用：

```js
import { parseMedia } from './server/lib/media-parser.js'
const result = await parseMedia('抖音作品链接或分享内容')

// 可选：实测最高画质，返回可播放的本机缓存路径与报告。
import { prepareMedia } from './server/lib/media-quality.js'
import { platformReferer } from './server/lib/platforms.js'
const highest = await prepareMedia(result, { original: true, referer: platformReferer(result.platform) })
```

回归测试：`node --test tests/media-parser.test.js tests/platforms.test.js tests/media-quality.test.js`。联网验证：`node tests/media-parser-live.js`、`node tests/media-original-live.js`。平台适配有结构化测试；公开链接的实时可用性不由测试保证。
