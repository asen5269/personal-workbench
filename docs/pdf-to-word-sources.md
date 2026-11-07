# PDF 转 Word 开源组件

- 来源：https://github.com/ArtifexSoftware/pdf2docx
- 固定版本：0.5.13（通过 PyPI 官方发行包装入独立的 `.venv-pdf` 环境，不复制整个仓库）。
- 上游许可证：https://github.com/ArtifexSoftware/pdf2docx/blob/v0.5.13/LICENSE （MIT，版权 Artifex Software, Inc.）。发行包保留完整许可证及版权声明。
- 维护状态：https://github.com/ArtifexSoftware/pdf2docx/discussions/374 （Artifex 于 2026-03-09 宣布停止主动维护，仍接受社区贡献）。
- 底层 PyMuPDF / MuPDF 为 AGPL / 商业双许可，并非所有依赖都是 MIT：https://pymupdf.readthedocs.io/en/latest/about.html#license-and-copyright 。本项目未购买商业许可；对外分发或部署前需核对包括依赖在内的许可证条件。

## 本机安装

需要 Python 3.10 或更高版本。项目当前独立环境使用 Python 3.12。

```powershell
uv venv .venv-pdf --python 3.12
uv pip install --python .venv-pdf/Scripts/python.exe -r server/python/requirements-pdf.lock.txt
```

也可使用 Python 的 `venv` 和 `pip` 安装同一锁定依赖文件。迁移设备时重新安装环境，不复制 `.venv-pdf`。自定义 Python 可设置环境变量 `WORKBENCH_PDF_PYTHON` 为可执行文件的绝对路径。

## 行为与限制

在现有 `/api/file-tools/convert?mode=pdf-docx` 接口接收一个 PDF，返回 DOCX。文件经标准输入/输出在 Node 与独立 Python 进程间传递，不写入临时目录、不上传第三方服务。文件名不参与命令执行。

限制为单文件 20MB、100 页、单次 120 秒，一次只运行一个 PDF 转换。Python 单进程转换且遇到页面解析错误会失败，不静默漏页。需要密码的 PDF、无法提取文字的 PDF、损坏文件分别返回明确提示。扫描件不自动 OCR；混合 PDF 的图像内容不保证转为可编辑文字。表格、分页、字体、多栏布局依赖上游解析效果，无法保证原样还原。

验证：`node --test tests/pdf-to-word.test.js`（需先安装独立环境），覆盖中文/英文、表格、扫描件、密码文件、损坏文件和页数上限。
