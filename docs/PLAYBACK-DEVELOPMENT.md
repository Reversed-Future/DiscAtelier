# 内置光盘播放

日期：2026-10-21。BD 使用本机 MPV，DVD 原盘菜单接入 libVLC 3；画面均指向 DiscAtelier 的原生子窗口，控制与历史共用一个页面。画面不经过 WebView 复制，也不依赖制作 MKV。DVD 实盘画面与交互等待用户手动验收，见 [DVD 说明](DVD-MENU-PLAN.md)。

## 使用

设置 → 播放中保存 MPV／MakeMKV 库路径，或 DVD 使用的 libvlc.dll 路径。更多 → 光驱：BD 选择实际播放列表后点“播放”，DVD 直接点“播放”。

顶栏只保留返回和当前标题；进度、音量、播放速度、暂停／继续、音轨、全屏／退出全屏和停止全部位于底部控制条，DVD 另增加“菜单”，避免最大化时被窗口控制条遮挡。音量范围为 0–100%，播放速度提供 0.5／0.75／1／1.25／1.5／2 倍；两者都通过类型化控制下发，并由后端回传当前值。返回收藏会暂停，加载时返回会取消；底部入口重新打开原会话。播放历史在光驱面板内，可在同一介质仍插入时从上次位置继续。DVD 还保存标题编号，返回菜单后保留正片书签。

视频区域：空格暂停／继续，F 全屏，Esc 先退出全屏，再次按下返回收藏。DVD 菜单支持方向键与 Enter。全屏使用整个窗口画布，控件静止约两秒后收起，移动鼠标唤回；原生裁剪跟随控件的短时位移，不反复缩放视频。音轨来自后端实际列表，不推断哪条是评论音轨。

## 实现边界

- `contracts/playback.rs` 定义内部会话、状态、控制和历史契约。
- application 负责观看时长与结束判定、历史仓储端口；SQLite schema 5 持久化会话，迁移前保留备份。
- `player-mpv` 分开处理会话线程、Windows Job、命名管道、MPV 事件与命令调度。JSON IPC 使用数字 request_id、异步应答与事件，不解析终端日志控制播放器。
- `player-vlc` 分开处理官方 ABI、VLC 对象、轮询与会话；只读 DVD 路由不能接受任意路径或输出命令。VLC 使用独立线程，尚未做进程隔离。关闭时保持主窗口消息循环，等待视频释放后再退出，避免在 UI 回调里等待解码器。
- Tauri 在启动前核对光驱挂载点、介质 token 和播放列表，只暴露开始、状态、类型化控制和历史四个用例。未向前端开放通用 MPV 命令或任意媒体路径。
- 启动用 `mpv.exe`；先加入带 `KILL_ON_JOB_CLOSE` 的 Windows Job，再发送 loadfile。配置与 LibMMBD 环境只对该子进程生效。
- 控制应答超时 3 秒；连接启动超时 8 秒，光盘加载超时 60 秒。停止采用独立取消标志，先请求退出，超过 2 秒关闭 Job 收尾。周期心跳检查控制连接。
- 前端播放时每 400 ms 取状态，非活动时每秒取状态；读取不重叠。拖动过程中仅更新本地进度，松开时发一次跳转。
- 位置显示 MPV 回报值。`absolute+exact` 不能保证每张 BD 都逐帧落在请求时间；硬件验收保存请求值与实际值。

MPV 的 Windows 消息管道可能写入空消息。零字节读取本身不是断线，不能照搬普通文件 EOF 判断；进程退出和心跳用于判断存活。依据：[MPV Windows IPC 源码](https://github.com/mpv-player/mpv/blob/master/input/ipc-win.c)、[Microsoft ReadFile 管道语义](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-readfile)。本机 `doc/manual.pdf` 用于核对 IPC 字段与命令，解析副本在工作区外保留。

## 历史与关闭

加载开始、状态改变、结束及每 5 秒保存检查点。同一会话更新同一行；查询返回最近 100 条，旧记录不自动删除。暂停、缓冲、拖动跨度和长时间没有采样的间隔不计入观看时长。BD 自然结束且本次覆盖至少 90% 才显示“看完”；直接拖到结尾不满足条件。观看覆盖按单次会话统计，不合并多次续播。DVD 的菜单和多标题不能代表整盘覆盖，本轮不自动标为“看完”。

正常停止保留位置、时长和最后音轨，包括 MPV 卸载媒体后清空属性的情况。应用异常退出后，下次启动将未结束记录标为“中断”，位置最多损失一个检查点周期及尚未完成的存储时间。窗口关闭时停止本应用拥有的播放器，Job 作为异常退出兜底。

播放历史随收藏库备份。恢复前校验记录结构，播放中拒绝整体恢复；停止后等待会话线程最终保存完毕，再执行恢复，防止旧会话写回已恢复的数据库。

## 光盘只读

MPV 只发送 `loadfile`、属性观察／读取、暂停、seek、aid、volume、speed、quit；VLC 只打开核对后的 DVD，读取状态并导航菜单、标题、时间、音轨、音量与速率。未使用 MakeMKV 制作、转存、媒体输出、刻录、弹出、区域写入或固件命令。MPV 自身脚本与恢复文件关闭，VLC 忽略用户配置；应用本地保存设置和 SQLite 历史。设备查询边界见 [光驱说明](OPTICAL-DEVELOPMENT.md)。

## 历史验收：BD 独立窗口阶段

`scripts/verify-playback.mjs` 用隔离数据库与真实 F: BD 验收；`crates/player-mpv` 包含空消息／分段 JSON 和卸载属性回归测试；application 验证观看计时与结束覆盖；storage 验证检查点、重启中断、备份恢复及损坏历史拒绝。

9 组硬件验收通过：`D:\DiscAtelierBuilds\artifacts\playback-1792515110556\results.json`，同目录保存 `controls.png` 与 `history.png`。本机 Optiarc BC-5500S、用户提供的《缘之空》春日野穹 BD、`00000.mpls`：

- 打开至播放超过 2 秒约 12.27 秒，MPV 回报实际输出 `gpu-next`／`wasapi`。
- 暂停后位置与观看时长不增长；鼠标拖动请求 529.8 秒，回报 530.110089 秒，跳过时长未计入观看；音轨 1→2 经属性回读确认。
- 停止保存一条会话，重启保留并续播；主程序异常退出后播放器结束，历史恢复为中断。
- 加载中停止约 0.18 秒；直接关闭 MPV 和主程序均正常结束会话。
- 跳到结尾回报自然结束但 completed=false。MPV 在片尾将时长估计从 7800.793 修正到 7800.869578 秒，按实际回报保存。
- 过期会话、非法音轨／位置、并发开始及播放中恢复被拒绝。WebView 无脚本错误。
- `index.bdmv` 前后 SHA-256 均为 `09060acd7128abe8797ba23c285a857445f418b28de56c727510d39092291e26`；这只校验索引文件，不是全盘字节校验。

36 项相关 Rust 测试、TypeScript／Vite 构建和全 workspace Clippy 通过。

当时的普通 Release SHA-256 为 `E555D0B27F08888B1027FC7EE5E6D1C290C3FE67C11F964EC95A327C246BEA54`。这是内置改造之前的历史版本，不是当前构建的哈希。

当时的展示窗口使用 `D:\DiscAtelierBuilds\performance-binaries\playback-controls-release.exe` 与隔离测试库，历史记录在 `D:\DiscAtelierBuilds\artifacts\manual-preview-1792505465591\playback-preview.json`。不代表现在的窗口状态。

## 内置与 DVD 增量

内置 MPV、原生父子窗口、暂停／拖动／音轨／历史、真全屏和控件收起的本地视频验收为 `D:\DiscAtelierBuilds\artifacts\embedded-playback-1792516925858\results.json`，共五组。用户取出 BD 后使用合成视频，没有将其表述为内置 BD 实盘复验。

DVD 代码、本机 libVLC 无媒体初始化及非 UI 回归已接入；实盘交互等待 [用户人工验收](DVD-MENU-ACCEPTANCE.md)。本轮没有启动应用或控制任何窗口，也没有重新读取实盘。

当前构建（2026-10-21）：

- 普通 Release：`E:\ToolsForMyself\DiscAtelier\target\release\discatelier-desktop.exe`，SHA-256 `523E17B698CE6C5D2EE92DFF18DFC92CF661D644F8D8FEBD96542BD828CD71E0`。
- 隔离测试版：`E:\ToolsForMyself\DiscAtelier\target\dvd-menu-test\discatelier-desktop.exe`，SHA-256 `FBC6E3886BED3F517495A443F07A168067A1F41EA5E2777E4EFB4C5EE58D00D4`。由用户运行 `Test-DVD-Menu.ps1`；脚本验证哈希并设置独立库和 WebView 目录。
- 普通版 UTF-8／UTF-16 检查均未包含 `DISCATELIER_TEST_DATA_DIR`、`model-selection.txt`、`local-fixture-v1`、`playback-fixture.mkv`；测试版确认包含隔离目录入口。
- 45 项相关 Rust 测试、TypeScript／Vite 构建、全目标全特性 Clippy、启动脚本纯语法检查通过。保留现有 3D 包体积提示，没有新增构建错误。没有运行启动脚本、没有打包安装器、没有上传或发布。

仍待完成：DVD 人工验收与内置 BD 实盘复验、章节／字幕扩展界面、内容分配与收藏绑定、拔盘恢复、多光驱、音频 CD、BD-J、A/B/C 区样盘矩阵。不能据一张盘或代码接入宣称全区完成。
