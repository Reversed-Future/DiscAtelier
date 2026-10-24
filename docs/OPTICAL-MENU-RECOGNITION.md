# 光盘菜单截图识别（实验）

DVD／Blu-ray 没有 CD 的 MusicBrainz Disc ID 这类稳定、统一的识别键。本实验提供“菜单识别”：静默启动一次 VLC 菜单，截取一帧菜单画面，交给设置中的支持图片的 AI 模型识别作品信息，再把识别标题作为本库候选搜索词。

## 流程

1. 光驱页的 DVD／Blu-ray 条目点击“识别菜单”。
2. 后端校验光盘类型、token 和 VLC 路径；AI 未配置时不会启动菜单。
3. 在离屏 `MenuSurface` 上启动 VLC：DVD 使用 `dvdnav:///X:/`，Blu-ray 使用 `bluray:///X:/` + `:bluray-menu=1`；音频关闭。
4. 等待菜单稳定（DVD 约 6 秒，Blu-ray 约 12 秒），通过 `libvlc_video_take_snapshot` 截取 1280×720 PNG。
5. 删除临时截图；图片仅以 data URL 发送到设置 → 助手中的 AI 接口。
6. 模型返回严格 JSON：标题、作者、版本文字、置信度、依据和可见文字。
7. 关联弹窗显示截图和识别结果，并用识别标题调用现有 `optical_candidates` 搜索本库；用户必须手动选择并确认，AI 不会直接写关联。

## 前提与限制

- 需要在设置 → 助手中配置支持图片输入的模型和 API Key。
- 需要内置 VLC，或设置中配置可用的 `libvlc.dll`。
- 识别期间不能有正在播放的会话；光驱会短暂转动，且 VLC 菜单启动可能受 BD-J/Java 影响。
- 离屏窗口和 `libvlc_video_take_snapshot` 是否包含所有 HDMV／BD-J 菜单叠加层仍需真实 DVD／Blu-ray 样盘验证；若截图为黑屏，应改用可见窗口截图或 Windows Graphics Capture。
- AI 结果可能误把系列名、按钮文字或章节标题当作作品名；低置信度必须人工复核。
- 截图发送属于用户主动操作；不要在有敏感屏幕内容时使用。

## 预览

- `target/release/DiscAtelier-menu-recognition2-preview.exe`
- SHA-256 `9f2a9985509c1a426eefd0d088e641e06673cbca598421e581cdee71de698ede`
- 64,207,360 bytes

解析器和 TypeScript 构建通过；尚未有真实 DVD／Blu-ray 样盘，因此“菜单启动、截图、AI 返回、候选确认”全链路仍是待实盘验收的实验功能。
