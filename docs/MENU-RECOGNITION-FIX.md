# DVD / BD 菜单识别修复

已纳入 0.1.27 正式发行；下文保留开发与预览验收记录。见 [发布校验](releases/v0.1.27-verification.md)。

2026-10-26，开发预览，未发布。

## 原因与修改

菜单截图完成后的 AI 请求原先直接在 Tauri 异步命令中调用 `stream_request`。该同步函数内部创建 Tokio runtime 并执行 `block_on`，嵌套运行时会引发 panic，使调用无法正常返回。现将该请求和解析放入 `spawn_blocking`，任务异常也转换为界面错误。

光驱每 15 秒刷新时会清空通用错误；识别错误现有独立状态，刷新不会清除。识别期间暂停面板刷新，禁用相冲突的播放与检查操作，截图使用光驱服务的串行锁，截图前后核对盘片。DVD 截图不再启用 Blu-ray 菜单选项。

界面显示设置检查、菜单截图、AI 请求和关联查找阶段，以及已用时间。AI 请求沿用 8 秒连接、120 秒整次请求超时；该上限不包含原生光驱读取和 VLC 启停。原生 VLC 仍在进程内运行，真实盘片的启动、截图与停止是否阻塞需要实测，本次不宣称所有光盘都能识别。

## 本地验证

- TypeScript 与 Vite 构建通过。
- `discatelier-player-vlc` 的 9 项测试通过。
- 3 项菜单识别回归测试在 Release 配置通过，覆盖严格解析、异步上下文识别成功、HTTP 503、无效识别 JSON；不使用个人令牌或实际菜单图片。桌面严格 Clippy 通过。
- 未自动启动应用或播放光盘，未修改个人收藏、备份或已安装的正式程序。

## 用户实盘复测

使用本轮生成的独立预览，配置支持图片的 AI 服务，插入 DVD 后点击“识别菜单”。该预览使用独立资料目录，不自动复制正式收藏或配置。

1. 按钮应进入“识别中…”，并显示阶段和计时。
2. 截图完成后，应显示正在等待 AI；成功则显示识别资料供关联确认。
3. 若失败，原因应持续显示，不应在 15 秒刷新后消失。
4. 若长时间无结果，提供停留的阶段、已用时间和报错原文；这能区分光驱/VLC 与 AI 服务问题。

## 验收记录

首份 Release 预览成功编译，输出 `target/release/DiscAtelier-menu-recognition-preview.exe`，SHA-256 `B62DE0D6E098829BB45DF175B606787363739C4865DF74D22D298DF36EDCB528`。隔离目录标记及 5,603 个资源的文件哈希已验证，但用户实测启动失败，不能视为可用交付。诊断日志记录 WebView2 `HRESULT(0x800700AA)`，进程退出码 101。

原因：原来仅在 `setup` 中切换收藏目录，WebView2 在这之前创建，默认仍使用正式版的应用数据目录。第一轮修正使用窗口 `data_directory`，用户实测仍报相同错误。继续检查本地依赖源码发现 `tauri-runtime 2.12.2` 的 `From<&WindowConfig> for WebviewAttributes` 没有复制该字段，因此窗口配置未生效。此版哈希 `AF82FF8CA423195713C8C18F8A0AE4E6E2C0BB3EB16B0511509083C27A869ABE` 同样不是可用交付。

最终改为在 `Builder::build` 前通过 `preview_config` 设置 `AppDirectoriesOverride::Directories.local_data`，值为 `$LOCALDATA/com.reversedfuture.discatelier.video-preview`。WebView2 没有显式窗口目录时直接使用这个已隔离的 `app_local_data_dir`。仅 `isolated-preview` 启用，正式构建不改目录；不删除缓存，不更改应用标识。回归测试使用 Tauri MockRuntime 的真实路径解析器验证正式路径和预览路径不同，不只检查配置字段，已通过；3 项菜单识别测试再次通过。

最新 Release 预览已重建并替换同一文件：78,873,088 bytes，SHA-256 `E85F85D82A0C69AB2A8413EE2098A40D346456B1D9CA904147E1E8A4E88B3352`。5,603 个资源再次核对通过，4 项桌面相关测试及最终严格 Clippy、格式检查通过。用户修正单文件完整性标签后，启动验证已通过；真实 DVD 菜单截图与识别仍待用户验收。

## 启动环境问题及解决

用户随后授权仅启动隔离预览并收集诊断。实际浏览器启动命令证实已使用独立预览目录，原资源占用错误变为 `0x8000FFFF`。Windows WER 记录 `msedgewebview2.exe / msedge.dll 155.0.4283.62` 的 `0x80000003`；从启动时捕获的诊断快照取得直接原因：`Failed to create directory C:\Users\junya\AppData\Local\com.reversedfuture.discatelier.video-preview\EBWebView, last error is 5`。

浏览器令牌的完整性为 `S-1-16-4096`（Low），没有受限 SID 或 AppContainer。`icacls` 证实 `target/release` 和两份构建 exe 均继承 `Mandatory Label\Low Mandatory Level`，而已安装的正式 exe 没有该标签。单独换一个新诊断浏览器目录也未成功，目录权限条目差异本身不足以解释问题；最终定位为执行文件的低完整性标签导致进程无法写入普通 AppData。

用户明确授权只修改命名预览 exe 的完整性标签。最初工具及用户普通 PowerShell 执行单文件 `/setintegritylevel M` 均返回 Access is denied；用户窗口管理员检查为 False。用户随后通过 Windows 提权确认完成操作，2026-10-26 15:50 实测 exe 标签为 Medium，内容哈希不变。未修改目录安全策略，没有提升工具权限。旧预览数据、正式收藏和备份均保留。

随后以普通启动参数运行同一隔离预览，20 秒观察结束进程仍存活，主窗口标题 DiscAtelier、窗口句柄有效、Responding=True，stderr 为空。诊断启动不启用额外浏览器日志参数，避免与之后普通启动的 WebView2 参数冲突。未关闭该预览、未操作界面或播放光盘。后续重新构建／复制预览时须重新核对文件完整性标签；文件哈希一致不能替代启动验收。

诊断依据：[Microsoft Mandatory Integrity Control](https://learn.microsoft.com/windows/win32/secauthz/mandatory-integrity-control)、[icacls 命令](https://learn.microsoft.com/windows-server/administration/windows-commands/icacls)。日志位于本地 `artifacts/`，未上传诊断快照。

已安装正式程序 `D:\Program Files\DiscAtelier\discatelier-desktop.exe` 哈希保持 `962EACC21EE8A54D56AC32926109B7F737C42F8E936F1E0F4E3B191E60ED4E2E`。未清理构建缓存或旧预览。

Debug 桌面编译被 MSVC D8050 阻断；Release 配置的菜单识别测试已通过。真实 DVD 验收仍待用户完成。
