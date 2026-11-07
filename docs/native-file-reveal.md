# 打开所在文件夹

- Windows：通过随应用安装的 Koffi 调用系统 Shell32 文件定位接口和 User32 窗口激活接口，不依赖 PowerShell、用户目录或用户名。Windows 系统目录由系统环境确定。
- macOS：调用系统自带 `/usr/bin/open -R`，将路径作为独立参数传递给 Finder，不执行路径中的命令字符。
- 两个平台均只接受资料库记录 ID，服务端解析真实文件路径；HTTP 入口仍限制本机来源。
- 文件按资料库目录层级及原文件名保存，操作系统使用各自的路径分隔符。

当前验证范围：本机 Windows 实际定位、文件名与目录兼容测试、macOS 调用参数及错误分支测试。没有 Mac 真机验证，也没有覆盖所有 Windows 版本。部署目标应使用所选 Node/Electron 版本正式支持的 Windows/macOS 版本。

后续桌面端可将可信主进程的 `shell.showItemInFolder` 注入 `registerLibrary` 的 `revealFile` 参数，继续复用文件 ID 校验和路径解析。打包时需携带目标架构的原生依赖；资料存储根目录需传入桌面应用的用户数据目录，不能依赖安装目录可写。当前尚未创建桌面安装包。

参考：[Windows 文件定位接口](https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shopenfolderandselectitems)、[Electron 文件管理器接口](https://www.electronjs.org/docs/latest/api/shell#shellshowiteminfolderfullpath)、[Koffi 平台支持](https://koffi.dev/)。
