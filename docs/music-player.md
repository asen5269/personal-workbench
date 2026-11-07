# 本地音乐播放器

入口：左侧「音乐」，路径 `/music`。使用现有 `npm start` 启动，`npm run build` 构建。

播放器现已切换为网易云在线音源；不实现方案中的蓝牙自动化、Electron、托盘或登录自启。当前项目是 Vue + Fastify 的本机网页应用，没有 Electron 主进程。

## 功能

- 文件与文件夹递归导入、同文件授权去重、取消导入、失败统计。
- 检测浏览器可解码的音频；读取标题、艺人、专辑、封面与时长；缺失封面使用静态色块。
- 搜索、排序、喜欢、最近播放；歌单新建、重命名、删除及歌曲加入/移除。
- 单例音频引擎；播放、暂停、停止、上下首、进度、音量与静音。
- 顺序、列表循环、单曲循环、随机；跨路由播放，底部栏和当前播放列表。
- 记住曲目、进度与设置；刷新后不自动发声，用户点击播放时恢复。
- 文件授权丢失时重新申请，移动文件可重新定位；移除记录不删除源文件。

## 数据与边界

使用当前站点的 IndexedDB（`workbench-music`）。支持 File System Access 的浏览器保存用户授权的文件句柄，默认不复制音频。其他浏览器选择文件后会保存音频副本到 IndexedDB；界面已说明。不同路径同名文件在句柄模式下可分别导入；副本模式只能按文件名、大小、修改时间去重。

选择浏览器存储是为了在现有网页架构下保留用户文件授权，不给后端增加任意路径读取接口。音乐数据不在 SQLite 备份内；清除站点数据会清除音乐曲库与歌单。固定使用同一站点地址及浏览器配置，端口或浏览器改变会获得独立曲库。关闭浏览器或刷新页面会停止播放，不能声称系统后台常驻。

实际编码支持以浏览器检测为准。FLAC 等格式并非所有环境均可播放，导入会先探测。当前未进行真实耳机、蓝牙、macOS 验证。

## 文件

- `src/state/music.js`：文件导入、标签读取、持久化与单例音频引擎。
- `src/pages/MusicPage.vue`：音乐库、歌单与当前曲目信息。
- `src/components/MusicMiniPlayer.vue`：跨页面播放控制与队列。
- `src/css/music.css`：响应布局、主题变量、交互反馈及减少动效适配。
- `src/App.vue`、`src/router.js`：入口与常驻播放器。
- `tests/music.test.js`：播放状态及 IndexedDB 恢复与删除测试。

测试命令：`node --test tests/music.test.js`。浏览器真实文件选择及音频输出仍需手动验收。

## 界面优化（2026-11-05）

曲库改用 Element Plus Table，搜索与排序改用 Input / Select，歌曲操作改用 Dropdown，播放进度与音量改用 Slider，记住进度改用 Switch。导入、空态、提示、歌单弹窗、播放列表分别使用 Button / Empty / Alert / MessageBox / Popover。保留自定义封面与紧凑播放卡片。

动效统一为 220ms cubic-bezier，仅过渡 transform / opacity；开关滑块使用 transform，减少动效偏好受支持。Element Plus Slider 拖动时预览，释放后提交进度，避免每次拖动事件写入存储。在线源调研见 [在线音乐源](music-online-sources.md)。

## 网易云在线音源

当前已移除 Audius 接口和页面，改用 `@neteasecloudmusicapienhanced/api`（固定 4.41.1）。在线音乐支持新歌速递、歌曲/艺人搜索、分页、在线播放、收藏与歌单，继续复用单例播放器。

详细接口、权限与配置见 [网易云后端说明](netease-source.md)。
