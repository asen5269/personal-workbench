> 历史调研。当前已按用户选择切换为网易云，Audius 接口与页面已移除。以 [网易云后端说明](netease-source.md) 为准。

# 在线音乐源调研

核查日期：2026-11-05。此次需求为查找可在线播放的歌曲资源，未将播放器组件或自建曲库服务器视为在线歌曲来源。后续已按用户选择接入 Audius，提供热门、搜索、公开歌曲播放与收藏；Jamendo 尚未接入。

## 首选候选：Audius

- [官方开源应用与 TypeScript SDK](https://github.com/AudiusProject/apps)，仓库标注 Apache-2.0。
- [官方 API](https://docs.audius.co/api/)、[开发入门](https://docs.audius.co/developers/resolve-api)：提供歌曲搜索、热门曲目、歌单和串流。
- 已在本机不带 API Key 请求热门曲目接口（HTTP 200），成功返回公开、可串流、未设门槛的曲目。对样本曲目发起 0–1023 字节请求，得到 HTTP 206、`audio/mpeg` 和有效 Content-Range。这仅证明此次目录与音频分段请求可用，不保证长期免密钥或所有歌曲可播放。
- 不将付费、受限或不允许串流的曲目视为可播放。曲目内容不是因为 SDK 开源就获得了任意复制或商用许可。
- 接入建议：先做在线搜索与公开曲目播放，复用现有单例引擎；保留艺人署名与来源页面，错误时明确提示。不使用另一个音频引擎，不默认下载缓存整首音频。
- GitHub 的旧 `AudiusProject/audius-protocol` 地址现重定向至 `AudiusProject/apps`；旧 `api-docs` 仓库已归档，不应当作当前唯一接口依据。

## CC 曲库候选：Jamendo

- [官方 API 文档](https://developer.jamendo.com/v3.0/docs)、[歌曲接口](https://developer.jamendo.com/v3.0/tracks)。支持搜索、曲目与歌单；歌曲接口含音频及许可信息。
- [认证文档](https://developer.jamendo.com/v3.0/authentication)：每次调用需要开发者注册应用获得的 `client_id`。没有替用户注册账号，也没有使用网络上他人的凭据。
- GitHub 可找到 [Banane9/JamendoApi](https://github.com/Banane9/JamendoApi)，但它是非官方 .NET 客户端，不是托管歌曲的仓库，也不适合直接加入现有 Vue / Node 项目。可以直接对接官方 REST 接口。
- [API 使用条款](https://devportal.jamendo.com/api_terms_of_use)说明 API 内容采用 Creative Commons 许可。具体曲目的许可条款仍须逐首核对，特别是署名、禁止商用、相同方式共享及禁止演绎等条件。
- 优点：偏向明确 CC 授权的独立音乐。成本：开发者账号、凭据配置、配额与条款核对；本次未带开发者凭据实测。

## 不应混淆

- [APlayer](https://github.com/DIYgod/APlayer)：MIT 播放器组件，有歌单和歌词功能，不提供歌曲曲库。
- [Navidrome](https://github.com/navidrome/navidrome)：GPL-3.0 自建音乐库服务，仍需要自己提供音乐文件。
- [MetingJS](https://github.com/metowolf/MetingJS)：音乐平台 API 桥接，依赖服务端接口；不能把其开源许可等同于所有歌曲免费可用或接口长期稳定。

结论：若优先快速接入在线收听，建议先验证 Audius；若优先有明确 CC 许可的素材音乐，再配置 Jamendo。当前网络实测不等于浏览器端完整播放、跨地域可用性或长期 SLA 验收。
