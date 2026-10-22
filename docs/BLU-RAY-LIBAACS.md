# 蓝光本地解密：libaacs + KEYDB.cfg

DiscAtelier 的蓝光默认路径现在使用随应用提供的 `libaacs`/`libbdplus`，由 MPV 内置的 libbluray 直接读取光盘并边读边解密。默认路径不会启动 MakeMKV 实例，也不需要用户另起服务。MakeMKV 的 `libmmbd64.dll` 只作为显式开关控制下的兼容兜底。

## 运行时组成

- `libaacs.dll` 0.12.0、`libbdplus.dll` 0.2.0，随安装包放在 `aacs/` 资源目录。
- MPV 继续使用 `bd://mpls/<播放列表>` 和 `--bluray-device`，暂停、拖动、音轨、音量、倍速、播放历史及全屏逻辑复用现有会话。
- 本地解密模式只给子进程设置随包的 `LIBAACS_PATH`/`LIBBDPLUS_PATH`；MakeMKV 路径不会被设置。
- 兼容兜底模式才把 `LIBAACS_PATH`/`LIBBDPLUS_PATH` 指向 `libmmbd64.dll` 的绝对路径（去掉 `.dll` 后由 libbluray 追加）。这不是启动 `makemkv.exe`。

## KEYDB.cfg

设置 → 播放中的“蓝光密钥文件”支持从 [FindVUK Online Database](https://fvonline-db.bplaced.net/) 自动下载，也支持导入本地文件。自动下载默认取 **日语 `lang=jpn`**，再取 **英语 `lang=eng`** 补齐日语文件缺少的条目；同一张光盘优先保留日语标题，解密字段不重写。两个请求各返回约 23 MiB 的 ZIP，解压后的单个 `keydb.cfg` 当前约 66 MiB，合并结果再写回 libaacs。下载和导入都会：

1. 在内存中检查压缩包大小、自动下载解压后的 `keydb.cfg` 大小（最多 128 MiB）、UTF-8、NUL、控制字符和至少一个密钥条目；手动导入用于较小文件，受前端 8 MiB／IPC 大小限制；
2. 写到 libaacs 在 Windows 上实际读取的 `%APPDATA%\aacs\KEYDB.cfg`；
3. 如果已有文件，先保留为 `KEYDB.cfg.discatelier.bak`，再原子替换；
4. 不修改用户选择的源文件，不记录密钥内容，不把 KEYDB.cfg 放进仓库或发行包。

设置页的“从 FindVUK 自动下载／更新”按钮只在用户点击时联网；不会在启动或播放时静默上传或下载数据。默认是日语优先、英语兜底条目的合并文件；没有加入其他语言。若英语源暂时不可用，仍保留已下载的日语文件并在界面说明，不会丢掉日语主库。

导入后，密钥区域显示“已下载：日语、英语”“已下载：日语”“已下载：本地导入”或“来源未知”，并附更新时间；语言来源元数据只记录来源标签和时间，不含密钥内容。

下载期间，密钥文件区域显示进度条：先显示连接状态，然后分别显示日语和英语 ZIP 的字节进度，接着是合并和校验写入阶段。没有可用的 `Content-Length` 时切换为不确定进度动画；完成后进度条收起，只保留结果提示。

`%APPDATA%\aacs` 是 libaacs 的标准应用数据位置；libbluray 没有向 MPV 暴露自定义 KEYDB 路径，因此不能改用任意目录。设置页只显示“是否已配置”和条目数量，不展示密钥。

## 兜底判定

只有同时满足以下条件才自动尝试 MakeMKV 兼容 DLL：

- 本地 libaacs/libbdplus 已确认是解密能力不足：缺少 libaacs、缺少 libbdplus、KEYDB 缺失／不匹配、AACS2／不支持的 AACS；
- “MakeMKV 兼容兜底”已开启；
- `libmmbd64.dll` 路径有效。

不会触发兜底的失败包括普通读盘错误、光盘取出、用户停止、区域不匹配和 BD-J 菜单提示。兜底前第一个 MPV 会话已经释放（Windows Job Object 关闭时终止子进程），不会让两个后端同时读盘。

兜底启动后界面显示“正在使用兼容模式”。如果开关关闭或 DLL 未配置，错误信息会明确说明原因，不会暗中启动兼容模式。

## 能力边界

- **AACS**：由 libaacs 尝试；成功导入 KEYDB 不等于所有 AACS 光盘都能播放，AACS2 仍可能不支持。
- **BD+**：随包 libbdplus 可用时尝试；失败按解密能力不足处理。
- **区域**：不修改光驱区域、固件或光盘；界面只显示“未确认（不修改光驱区域）”，区域不匹配不会兜底。
- **BD-J 菜单**：检测 `BDMV/JAR` 并提示“检测到，未提供菜单导航”；当前直接播放主播放列表，不宣称支持完整 BD-J 菜单。
- 不把本功能描述为“全区解锁完成”。

## 手动实盘测试步骤

1. 退出正在运行的主程序，运行测试版 `target/release/DiscAtelier-bluray-libaacs-preview.exe`；确认任务管理器没有 `makemkv.exe`/`makemkvcon.exe`。
2. 打开设置 → 播放，点击“从 FindVUK 自动下载”（默认日语，英语补齐），或导入一个包含目标光盘条目的本地 `KEYDB.cfg`；确认显示“已配置 · N 个条目”。使用本地文件时比较导入前后原文件的 SHA-256（应相同）。
3. 插入蓝光，刷新光驱；选择播放列表并点击“播放”。确认使用内置播放器，没有另起 MakeMKV；检查暂停、拖动、音轨切换、音量、倍速、全屏和停止。
4. 关闭程序或停止播放，检查 `%APPDATA%\aacs\KEYDB.cfg` 仍在，收藏数据库、封面和播放历史未受影响。
5. 换一张 KEYDB 中没有条目的光盘，保持兜底开启并配置 `libmmbd64.dll`；确认出现“正在使用兼容模式”，且默认本地模式没有提前启动 MakeMKV。
6. 关闭“MakeMKV 兼容兜底”，重复第 5 步；确认明确提示兜底已关闭，没有启动 MakeMKV。
7. 播放中取出光盘或点击停止；确认不会切换兼容模式，错误只报告读盘／停止原因。
8. 对带 BD-J 或 BD+ 的光盘查看光驱信息中的 AACS／BD+／BD-J 行；只按实际报告判断，不把检测到目录当作已支持菜单或全区。

## 自动测试

- `cargo test -p discatelier-player-mpv`：KEYDB 格式／大小／NUL 拒绝、原子导入与备份、AACS/BD+ 分类、读错误／区域不兜底、开关与库缺失时不兜底。
- `cargo test -p discatelier-desktop bluray::tests`：FindVUK ZIP 中查找 `keydb.cfg`、拒绝不含 keydb 的压缩包；不访问真实网络。
- `cargo test -p discatelier-desktop downloads_findvuk_keydb_into_temporary_appdata -- --ignored --nocapture`：可选的真实网络测试；下载日语和英语 ZIP、合并后写入临时 APPDATA，验证条目数与大小后清理，不触碰用户配置。
- 合并测试：日语条目优先、英语补齐日语缺失的光盘、设备密钥不重复。
- `cargo test --workspace --exclude discatelier-desktop`：既有播放、光驱、收藏和合同回归。
- `npm run build`、`npm test`：设置页、播放模式字段和现有脚本测试。
- 全部测试不依赖实盘，不启动安装器。

依赖许可证：随包 DLL 为 LGPL-2.1-or-later，来源、版本、哈希和源码链接见 `apps/desktop/src-tauri/resources/aacs/NOTICE` 与 `COPYING.LGPL-2.1`。
