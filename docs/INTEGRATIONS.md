# 集成依据与实现边界

核实日期：2026 年 10 月 20 日。本文区分已读取的接口事实与本项目拟定设计；没有执行真实光驱兼容性测试，也没有请求用户的 Discogs 或 AI 凭据。

## AtelierPublisher

本地依据是 `E:\ToolsForMyself\AtelierPublisher\INTERACTIVE-MODELS.md`、`shared/interactive-model.js`、`shared/model-v2.js`、`src/discs/interactive/mount-model.js` 与 `AGENTS.md`。

- 当前通用包的 `format` 为 `atelier-interactive-model`，`version` 为数字 `2`，UTF-8 JSON，最大 50 MiB。
- `cover` 为内嵌 PNG／WebP；`scene.up` 必须为 `Z`；有 `nodes`、`geometries`、`materials`、`textures`。
- `initialState`、`states`、`actions` 描述交互，部件标识严格使用包中的精确值。
- `parseModelPackage` 执行解析与校验；`mountModel` 返回 `reset`、`putBack`、`exitInspection`、`dispose`、`screenBounds` 和 `state`。
- v1 兼容路径仅针对现有 `jony-j-24-v1`，不能声称所有未知 v1 结构均支持。
- 当前网站收藏字段只覆盖 `cd`／`bluray` 等既有约束，不能原样作为新软件的通用品类域模型。

集成顺序：提取独立运行库并保留来源版本 → 固定回归模型 → 本地资产适配 → 新展示配置 → 原型与实际模型衔接。不要从兄弟目录直接运行生产应用的导入路径，正式产品需可独立打包。保留上游许可和第三方渲染库声明。

## Discogs

官方检索为 `/database/search`，支持 `type=release`、`barcode`、`catno`，要求认证。具体发行来自 `/releases/{release_id}`；聚合版本来自 `/masters/{master_id}` 与 `/masters/{master_id}/versions`。发行结构包含 `formats`、`identifiers`、`labels`、`master_id`、`tracklist`、`images`；`formats` 的 `name`、`qty`、`descriptions` 不能简化成单个格式标签。依据：[官方数据库 API](https://www.discogs.com/developers#page:database)。

认证限流文档为每分钟 60 次，匿名为 25 次，可调整。实现读取 `X-Discogs-Ratelimit`、`X-Discogs-Ratelimit-Used`、`X-Discogs-Ratelimit-Remaining`，按响应退避，并发送应用 `User-Agent`。Rust 后端使用 `Authorization: Discogs token=…`，密钥不进入前端。依据：[官方开发者首页](https://www.discogs.com/developers)。

API 条款将图片、用户数据、Marketplace 数据列为 Restricted Data；第 2.5 条要求展示数据的新鲜度，并限制不必要缓存。来源旁需有 “Data provided by Discogs.” 和链接。因此个人购入记录独立永久保存，API 来源缓存附时间并按条款刷新；完整离线元数据方案需单独明确 CC0 数据包与 API 的适用条件。云 AI 与个人网站发布默认不接收 Restricted Data。依据：[Discogs API Terms of Use](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use)。

这不是泛化为所有 CC0 元数据都不能存储；需要分别处理个人输入、CC0 数据与 API 服务条款下取得的缓存。

0.1.3 实现进展：搜索后选择发行并确认本地收藏入库，保存必要书目字段、来源 ID、获取时间及全部标识符。按用户要求，具体发行的封面也自动下载并作为个人收藏资产保存；市场／用户资料不导入。在线预览六小时有效，本地确认记录不自动覆盖；具体保留、刷新边界和测试证据见 [Discogs 接入记录](DISCOGS-DEVELOPMENT.md)。正式来源差异合并、公开网站同步及相关图片授权处理仍未完成。

## 网易云社区服务

现有项目 `E:\ToolsForMyself\ReversedFutureMusicApi\README.md` 记录精确入口：

`https://reversed-future-music-api.vercel.app/api/music`

- `method=search&q=...&offset=0`
- `method=metadata&id=...`
- `method=detail&id=...`
- `method=playback&id=...`

认证为 Bearer 服务密钥。服务当前固定 `@neteasecloudmusicapienhanced/api` 4.40.1，现有本地代码的调用包括 `song_detail`、`cloudsearch`、`album`、`lyric`、`song_url_v1`。这是读取项目代码得到的现状，不代表未来社区 API 保证兼容。

复用前要执行带用户配置凭据的真实契约测试；未读取或复制任何已有密钥。歌曲 ID、歌词和数字音源绑定不得改变实体发行版本。现有服务允许的播放地址可能不可用或仅为试听。

## Windows 光驱

`GetDriveTypeW` 返回 `DRIVE_CDROM` 识别光驱类型。介质消息为 `WM_DEVICECHANGE`，检查 `DBT_DEVICEARRIVAL`、`DBT_DEVICEREMOVECOMPLETE`、`DBT_DEVTYP_VOLUME` 与 `DBTF_MEDIA`。远程桌面会话存在通知限制，因此保留启动枚举、恢复后扫描和手动刷新。依据：[GetDriveTypeW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getdrivetypew)、[介质插拔检测](https://learn.microsoft.com/en-us/windows/win32/devio/detecting-media-insertion-or-removal)。

音频 CD 的 TOC 可通过 `IOCTL_CDROM_READ_TOC_EX` 读取；libdiscid 从 TOC 生成 MusicBrainz Disc ID，并支持读取 ISRC 和 MCN。相同 Disc ID 可关联多个发行，不足以证明具体版本。依据：[Windows TOC](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntddcdrm/ni-ntddcdrm-ioctl_cdrom_read_toc_ex)、[libdiscid](https://musicbrainz.org/doc/libdiscid)、[Disc ID](https://musicbrainz.org/doc/Disc_ID)。

MusicBrainz 在此只作为音频盘识别的可选辅助来源，Discogs 仍是用户指定的主要音乐发行库。

## 播放与区域

LibVLC 的 `libvlc_media_player_set_hwnd` 可嵌入 Windows 原生窗口；需实测 WebView 层级、DPI、全屏与控件。libmpv 支持 `bd://`、`dvd://`、`cdda://`，但其官方手册说明不支持 DVD 菜单，故不能用它承诺完整 DVD 菜单体验。依据：[LibVLC API](https://videolan.videolan.me/vlc-3.0/group__libvlc__media__player.html)、[mpv 手册](https://mpv.io/manual/stable/)。

BD 结构可使用 `bd_get_disc_info`、`bd_get_titles`、`bd_get_title_info`、`bd_get_playlist_info` 和 `bd_select_playlist`。`BLURAY_DISC_INFO` 提供可用的光盘信息及 AACS、BD+、BD-J 状态。DVD 导航独立使用 libdvdread／libdvdnav 路径。依据：[libbluray API](https://videolan.videolan.me/libbluray/bluray_8h.html)、[信息结构](https://videolan.videolan.me/libbluray/structBLURAY__DISC__INFO.html)、[DVD 库](https://www.videolan.org/developers/libdvdnav.html)。

区域设置有 `BLURAY_PLAYER_SETTING_REGION_CODE` 与 `BLURAY_REGION_A`、`BLURAY_REGION_B`、`BLURAY_REGION_C`。区域设置独立于 AACS／BD+；libbluray 官方明确自身不足以播放多数受保护商业 BD。BD-J 还需要合适运行组件。依据：[区域设置](https://videolan.videolan.me/libbluray/player__settings_8h.html)、[libbluray 官方说明](https://www.videolan.org/developers/libbluray.html)。

正式分发前针对选择的播放器构建核对许可证、编解码配置、动态库依赖和第三方声明；不能仅凭顶层库名字断言所有二进制均有相同分发条件。

## 私有 GitHub 自更新

Tauri updater 强制签名验证，公钥随应用、私钥仅在构建端。`bundle.createUpdaterArtifacts: true` 生成更新产物；Windows 支持 NSIS 或 MSI 及对应签名。静态清单使用 `version`、`platforms.[target].url`、`platforms.[target].signature`，目标值由实际构建确定。依据：[Tauri updater](https://v2.tauri.app/plugin/updater/)。

GitHub 私有 Release asset 需要授权；读取资产可用仓库 `Contents` 只读凭据，二进制响应可能是 200 或 302。GitHub Release API 响应不是 Tauri 更新清单，必须适配。依据：[Release asset API](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)。

个人首版优先验证用户自配只读凭据、系统凭据库保存的路线，减少额外服务；更长期可切更新网关，避免客户端接触仓库凭据。两者均不得嵌入开发者长期令牌，重定向不允许向其他域转发 Authorization。

构建可采用 [Tauri 官方 Action](https://github.com/tauri-apps/tauri-action)。Windows Authenticode 和 updater 签名分别配置，后者不能替代前者。依据：[Windows 代码签名](https://v2.tauri.app/distribute/sign/windows/)。

## Agent harness

采用持久 session、模型与工具循环、执行环境隔离、检查点和验证的架构实践。上下文窗口不是唯一日志，工具结果独立持久化，凭据不交给模型；跨会话增量执行与结果验证保证可恢复性。参考：[Anthropic 架构说明](https://www.anthropic.com/engineering/managed-agents)、[长任务 harness 实践](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)。

这些来源支持架构思路，项目具体工具名、权限、数据模型和测试集由本项目定义。没有把某厂商协议等同于行业统一认证标准。
