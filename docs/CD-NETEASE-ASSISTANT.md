# CD、网易云与助手开发验收

2026-10-21。本轮为 0.1.6 之后的本地功能预览，未发布新的 GitHub Release，也未替换 0.1.6 资产。没有启动应用、操作窗口或访问实物光驱。版本号仍为 0.1.6。

## 已实现

| 功能 | 当前行为 | 尚待验证／后续范围 |
| --- | --- | --- |
| 音频 CD | Windows TOC 读取，曲目号与时长；标准纯音频 CD 通过 libVLC 内置播放、暂停、拖动、上一首／下一首、自然结束后下一首；返回收藏后继续播放；记录各曲目的历史与续播位置 | 用户实盘验收；混合模式盘／非标准起始曲号暂拦截播放，多光驱、异常拔盘待验证；收藏绑定、CD-Text、无缝曲间播放尚未实现 |
| 网易云补充 | 可配置 api-enhanced 地址；专辑搜索、简介、歌手、发行信息、分盘曲目、时长；预览后单独保存、离线读取、备份恢复 | 用户部署地址联调；歌词、账号登录、在线歌曲播放未纳入本轮 |
| AI 助手 | 兼容 Chat Completions 工具接口；库内搜索与统计、具体收藏查询、Discogs／网易云检索；状态修改预览、确认、撤销；持久会话、操作记录、取消和中断提示 | 用户服务与模型联调；新增收藏、批量编辑、流式回答、历史会话选择器尚未实现 |

界面沿用黑白、MiSans、自定义输入与固定高度弹窗。补充资料与助手内容单独滚动，设置新增“网易云”和“助手”。既有 DVD／BD 内置视频和全屏收起逻辑保留。

## 手动验收

### CD

1. 退出旧程序后打开本轮预览。设置 → 播放，填写已安装 VLC 3 x64 的 `libvlc.dll` 完整路径；同目录需有 `libvlccore.dll` 与 `plugins`。
2. 放入音频 CD，更多 → 光驱 → 刷新。核对曲目数、实际曲目号和时长，选择曲目并播放。
3. 验证暂停／继续、拖动、上一首／下一首；让一首自然结束，确认进入下一首。最后一首结束应停止。
4. 返回收藏页，确认仍可听到声音，再从底部播放入口返回。停止后查看播放历史，核对曲目、时间与进度。
5. 退出后重开，从历史续播。没有相同介质时应拒绝续播；不能自动播放另一张盘。

只读范围：应用设备句柄不申请写权限，仅查询设备、介质状态与 TOC。CD 交由 libVLC 的 `cdda` 读取路径，固定设置 `cdda-track=N`；不提供刻录、提取文件、弹出、区域写入或固件操作。TOC 摘要用于防止过期播放请求；相同 TOC 可能碰撞，不能据此认定全球唯一实体发行。当前显示“曲目 N”，不会从顺序猜测歌名。已核对 VLC 的曲号索引逻辑：混合模式或非 1 起始 TOC 需要明确扇区边界适配，因此本轮显示音轨但禁用播放，避免将数据轨当音频。

### 网易云

使用用户指定的 [api-enhanced](https://github.com/neteasecloudmusicapienhanced/api-enhanced)。GitHub 仓库网址不是服务地址。本轮验证了 `@neteasecloudmusicapienhanced/api@4.41.1` 的真实公开响应。

按该项目 README 安装依赖后执行 `node app.js`，默认端口为 3000。服务由用户单独运行；桌面程序不会自动启动或捆绑 Node 服务。

1. 设置 → 网易云 → 服务地址，填写实际部署 URL；本机默认部署可填 `http://127.0.0.1:3000`，远程部署使用 HTTPS。
2. 打开音乐收藏详情 → 网易云资料。搜索专辑／歌手，打开结果，检查简介、曲目、分盘和时长。
3. 确认对应专辑后点“保存补充资料”。关闭再打开，断开服务后也应可以查看已保存内容。
4. 原 Discogs 来源、实体载体、曲目、封面和个人购入信息应保持原样；网易云数字专辑不自动视为同一实体版本。
5. 同一收藏在另处被修改后，旧预览保存应提示冲突，重新打开即可读取新版本。

请求严格对应 `/search?keywords=…&type=10&limit=20&offset=0` 与 `/album?id=…`。歌名、歌手、分盘编号、曲号和毫秒时长取自已核实响应；不进行字段名猜测。当前搜索最多 20 条，可细化关键词。

### AI 助手

1. 设置 → 助手，填写实际 Base URL、模型名称与 API Key。Base URL 需包含服务要求的前缀，例如 `/v1`；程序追加 `/chat/completions`。本地免密服务可不填 Key。
2. 模型需要支持 `tools`、`tool_calls`、`tool_call_id`；仅能文本对话的接口无法完成库操作。当前使用非流式回答。
3. 更多 → 助手，尝试“列出我的在途音乐收藏”“统计已购入音乐的数量和金额”。结果应来自工具查询，不依赖模型记忆。
4. 指定一项收藏改为已购入，应出现标题及前后状态。取消时不写入；确认后检查购入页，再点击撤销，确认恢复原状态。
5. 出现预览后手动编辑同一收藏，再确认旧预览，应报冲突。网络失败或停止后，可继续提问；重启不会自动重放写操作。
6. 查询 Discogs 需已有 Discogs Token；网易云查询需先配置其服务。可要求查询具体发行资料，检查操作记录。

每轮最多 8 次模型请求、每次最多一个工具调用；工具名来自明确注册表，参数严格校验。只有 `propose_status` 能生成写入提议，写入通过现有应用用例、请求幂等与 revision 检查。没有 SQL、Shell、任意网址或删除工具。最近一次状态修改可撤销；后续人工编辑会使旧撤销失效。

提问、已查询的收藏资料与必要统计会发送至用户配置的服务。密钥保存于 Windows 凭据管理器，按精确请求地址绑定，不写入会话、SQLite 或源代码。取消会阻止后续工具；已发出的阻塞 HTTP 请求最长等待 30 秒返回／超时，所以停止按钮可能短暂显示“正在停止”。

## 数据与模块

- 新增 schema 7：`edition_supplements` 保存网易云资料，`assistant_sessions` 保存会话与提议。原版本及购入记录结构不变；新增内容随数据库备份恢复。
- 启动迁移前沿用自动备份。升级后的 schema 7 不能直接由旧 0.1.6 程序打开；若需退回旧版，应使用升级前备份，不能让旧版覆盖新库。
- `integration-settings.json` 保存服务地址与模型名，与数据库同目录。密钥不在该文件中；数据库备份不包含接口配置与 Windows 凭据。确切目录可在设置 → 数据查看。
- `optical-windows/audio_cd.rs` 只解析 TOC，`player-vlc/audio_cd.rs` 只处理 CD 播放路由，播放器 worker 管理状态与历史检查点。
- `provider-netease` 管理社区 API 契约；`integration-http` 管理地址、响应大小、超时与鉴权，不跟随重定向。
- `agent-harness` 管理模型协议、工具注册、会话与执行循环；桌面 `assistant/host.rs` 接入应用用例，`assistant/decisions.rs` 处理确认与撤销。模型没有直接数据库权限。

## 验证证据

74 项 Rust 测试、21 项前端测试、严格 Clippy、TypeScript／Vite 与 Tauri Release 构建通过。Rust 默认跳过 3 项显式验收，其中本轮真实网易云响应检查已另行执行并通过；另两项为旧版发行包校验，本轮没有运行。预览文件：`E:\ToolsForMyself\DiscAtelier\target\release\DiscAtelier-integrations-preview.exe`。未执行该程序，也未生成安装包。源码预检 402 个文件，没有发现受检查的凭据格式或生成／私人文件。

运行前端构建、既有前端测试、Rust workspace 测试与严格 Clippy。新增测试覆盖 TOC 音频／数据轨区分、边界损坏、CD 路由验证、补充资料冲突／重启／备份恢复、schema 6 迁移前备份、模型工具往返检查点、取消后不执行工具、未知工具拒绝、确认／撤销／过期写入拒绝。全部使用隔离数据库、本机模拟 HTTP 或纯数据；不读取实盘。

真实公开响应的显式只读检查：

```powershell
$env:NETEASE_CAPTURE_DIRECTORY = 'E:\ToolsForMyself\DiscAtelier\artifacts\integration-sources'
cargo test -p discatelier-provider-netease --test captured_responses --offline -- --ignored --nocapture
```

结果：专辑 `32311`，9 首曲目；搜索 2 条结果。捕获响应留在忽略目录，不作为用户数据提交。另一个独立 example 可执行文件启动被 Windows 拒绝，因此采用上述测试入口验证，不能把该 example 的启动计为成功。

物理 CD 播放、真实 AI 服务、用户部署网易云服务与新增界面动效均待用户手动验收。自动测试不替代这些结果。

协议依据：[api-enhanced 源码](https://github.com/neteasecloudmusicapienhanced/api-enhanced)、[VLC 3 CD 读取模块](https://github.com/videolan/vlc/blob/3.0.x/modules/access/cdda.c)、[Windows TRACK_DATA](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntddcdrm/ns-ntddcdrm-_track_data)、[OpenAI 官方接口定义](https://github.com/openai/openai-openapi)。
