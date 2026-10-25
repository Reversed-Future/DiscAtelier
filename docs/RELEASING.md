# Windows 发布

当前版本：0.1.26。仓库固定为公开的 `Reversed-Future/DiscAtelier`，以 GPL-3.0-or-later 发布。0.1.4 起使用 `scripts/release/build-signed.ps1` 构建，安装包与签名、公开更新清单一起发布。完整步骤及签名身份说明见 [应用内更新](UPDATES.md)。下方 0.1.3 记录作为首次发行历史保留。

## 0.1.26 发布记录

发布记录在发布校验完成后补充。

## 0.1.25 发布记录

2026-10-25：本地音乐和视频改走 VLC；MPV 运行时随安装包提供，仅用于蓝光直读和 MakeMKV 兼容兜底；VLC／MPV／插件缺失显示明确错误；关联歌曲支持手动下拉和轨号双向同步；歌名精确匹配优先；修正曲目行垂直对齐、本地文件弹窗固定标题／表头、表头不透明和表格填充。已发布并设为 Latest。Release ID `423413578`，标签 `v0.1.25`，源码提交 `8900c543e6b65ed20c399e9fd25e62e09c047d2e`；安装包 166,938,075 bytes，SHA-256 `070365af3a4f0c7de350e316c8a5c4916cb2b5cdb94935a6c7a8d1aa652d4a2b`。五项资产回读一致，公开 Latest 下载与更新验签通过，篡改包被拒绝。安装到 `D:\Program Files\DiscAtelier` 后确认包含 `mpv/mpv.exe` 和 `vlc/libvlc.dll`，快捷方式和卸载注册项恢复。详见 [0.1.25 发布校验](releases/v0.1.25-verification.md)。

## 0.1.24 发布记录

2026-10-25：本地文件关联、CD 式本地播放器、右下角播放列表、无需停止的直接切换、原生顶层播放器返回详情、曲目/章节播放按钮、白色网易云 Logo、关联表歌曲标题与专辑顺序、光驱插入提示已发布并设为 Latest。Release ID `423147754`，标签 `v0.1.24`，源码提交 `11bf3817d2e00e3a41b0f377cbb58e657b65abd2`；安装包 131,098,885 bytes，SHA-256 `de8f32ceafb6464dec8ffd87870dc5b020d8ee290893689e83c5975243a8595b`。五项资产回读一致，公开 Latest 下载与更新验签通过，篡改包被拒绝。详见 [0.1.24 发布校验](releases/v0.1.24-verification.md)。

## 0.1.23 发布记录

2026-10-25：本地文件总入口与详情入口、歌名匹配轨号、曲目/章节播放按钮、白色网易云 Logo、光驱插入提示和光驱图标入口已发布并设为 Latest。Release ID `423116788`，标签 `v0.1.23`，源码提交 `9759f2ff5e06e1dfe993eaa10ae6b1e17eed268c`；安装包 131,094,709 bytes，SHA-256 `2941e160fc728cd39d3a5a1d786c4c944cff5a8829bdd422071cd71c0d31bac3`。五项资产回读一致，公开 Latest 下载与更新验签通过，篡改包被拒绝。详见 [0.1.23 发布校验](releases/v0.1.23-verification.md)。

## 0.1.22 发布记录

2026-10-24：设置整合“音乐资料”与“关于”、Discogs 自动识别输入、从网易云添加、连续手机扫码、手动录入叠层、光盘菜单截图识别实验、公开仓库与 GPL-3.0 许可证、无需 Token 的更新链路已发布并设为 Latest。仓库公开，Release ID `422756896`，标签对应源码提交 `1d113837297a7d331b2ea86029e0172dff3311ca`。安装包 131,100,987 bytes，SHA-256 `f44466dccbc2c48fe959a951bdb876ac5c492569f50620a8589cdb5f1d78baee`；五项资产回读一致，公开 Latest 下载与更新验签通过，篡改包被拒绝。详见 [0.1.22 发布校验](releases/v0.1.22-verification.md)。

## 0.1.21 发布记录

2026-10-24：内置 VLC 3.0.22 与 Temurin JRE、蓝光菜单播放和 BD-J 运行链路已发布私有正式版并设为 Latest，Release ID `422585567`，标签对应源码提交 `51a7789e94b01cb1cf2ab16809605d9e86909e0f`。安装包 131,079,168 bytes，SHA-256 `51338e8e94cdeaa75049ddd69142282a68bdd48cc6ca27a80e471acab65c846f`；五项资产完整回读，本地及实际私有更新验签通过，篡改包被拒绝。蓝光菜单/BD-J 仍待真实样盘验收。详见 [0.1.21 发布校验](releases/v0.1.21-verification.md)。

## 0.1.20 发布记录

2026-10-24：光驱标题标记与识别缓存、CD 播放器导航／关联封面／音量／居中曲目列表、连续播放进度、220ms 播放器转场、首页与 CD 封面扫描缓加载等改进已发布私有正式版并设为 Latest，Release ID `422475496`，标签对应源码提交 `3bff4d982931dc186cae88c42db25cbd9b7b9fee`。安装包 58,233,309 bytes，SHA-256 `974c07c92e0771d2a72532d4fc04c89dd49a0082b80ea72669ef1d27b10b40af`；五项资产完整回读，本地及实际私有更新验签通过，篡改包被拒绝。详见 [0.1.20 发布校验](releases/v0.1.20-verification.md)。

## 0.1.19 发布记录

2026-10-24：光驱关联／弹出、MusicBrainz CD 识别、DVD 章节分段进度条、播放器图标控制、搜索与分区流畅度、同捆购入、影像前后编编辑布局、窗口最大化布局、封面立体查看等改进已发布私有正式版并设为 Latest。安装包 58,225,540 bytes，SHA-256 `30878ce182ccc964b1aaca731964bd453fe870a6148ddfcfc808d19dc9a550a0`；五项资产完整回读，本地及实际私有更新验签通过，篡改包被拒绝。schema 15 首次打开前自动备份。详见 [0.1.19 发布校验](releases/v0.1.19-verification.md)。

## 0.1.4 发布记录

- [v0.1.4 Release](https://github.com/Reversed-Future/DiscAtelier/releases/tag/v0.1.4)，Release ID `418765867`，源码提交 `263639fe91b0979e5cc5c47242d7088b3d32d931`。仓库复核为私有。
- 安装包 `DiscAtelier_0.1.4_x64-setup.exe`，15,359,884 字节，SHA-256 `1a5ec8392a1350df0a5a207ad2e55b4cab0977caf4cd231a0d011929a1d5b749`。
- 同时发布安装包 `.sig`、`latest.json`、`release-manifest.json`、`SHA256SUMS.txt`。五项资产完整回读后的大小、SHA-256 与本地一致。
- `verify_local_release_package` 通过；`verify_published_private_release` 使用实际 Rust GitHub 客户端成功下载私有安装资产，Tauri 验证签名和版本通过；损坏副本被拒绝。没有执行安装器。
- 20 项前端测试、60 项 Rust 测试、严格 Clippy、TypeScript／Vite、签名 NSIS 构建通过。两个显式发行验证测试分别运行通过。
- 更新签名已启用；Authenticode 仍为 `NotSigned`。未修改收藏目录或数据库 schema，未访问真实收藏内容或光盘。
- 发布后再次核对资产，已单独删除 `D:\DiscAtelierBuilds\target\release\bundle\nsis\DiscAtelier_0.1.4_x64-setup.exe`。远端核验记录在 `artifacts/release/0.1.4/`。
- 实际窗口、Token 配置交互、覆盖安装／重启以及下一更高版本的端到端更新仍待用户手动验收。

## 0.1.3 构建基线

需要 Windows x64、Rust MSVC、Visual Studio C++ 工具、Node.js 22.19+。使用锁文件安装依赖：

```powershell
npm ci
cargo fetch --locked
npm run release:notices
npm run release:check
npm test
cargo test --workspace --locked
npm run release:build
```

`tauri.release.conf.json` 在普通配置之上启用 NSIS 安装包，按当前用户安装，支持简体中文、繁体中文、英文，缺少 WebView2 时下载引导程序。源码中没有附带播放器和 MakeMKV，也没有个人库或凭据。

发行前端输出到独立的 `apps/desktop/dist-release/0.1.3`，不使用累计旧文件的开发 `dist`。下一次版本变更需同步根目录和桌面 `package.json`、锁文件、Cargo workspace 版本、Tauri 版本、发行输出路径以及设置中的版本文字。若重新构建同一版本且需清理旧产物，不执行批量删除；改用新输出目录或请用户处理。

本次 `CARGO_TARGET_DIR` 为 `D:\DiscAtelierBuilds\target`，安装器由 Tauri 输出到 `release/bundle/nsis/DiscAtelier_0.1.3_x64-setup.exe`。

## 0.1.3 检查

- 20 项前端逻辑测试、53 项 Rust 测试通过。
- TypeScript／Vite 与 NSIS Release 构建通过，生成安装器大小 15,146,907 字节。
- 安装器 SHA-256：`6b3be4c86ee7136c78b58be0e265ddce816233fa3de9aa4135411acb266648ee`。
- Authenticode 状态实测 `NotSigned`；没有配置或宣称 Windows 代码签名。
- 应用内 updater 未接入，没有可用更新签名／更新清单；不生成虚假的 `latest.json`，不关闭签名验证。
- NSIS 生成脚本包含应用及 MiSans／第三方许可文件。未运行安装器、未触碰用户桌面，安装／升级／卸载由用户手动验收。
- 用户卸载时，删除用户数据选项与卸载程序本身分开；保留收藏时不要选择删除用户数据。
- 许可证文本从锁定依赖的本地源码和对应上游提交获取；聚合通知包含对应源码链接。
- 上传前检查 Git 文件列表；排除数据库、模型包、令牌、构建结果和个人原型封面。

## 发布与核验

1. 使用 `gh` 确认目标仓库是公开仓库；推送源码和版本标签。
2. 创建草稿 Release，上传安装包、`SHA256SUMS.txt` 与 `release-manifest.json`。
3. 检查远端资产的名称、大小、摘要，并通过已认证的 GitHub API 回读安装包流、重新计算 SHA-256。
4. 验证成功后把 Release 设为 Latest；公开仓库的 Release 和更新清单可匿名访问。
5. 再次确认已发布且资产完整，只用一个明确绝对路径删除本次本地安装包。没有发布成功则保留安装包，不做批量清理。

## 已发布记录

- [v0.1.3](https://github.com/Reversed-Future/DiscAtelier/releases/tag/v0.1.3) 已发布，仓库隐私状态复核为 `PRIVATE`。
- 源码标签对应提交 `ed07991450740e5779f1b3b1e885baf53f02a8fd`；Release ID 为 `418741582`。
- 安装包、`SHA256SUMS.txt`、`release-manifest.json` 均已通过 GitHub API 回读完整字节，大小与 SHA-256 与本地逐项一致。发布后再次核对远端三项资产与摘要。
- 本次本地安装包 `D:\DiscAtelierBuilds\target\release\bundle\nsis\DiscAtelier_0.1.3_x64-setup.exe` 已在核验成功后单独删除，并确认路径不存在。
- 本地核验记录保留在 `artifacts/release/remote-verification.json` 和 `artifacts/release/published-release.json`；源码、开发版与构建日志保留。

`release-manifest.json` 是发行溯源记录，不是 Tauri 自动更新清单。安装及实盘手动验收仍未完成。

## 0.1.5 发布

2026-10-21：已发布私有正式版，标记为 Latest；五项资产回读一致，沿用更新签名身份，应用 Rust 私有下载与版本绑定验签通过，已删除本次本地安装包。完整资产哈希、源提交和验证范围见 [0.1.5 发布校验](releases/v0.1.5-verification.md)。

## 0.1.6 发布记录

标签、间距调整已发布到私有仓库并设为 Latest。五项资产完整回读、本地及真实私有更新验签通过；唯一的本次本地安装包已单独删除。详见 [0.1.6 发布校验](releases/v0.1.6-verification.md)。实际安装与窗口验收由用户手动执行。

## 0.1.7 发布记录

网易云登录、跨页面播放列表、封面调整及 0.1.6 后的集成功能已发布到私有仓库并设为 Latest。五项资产完整回读、本地签名和实际私有更新链路验证通过。已单独删除本次安装包，并按用户明确特许逐个删除 14 份旧预览／测试程序；收藏数据、主程序及共享资源保留。详见 [0.1.7 发布校验](releases/v0.1.7-verification.md)。

## 0.1.8 发布记录

升级备份修复和网易云手动入库已发布到私有仓库并设为 Latest。五项远端资产回读一致，本地及实际私有更新下载验签通过，篡改包被拒绝。已分别删除本次安装包及 `DiscAtelier-update-music-preview.exe`，保留收藏和备份。详见 [0.1.8 发布校验](releases/v0.1.8-verification.md)。已被较新数据库拦截的旧版首次仍需手动覆盖安装。

## 0.1.18 发布记录

2026-10-22：蓝光 libaacs／libbdplus 本地解密与 FindVUK KEYDB 自动下载、日语优先合并、下载进度和来源显示，MakeMKV 兼容兜底；Bangumi Token 链接与过期提醒；Discogs Token 链接；封面扫描淡入动效已发布私有正式版并设为 Latest。五项资产完整回读，实际私有更新验签通过，篡改包被拒绝；本地安装包、预览程序和构建缓存逐个清理，失败 0。详见 [0.1.18 发布校验](releases/v0.1.18-verification.md)。

## 0.1.17 发布记录

2026-10-22：助手 Markdown、即时发送与重试，网易云 15 MiB 封面及 schema 14，流式 `tool_calls: null`，更新安装自动停播，视频音量／倍速，收藏删除和多项界面修正已发布私有正式版并设为 Latest。五项资产完整回读，实际私有更新验签通过，篡改包被拒绝；本地安装包、预览程序和构建缓存逐个清理，失败 0。详见 [0.1.17 发布校验](releases/v0.1.17-verification.md)。

## 0.1.12 发布记录

多专辑关联、Disc 分盘绑定、封面切换修复及此前已完成增量已发布私有正式版。五项资产完整回读及实际应用更新验签通过；本地安装包、四份旧预览和无用构建缓存已逐文件清理，收藏、备份及必要资源保留。详见 [发布校验](releases/v0.1.12-verification.md)。
