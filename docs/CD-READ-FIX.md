# CD 曲目读取修复

0.1.15 的光驱面板已有音频 CD 曲目选择和播放功能，但 Windows TOC 读取错误地沿用了零访问权限的设备信息句柄。`IOCTL_CDROM_READ_TOC` 需要读取权限；失败被忽略后，界面只显示文件系统卷标 `Audio CD`，不会出现音轨或播放入口。

2026-10-22 在 Optiarc BD ROM BC-5500S 的 F: 上复现：零访问权限调用返回 Windows 错误 5；使用 `GENERIC_READ` 的独立句柄成功返回 36 字节 TOC。修复保留设备信息查询的零访问权限，仅为 TOC 查询打开只读句柄，不申请写入权限。未识别为 DVD／BD 的介质发生 TOC 读取错误时，面板现在显示错误码。

修复后通过应用实际 `WindowsOptical.enumerate()` 路径读取，返回 `audioCd`、3 首曲目、`cd-track:1` 至 `cd-track:3` 播放入口，时长为 256.1067、210.5467、275.4 秒，错误为空。真实 TOC 已加入解析回归测试；音频／数据轨过滤、截断拒绝及 DVD 结构测试保留。记录位于 `artifacts/cd-toc-access-probe.json`、`artifacts/cd-toc-inspect.json`。

## 测试

打开 `target/release/DiscAtelier-cd-read-preview.exe`，进入更多 → 光驱 → 刷新，应显示“CD · 3 首”、曲目选择与“播放”。选择曲目后验证出声、暂停和换曲。

CD 仍使用已接入的 libVLC。若提示配置库路径，请在设置 → 播放中填写本机 VLC 3 x64 的 `libvlc.dll` 完整路径；同目录须有 `libvlccore.dll` 和 `plugins`。本次没有读取个人播放设置、启动声音播放或操作应用窗口。

此预览使用独立测试目录 `com.reversedfuture.discatelier.video-preview`；没有替换已发布的 0.1.15，也没有修改正式收藏或备份。实际音频输出由用户验收。
