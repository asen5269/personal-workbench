# 多格式文件转换

## 调研与整合

调研了以下 GitHub 项目：

| 项目 | 方案 | 本项目采用方式 |
| --- | --- | --- |
| [ConvertX](https://github.com/C4illin/ConvertX) | Bun / Elysia，多转换器注册，调用 LibreOffice、Pandoc、FFmpeg 等 | 参考多引擎注册、按源格式匹配目标的组织方式；编写适配当前 Fastify 后端的转换层 |
| [VERT](https://github.com/VERT-sh/VERT) | Svelte，WebAssembly 本地转换，部分视频依赖服务 | 参考文件识别与目标格式选择流程 |
| [Transmute](https://github.com/transmute-app/transmute) | 独立部署的多格式转换服务 | 作为功能覆盖对照 |

ConvertX、VERT 的主程序使用 AGPL-3.0；这里未复制其主程序代码或部署整套应用。转换由下列开源工具及项目现有库执行，各自遵循原许可证。当前工具链在 Windows 本机运行，无需 Docker，不请求第三方转换 API。

## 转换引擎

| 引擎 | 来源 | 用途 | 许可证 / 本次验证版本 |
| --- | --- | --- | --- |
| LibreOffice | https://www.libreoffice.org/ ，https://github.com/LibreOffice/core | Word、Excel、PPT 与开放文档格式互转，输出 PDF | MPL-2.0 等；26.8.2 |
| Pandoc | https://github.com/jgm/pandoc | Markdown、HTML、DOCX、ODT、EPUB、RST、LaTeX、TXT 等结构化内容转换 | GPL-2.0-or-later；3.13 |
| FFmpeg | https://github.com/FFmpeg/FFmpeg | 音视频重新编码、音轨提取、字幕格式转换 | LGPL / GPL 取决于构建选项，本机为 GPL 构建；9.0.2 |
| Sharp / libvips | https://github.com/lovell/sharp | JPG、JPEG、PNG、WebP、AVIF、TIFF、GIF，SVG 转位图 | Sharp Apache-2.0；依赖另有许可 |
| VTracer | https://github.com/visioncortex/vtracer/tree/master/nodejs | 位图自动描摹为含矢量路径的 SVG | MIT OR Apache-2.0；固定为 1.0.0-alpha.4，运行于独立 Worker，120 秒超时 |
| png-to-ico / decode-ico | https://github.com/steambap/png-to-ico ，https://github.com/LinusU/decode-ico | 输出多尺寸 ICO、读取 ICO 最大图层 | MIT；png-to-ico 固定为 3.0.2 |
| ExcelJS / yaml | https://github.com/exceljs/exceljs ，https://github.com/eemeli/yaml | CSV、TSV、XLSX、JSON、YAML | MIT / ISC |
| pdf2docx / PyMuPDF | [单独说明](pdf-to-word-sources.md) | PDF 转 Word、文字、分页图片 | pdf2docx MIT，PyMuPDF AGPL / 商业双许可 |
| Calibre（可选） | https://github.com/kovidgoyal/calibre | MOBI、AZW3、FB2 等电子书互转 | GPL-3.0；未安装时不提供相关目标 |

外部组件的许可证与版权声明保留在安装目录。对外分发程序或工具链时，需要同时核对各组件及其依赖的许可条件。

## 安装与发现

当前设备通过 Scoop 安装 LibreOffice 和 Pandoc，已有 FFmpeg。LibreOffice 的 Scoop 清单来自 ScoopInstaller/Extras；本次从南京大学 TDF 镜像下载，并按原清单 SHA-256 校验。

在其他 Windows 设备上：

```powershell
scoop bucket add extras
scoop install libreoffice
scoop install pandoc
scoop install ffmpeg
```

可选电子书组件：安装 Calibre 后，将 `ebook-convert` 所在目录加入 PATH，或设置 `WORKBENCH_CALIBRE`。

引擎优先从环境变量、用户 Scoop 安装路径、PATH 发现，LibreOffice 还检查标准安装目录。可配置：

- `WORKBENCH_SOFFICE`：`soffice.com` 或 `soffice.exe` 绝对路径。
- `WORKBENCH_PANDOC`：`pandoc` 可执行文件路径。
- `WORKBENCH_FFMPEG`：`ffmpeg` 可执行文件路径。
- `WORKBENCH_CALIBRE`：`ebook-convert` 可执行文件路径。
- `WORKBENCH_PDF_PYTHON`：已安装 PDF 依赖的 Python 路径。

`GET /api/file-tools/capabilities` 返回源格式、目标格式、引擎可用状态和转换提示，不暴露本机安装路径。未安装引擎的转换不会出现在可选目标中；“支持格式”弹窗会说明源格式暂不可用。安装引擎后刷新页面即可重新识别。

## 使用与限制

文件转换页采用自动识别源格式、选择目标格式的方式。混合格式批量上传时取共同可用目标；一次最多 10 个文件，总计最多 500MB，逐文件处理并单独下载。通常单文件上限 200MB；PDF 转 Word 限制为 20MB / 100 页，PDF 文字或分页图片限制为 100 页。

图片合并 PDF 保留独立模式，最多 20 张、单张 20MB、总计 80MB。图片压缩和尺寸设置仍在“图片处理”页。

外部进程单次最长 3 分钟，全局最多 2 个通用转换任务；PDF 转 Word 单独限 2 分钟和单任务。每个外部转换使用独立临时目录，LibreOffice 使用独立用户配置并禁用宏执行；结束或报错后清理临时目录。音视频输入限制为本地文件 / 管道协议。取消按钮停止浏览器请求和后续排队文件，已经启动的后端进程可能继续至完成或超时。

HTML、Markdown 等多文件输出与附带图片会自动打包 ZIP，PDF 按页导出图片也打包 ZIP。CSV/TSV/JSON/YAML 与表格互转以数据为主；XLSX 输出到纯数据格式只取首表，不保存公式行为和样式。表格转 JSON/YAML 输出二维数组（含表头）；JSON/YAML 转表格接受对象数组或二维数组，嵌套值写为 JSON 文本。

图像默认仅转换首帧，透明图转 JPG / JPEG 填白色。JPEG 和 JPG 使用相同编码，分别输出 `.jpeg` / `.jpg` 扩展名。位图输出 SVG 默认使用高精度描摹：watershed 分割（detail 240）、cutout 拼接、8 位颜色精度，取消 32 色量化及小色块过滤；曲线阈值 1 像素、路径精度 6 位，不进行额外曲线简化。优先保留原分辨率，超大图片按最长边 4096 像素、800 万采样像素限制等比采样，再用 viewBox 保持请求的画布尺寸；文件可能明显增大，照片不能保证无损。原生 SVG 转 SVG 保留原文件，缩放时仅修改根节点画布尺寸及必要的 viewBox，不重描渐变、文字或路径。ICO 输出包含 16、32、48、64、128、256 像素图层，等比居中、空白透明，不使用图片缩放和质量滑块。ICO 输入读取最大可用图层。

音视频重新编码可能有损；视频提取音频要求原文件存在音轨。字幕样式、Office 字体、动画、复杂排版和公式可能变化。受密码、DRM 保护的文件不绕过限制。格式矩阵是已接入的转换组合，不表示任意两个格式都能互转。

验证入口：`node --test tests/universal-converter.test.js`，全部回归：`node --test tests/*.test.js`。
