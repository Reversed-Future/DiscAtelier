# 光驱与 BD 只读验证

日期：2026-10-21。本文记录 Windows 光驱枚举、BD 播放列表识别与首帧诊断基线。正式播放、历史及后续内置画面已增量实现，见 [播放说明](PLAYBACK-DEVELOPMENT.md)；内容绑定、DVD／BD-J 菜单及 A/B/C 全区矩阵未完成。

## 实物结果

- 光驱：Optiarc BD ROM BC-5500S，F:。
- 用户提供：日本发行《缘之空》春日野穹 BD；未提供区域标记，界面保留“未确认”。
- 实际卷标 `BDROM`，文件系统 `UDF`；`BDMV/PLAYLIST` 有 23 个 `.mpls` 文件。
- MakeMKV v2.0.0 界面成功解析标题、章节和 LPCM 音轨。去重、最小时长过滤后的标题数量不等于原始播放列表文件数量。
- 未配置兼容库时，MPV 报 `AACS encryption detected but cannot find libaacs.`。这说明当前进程未加载库，不代表光驱不可读，也不代表整台电脑没有解密能力。
- 本机 `D:\Program Files\MakeMKV\libmmbd64.dll` 接入后，MPV 对 `00000.mpls` 首帧诊断退出码 0，输出 `VO: [null] 1920x1080 yuv420p` 与视频进度。标题 2:10:00，H.264 High、23.976 fps，3 条日语 LPCM 双声道音轨；独立首次验证约 11.04 秒。
- 没有执行 Make、转存、备份光盘或生成视频文件。首帧成功不等于完整播放、音频输出、拖动、菜单和其他区域盘均验证完成。

## 分层

`contracts/optical.rs` 定义内部契约；application 定义设备、诊断端口；`optical-windows` 封装 Windows 查询；`player-mpv` 封装诊断子进程。Tauri 只负责设置、任务串行化、盘片身份检查和 IPC。React 面板不直接访问设备和播放器。

光驱入口位于“更多 → 光驱”；安装路径位于“设置 → 播放”。配置保存到应用本地目录 `playback-settings.json`，与收藏数据库、模型包和测试目录隔离。MPV 留空按已验证的 ProgramFiles 安装布局检测；MakeMKV 库可留空，配置后只影响本应用启动的子进程。

## 只读边界

原生适配器用 `CreateFileW` 的零 desired access 打开设备，仅发送 `IOCTL_STORAGE_QUERY_PROPERTY` 和 `IOCTL_STORAGE_CHECK_VERIFY2`。`FILE_SHARE_WRITE` 只允许其他进程共享，未授予本句柄写入权限。

文件读取仅检查目录、读取最多 1 MiB 的 `BDMV/index.bdmv` 和枚举播放列表文件名。不包含弹出、写扇区、格式化、烧录、区域修改、固件命令。MPV 禁用用户配置、脚本、播放位置及观看历史保存；使用 `--audio=no --vo=null --frames=1` 做静默首帧诊断，未传任何输出媒体路径。

每次诊断前后重新枚举，要求挂载点、介质 token、实际播放列表同时匹配。token 来自卷序列号、有限索引内容和列表名称，是过期结果检测标记，不是精确发行／副本身份证；同内容重新插入不能据此区分。前后检测也不是对光驱整个读取期间的原子锁定。

MPV 直接启动 `mpv.exe`，避免 `.com` 转发进程；诊断超时 45 秒，输出各限 64 KiB，同时持续排空管道。Windows 驱动枚举本身未实现硬超时；运行于阻塞工作线程，不占 UI 线程。面板打开且可见时每 15 秒刷新，没有重复并行读盘。

## MakeMKV 集成依据

[MakeMKV 官方 LibMMBD 说明](https://www.makemkv.com/libmmbd/)明确支持 libbluray 应用直接读取受保护 BD，由本机 MakeMKV 后台实例提供能力，不要求先制作 MKV。

本机 DLL 导出已核对 `aacs_init`、`aacs_open`、`aacs_open_device`、`aacs_decrypt_unit`；MPV 二进制包含 `LIBAACS_PATH`、`LIBBDPLUS_PATH` 与 `libmmbd64` 加载入口。VideoLAN [环境变量变更记录](https://mailman.videolan.org/pipermail/libbluray-devel/2013-November/001197.html)和 [Windows 加载器源代码存档](https://fossies.org/linux/mythtv/mythtv/external/libmythbluray/src/file/dl_win32.c)用于核对格式：

- Windows 加载器自行追加 `.dll`，因此传完整路径的无扩展名部分。
- 默认动态库查找限制为应用目录与 System32，单纯追加 PATH 在本机无效。
- 设置 `LIBAACS_PATH`、`LIBBDPLUS_PATH` 只作用于 MPV 子进程；没有复制、替换 DLL，没有修改系统环境或 MakeMKV 集成复选框。
- MakeMKV 的许可、可用版本、后台实例和它支持的盘片仍是运行依赖；当前未打包或分发 MakeMKV。

诊断文字基于本机 MPV `v0.41.0-244-gaf9c81fa1` 的实际输出；它不是稳定的播放控制协议。只有退出成功且包含实际视频输出与进度，才返回 `frameDecoded`。后续正式播放控制应使用命名管道 JSON IPC，不能拿终端日志充当控制接口。

## 验证与剩余工作

`scripts/verify-optical-readonly.mjs` 使用隔离数据库，验证真实 F: 光驱、23 个列表、过期 token／非设备路径／不在盘上的列表拦截、无兼容库错误、设置界面保存、配置后的首帧解码、重启保留、展开／收起日志和 Escape 关闭。读盘前后仅对 `index.bdmv` 校验哈希，不冒充整盘逐字节完整性验证。

前端构建、Rust 诊断状态单元测试和 Clippy 配合硬件检查。

本轮 7 项原生验收通过，结果和截图在 `D:\DiscAtelierBuilds\artifacts\optical-readonly-1792511865120`；未接兼容库的诊断约 0.49 秒，配置后的实际首帧解码约 12.94 秒。独立验证约 11.04 秒，两者是不同运行，不作为性能优化前后对比。3 项诊断状态单元测试、TypeScript／Vite 构建、Clippy 通过。

普通 Release 已更新至 `E:\ToolsForMyself\DiscAtelier\target\release\discatelier-desktop.exe`，SHA-256：`2A38DC7AC403573C74EF9B7BA0A7EC6349507567351D7F607E5555C536C1F983`。确认不包含测试目录与模型选择文件入口。展示窗口使用独立 `performance-harness` 构建及既有隔离模型测试库；未生成安装包。

上述首帧检查为前一轮基线。2026-10-21 已完成独立窗口正式播放、暂停、拖动、音轨、历史与续播，9 组实盘验收见 [播放说明](PLAYBACK-DEVELOPMENT.md)。首帧诊断本身仍保留原有范围，不据此报告全区成功。

后续顺序：

1. DVD 识别和 libVLC 原盘菜单代码已接入，等待用户 [手动验收](DVD-MENU-ACCEPTANCE.md)。内置 MPV 和真全屏已用本地视频验证，BD 实盘复验待用户再次提供样盘。
2. 扩展结构化播放列表信息，建立用户确认的内容分配，不能把最长列表自动定为正片。
3. 收藏绑定、设备通知；音频 CD TOC、CD 播放和多光驱实物矩阵。
4. 分别验证 A/B/C 样盘与 BD-J；本次 MPV `--list-options` 未暴露 BD 区域设置，不能凭一张盘首帧通过宣称全区完成。
