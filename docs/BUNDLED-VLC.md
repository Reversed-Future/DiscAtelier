# 内置 VLC 与 Java 运行时

DiscAtelier 安装包现在包含固定版本的 VLC、MPV 和 Temurin JRE。VLC 用于本地音乐、本地视频、网易云、DVD 和蓝光菜单；MPV 用于蓝光直读播放列表和 MakeMKV 兼容兜底；JRE 用于 BD-J。用户不需要再单独安装播放器或 Java。运行时不进入系统 PATH，也不修改系统环境变量。

## 版本与来源

| 组件 | 版本 | 归档 | SHA-256 |
| --- | --- | --- | --- |
| VLC | 3.0.22 win64 | `vlc-3.0.22-win64.zip` | `3a75c0a4e8ee3a04f409b8953c572cea725492cbed27f93d1ce6e29f9cfb59b9` |
| Eclipse Temurin JRE | 8.0.504+1 (8u504b01) | `OpenJDK8U-jre_x64_windows_hotspot_8u504b01.zip` | `82e2cdc6693737c5998445b31f69668fa0da77c7705121053f6508ac84961123` |
| MPV | 0.41.0-244-gaf9c81fa1 | 本机 `MPV Player` 安装 | 不固定（构建时复制） |

- VLC：<https://download.videolan.org/pub/videolan/vlc/3.0.22/win64/>
- Temurin：<https://github.com/adoptium/temurin8-binaries/releases/tag/jdk8u504-b01>
- MPV：<https://mpv.io/>，<https://github.com/mpv-player/mpv>

`scripts/prepare-vlc.ps1` 下载两个归档、校验 SHA-256，并解压到：

- `artifacts/vlc-runtime-3.0.22/vlc-3.0.22/`
- `artifacts/java-runtime-8u504b01/jdk8u504-b01-jre/`

`scripts/prepare-mpv.ps1` 从 `C:\Program Files\MPV Player`（可用 `-Source` 覆盖）复制 `mpv.exe`、`d3dcompiler_43.dll` 到 `artifacts/mpv-runtime/`。三个目录不提交到 Git；正式构建和预览构建通过 `tauri:release`／`tauri:build` 调用脚本准备。安装包中的资源映射为 `vlc/`、`mpv/` 和 `jre/`。

## 运行方式

- `bundled_runtime::configure` 在启动时设置进程内 `VLC_PLUGIN_PATH`、`JAVA_HOME`、`LIBAACS_PATH`、`LIBBDPLUS_PATH`，并把 `vlc/` 与 `jre/bin` 放到当前进程 PATH 前面；`libaacs.dll`、`libbdplus.dll` 同时放在 `vlc/` 根目录供 VLC 加载。
- 播放设置中的 VLC 路径留空时，播放后端自动使用安装目录的 `vlc/libvlc.dll`；填写自定义路径时优先使用用户路径。
- 本地音频和视频通过 VLC 播放本地文件 URL；本地音频不会创建原生视频窗口。
- `bundled_runtime::configure` 设置 `DISCATELIER_MPV` 指向安装目录的 `mpv/mpv.exe`；MPV 设置留空时优先使用它，再回退到 `Program Files\MPV Player`。
- 蓝光菜单通过 VLC 的 `bluray:///X:/` 和 `:bluray-menu=1` 打开；直接播放播放列表和 MakeMKV 兼容兜底仍由 MPV 处理。
- BD-J 需要 libbluray 的 BD-J 支持和 JVM；内置 JRE 只解决 Java 可用性，不代表所有商业 BD-J 菜单都已验证。

## 许可证

VLC 以 GPL-2.0-or-later／LGPL-2.1-or-later 发布，归档中的 `COPYING.txt`、`AUTHORS.txt`、`NEWS.txt` 等文件随 `vlc/` 一起安装。Temurin JRE 以 GPL-2.0-with-Classpath-exception 发布，归档中的 `LICENSE`、`NOTICE`、`ASSEMBLY_EXCEPTION`、`THIRD_PARTY_README` 随 `jre/` 一起安装；相应源码可从上述固定版本发布页获取。MPV 以 GPL-2.0-or-later 发布，`mpv/NOTICE.txt` 随运行时安装；对应源码见 mpv 上游。对外分发前必须复核 VLC 插件、MPV、编解码器和 OpenJDK 的完整许可证文本与源码提供方式；本文件不是法律意见。

## 体积与预览验证

VLC 3.0.22 归档约 78.6 MB，Temurin JRE 8 归档约 40.1 MB，MPV 运行时约 120 MB。加入 MPV 后的本地测试签名 NSIS 安装包为 167,442,244 bytes；安装后包含 `vlc/`、`mpv/` 和 `jre/`。测试预览与安装包路径、哈希见 `ROADMAP.md`。
