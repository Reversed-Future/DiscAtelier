# DiscAtelier

个人实体音像收藏软件，目标技术栈为 **Tauri 2 + Rust + React + TypeScript**。以具体发行版本和实物副本为核心，音乐与影像分区，支持实体模型陈列、购入记录、光驱识别、播放与可操作收藏库的 AI 助手。

当前 0.1.12 支持真实 SQLite 收藏持久化、手动入库、同版多套、多载体、版本及购入编辑、封面导入、搜索筛选、备份和预检恢复。Discogs 已接通搜索 → 选择具体版本 → 核对资料 → 填写购入信息 → 入库；同一发行复用版本，不同发行分开。AtelierPublisher v2 模型上传与展示、Windows 光驱只读识别、内置播放和播放历史已接入。DVD 原盘菜单已接入，实盘验收待完成。应用内更新支持 GitHub 私有仓库、版本绑定签名和安装前备份；设置及菜单已重新设计。原型另行保留，不访问真实数据库。

## Windows 安装版

私有仓库：[Reversed-Future/DiscAtelier](https://github.com/Reversed-Future/DiscAtelier)。安装包和校验文件在 [v0.1.12 Release](https://github.com/Reversed-Future/DiscAtelier/releases/tag/v0.1.12)，需登录有仓库访问权限的 GitHub 账号。

关闭旧窗口后运行 Windows x64 `-setup.exe`，按当前用户安装。没有 WebView2 时安装器会联网下载。从 0.1.3 需手动安装一次；之后在“设置 → 更新”配置本仓库只读 Token，即可检查、下载和安装新版本。更新有 Tauri 签名，Windows 代码签名仍未配置。安装包不含个人收藏、凭据、光盘内容或外部播放器。具体能力和限制见 [发行说明](docs/releases/v0.1.12.md)。

## 桌面开发版

日常运行使用 `target/release/discatelier-desktop.exe`，也可执行根目录 `Start-DiscAtelier.ps1`（优先 Release，缺少时回退 Debug）。首次打开为空库；测试数据不会写入日常收藏目录。

开发环境需要 Rust MSVC、Node.js 22.19+、Visual Studio C++ 工具和 WebView2。

```powershell
npm ci
npm run dev
```

独立构建（不生成安装包）：

```powershell
npm run build
cargo build -p discatelier-desktop --release
```

程序将数据保存在 `%LOCALAPPDATA%\com.reversedfuture.discatelier`，“设置 → 数据”显示实际目录。`library.sqlite3` 包含收藏、封面、模型和播放历史，`backups` 保存备份。更新不更改数据目录；0.1.12 首次打开旧库会自动备份并迁移到 schema 10，保留已有收藏及关联。详见 [数据与更新说明](docs/UPDATES.md)。

音乐分区点击“添加”直接打开 Discogs，也可切换手动录入。选择新版本时自动下载对应封面，确认入库后本地保存并显示，备份包含图片；可自行更换封面。已入库的发行进入“再收一套”，继承原有资料及封面。更多菜单保留范围、整理、设置与统计；Token 配置、备份、恢复及版本号统一放在设置中。恢复前显示备份内容数量，确认后整体替换，并自动备份原库。Discogs Token 保存到 Windows 凭据管理器；查询具体发行 ID 可使用公开接口，条码／品番／关键词检索需个人 Token。多个标识符保留原值供本地检索，未知载体必须手动选择。详见 [Discogs 接入记录](docs/DISCOGS-DEVELOPMENT.md)。

添加和编辑版本支持上传 AtelierPublisher 导出的 v2 `.ateliermodel` 文件（≤50 MiB），0.1.12 新增六种固定装配 V3 兼容。有模型时取出后按需加载，可旋转和拆装；移除模型恢复原封面，模型随备份和重启保留。详见 [模型接入记录](docs/MODELS-DEVELOPMENT.md) 与 [V3 测试步骤](docs/MODEL-V3.md)。

Ctrl + 加号／减号调整缩放，Ctrl + 0 恢复 100%；斜杠打开搜索，左右方向键翻阅，Enter 取出，Escape 关闭。弹窗支持 Tab／Shift+Tab 循环。短内容默认隐藏滚动条，仍可滚轮与键盘滚动；特别长的内容显示细滚动条。

“更多 → 光驱”查看实盘和播放列表；“设置 → 播放”配置 MPV `mpv.exe`、可选 MakeMKV `libmmbd64.dll` 与 DVD 使用的 VLC `libvlc.dll` 完整路径。内置播放支持暂停、拖动、音轨和历史；“检查播放”单独进行静默首帧诊断。光盘只读，不转存、不生成视频文件；不宣称所有 BD 区域与 DVD 菜单已经实盘验证。见 [播放记录](docs/PLAYBACK-DEVELOPMENT.md) 和 [DVD 验收](docs/DVD-MENU-ACCEPTANCE.md)。

## 阅读

- [完整产品和技术方案](docs/PRODUCT-PLAN.md)
- [界面与动效规范](docs/INTERFACE.md)
- [数据与扩展契约](docs/ARCHITECTURE.md)
- [集成依据与实现边界](docs/INTEGRATIONS.md)
- [版本路线与验收标准](ROADMAP.md)
- [安卓同 Wi-Fi 扫条码与上传购物截图](docs/PHONE-CONNECTION.md)

## 预览

需要 Node.js 22 或更新版本，无第三方运行依赖。

```powershell
npm run prototype
```

打开终端输出的本机地址并进入 `/directions/index.html`。可以切换音乐和影像、搜索和筛选、打开详情、手动添加演示条目。原型使用内存保存；刷新后恢复初始展示。更多菜单中标明原型范围。

当前原型位于 `/directions/index.html`，页面名称为 DiscAtelier。采用黑白与少量米白，常驻按钮只有音乐、影像、搜索、添加、更多；通过相邻唱片、方向键或滑动翻阅。筛选、统计、整理、光驱和助手收入“更多”，搜索按需展开。支持取出与归位、外观侧面、购入信息编辑、想购入状态和手动演示添加。旧文件保留，不再提供布局选择器。当前仍是评审原型，没有 Tauri 后端或真实模型拆装。

当前界面统一使用随原型提供的 MiSans；许可位于 `prototype/assets/fonts/LICENSE.pdf`。输入框聚焦不改变边框、不出现光圈；下拉列表、提示、滚动条和表单样式均自定义。菜单、对话框、详情标签、搜索展开、分区和整理切换带过渡；减少动态模式关闭运动。

本地原型曾使用用户 AtelierPublisher 模型包的预览封面。这些封面和 `prototype/collection.json` 已排除在 Git 上传之外；新克隆的项目以 `collection.example.json` 空列表启动，用户可自行添加演示记录。

## 验证

```powershell
npm test
```

测试覆盖演示库的搜索、状态筛选、多币种金额分组和输入校验。浏览器交互与视觉验收记录见 [验证记录](docs/VALIDATION.md)。

## 后续实现

按 `ROADMAP.md` 推进。接下来补真实混合载体样本、来源更新差异确认与版本比较，完成 DVD 原盘菜单及跨版本应用内更新的手动安装验收。

安装版构建和上传后逐文件清理流程见 [发布记录](docs/RELEASING.md)。
