# Windows 桌面发行

桌面壳使用 Tauri 2，前端复用 Vue，随安装包携带同版本 Node 和生产依赖。后台只监听本机 38641 端口（稳定来源以保留 IndexedDB 和配置），通过每次启动生成的 HttpOnly 会话令牌限制访问；关闭应用时结束后台进程树。端口占用时启动失败，不连接已有不明服务。

## 构建

在 Windows x64、Rust MSVC 和 Visual Studio C++ 构建工具已安装的开发环境执行：

```pwsh
npm install
npm run build
node desktop/prepare-windows.js
pwsh -NoProfile -File desktop/prepare-crt.ps1
pwsh -NoProfile -File desktop/download-webview2.ps1
pwsh -NoProfile -File desktop/prepare-archive.ps1
npm exec tauri icon -- src-tauri/icons/icon.png
npm exec tauri build -- --bundles nsis
```

构建资源压缩需要 Scoop 中的 7-Zip；解压程序及许可证随包提供，用户不需要安装 7-Zip。

准备脚本从开发机提取 Node、生产 npm 包、Scoop 中的 FFmpeg、Pandoc、LibreOffice，以及 `.venv-pdf` 对应的完整 Python 运行时和 PDF 包。不会把虚拟环境启动器作为可移植 Python。构建机器需要这些来源；用户安装后不需要配置 PATH 或自行安装它们。

Windows 安装程序内置 WebView2 离线安装器。目标 Windows 10/11 x64。联网解析、在线曲库和天气仍需要网络；没有在线平台授权或资源可用性保证。

Visual C++ 可分发运行库以应用本地 DLL 方式包含于安装包，不要求目标机安装开发工具。完整引擎资源较大，安装后需预留数 GB 空间；本版本未配置发布者代码签名证书。

## 数据

正式数据位于 `%LOCALAPPDATA%/com.personal.workbench/`，SQLite、资料库和上传图片均在该目录下，不写安装目录。安装包不包含开发机 `server/data` 数据。浏览器中的 IndexedDB、localStorage 不会自动迁入桌面端；桌面 WebView 独立保存浏览器数据。

## 验证

`node desktop/smoke-test.js` 使用打包目录内 Node，在临时工作目录、清空开发工具 PATH 的环境验证前端、接口、访问令牌、全新数据库和外部引擎。不等于全新虚拟机安装验证；公开发行前仍需在没有开发工具、没有 WebView2 的 Windows 虚拟机执行安装及卸载测试。

播放器配置目前只保存选项；Windows/macOS 音频设备监听尚未实现。此桌面封装不改变该状态。

当前只产出 Windows 包。macOS 需单独准备各架构 Node、原生 npm 包、转换引擎和启动路径，使用 macOS 构建并签名公证。


