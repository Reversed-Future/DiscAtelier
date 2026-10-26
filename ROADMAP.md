# DiscAtelier 更新路线

**2026-10-26 SMTC 直角弹性开关（测试版，未发行）**：采用用户提供的 React Bits SquishSwitch 源码并转换为 TypeScript，按追加要求将轨道与滑块改为零圆角、36 × 20 px；保留弹性拉伸、拖动、黑白状态与现有“保存后生效”流程。补齐原生 disabled、键盘焦点、减少动态效果和拖动 Esc 取消，Esc 不会关闭设置窗口。Motion 固定为 14.6.0，新增依赖许可证已纳入发行 notices。实际设置组件的无窗口浏览器回归通过，覆盖点击、空格／回车、拖动、取消、保存禁用、保存字段及减少动态效果；TypeScript／Vite 和 Release 构建通过。预览 `target/release/DiscAtelier-smtc-switch-preview.exe`，85,992,448 bytes，SHA-256 `7660A9783AF08527097EA9383AEFAB1F8727EAB1E18465621A407ED5F1F03E3F`；5,603 个资源、隔离标记及正式程序哈希校验通过，无 Low 完整性标签。未修改收藏、备份或正式程序；记录 `artifacts/squish-switch-ui.json` 与 `artifacts/smtc-switch-verification.json`。

**2026-10-26 SMTC、网易云歌词与完整播放页（测试版，未发行）**：设置 → 播放新增默认关闭的 Windows SMTC，保存后控制当前播放，支持播放／暂停／停止、上一首／下一首和进度请求。网易云可从右下角列表进入完整播放页，本地音乐、CD、网易云右侧均可切换曲目／歌词；歌词读取内置或自定义网易云 API，支持译文、跟随、点击跳转、空状态和重试。本地音乐转网易云先取得音源再自动停止本地，查询失败保留原播放。歌词使用已存歌曲与 Disc 关联，不按未绑定的多碟曲号跨盘猜测。149 项 JS、104 项相关 Rust 测试、严格 Release Clippy、TypeScript／Vite、格式检查和无窗口浏览器回归通过；修正既有 DVD HTTP 测试 socket 的 Windows 非阻塞继承问题，仅涉及测试。Release 预览 `target/release/DiscAtelier-smtc-lyrics-preview.exe`，85,061,632 bytes，SHA-256 `B0B34E5B09CFF3ACB43E6802D998A812143551D3CB226C7B0A6792D1BC597773`；5,603 个资源、隔离标记和正式程序哈希校验通过，预览无 Low 完整性标签。未启动用户程序，未改收藏或备份；真实音频切换、系统面板和实体媒体键仍待用户验收。详见 [实现与测试](docs/SMTC-LYRICS.md)、`artifacts/smtc-lyrics-verification.json`。

**2026-10-26 曲目页编辑入口（测试版，未发行）**：取消曲目／章节页对底部“编辑版本”按钮的隐藏，复用资料页同一个编辑回调、右下角位置与忙碌禁用条件；购入页继续打开编辑购入。删除未再使用的隐藏样式，保留各标签底部分隔线与行高。本轮为展示入口修正，TypeScript／Vite、差异检查与 Release 构建通过；未新增镜像测试。预览 `target/release/DiscAtelier-track-edit-preview.exe`，84,273,152 bytes，SHA-256 `C3FCD96417F7D185E54D1F99745383F015D2DE80E4CB8F5DE66FA7D7760ECCFB`；5,603 个资源及隔离标记校验通过，正式程序哈希不变。未启动用户程序或修改收藏、备份，实际点击由用户验收；记录 `artifacts/track-edit-verification.json`。

**2026-10-26 提示淡入淡出与位置（测试版，未发行）**：光驱检测收藏提示与启动更新提示统一使用 180ms 透明度进出过渡，减少动态效果时为 125ms；淡出期间保留文本并禁用交互，快速重新打开取消旧的移除任务。光驱提示底部间距从 88px 改为 56px，下移 32px。抽出独立提示组件和共用生命周期 hook，未改检测、关联或更新下载逻辑。145 项 JS、TypeScript／Vite、启动更新浏览器回归及四组动效测试通过；Release 预览 `target/release/DiscAtelier-notice-motion-preview.exe`，83,999,744 bytes，SHA-256 `838D5CDDE66716E00E8FBCCF70F87E8C3C865FFBE05008E1765CD073B082630B`。5,603 个资源校验通过，正式程序哈希未变；未启动用户程序或修改收藏、备份。测试证据见 `artifacts/notice-motion-ui.json` 和 `artifacts/notice-motion-verification.json`，实际位置效果待用户验收。

**2026-10-26 静默预启动与启动更新检查（测试版，未发行）**：内置网易云在后台预加载本地 API 模块，使用现有唯一子进程和退出清理机制；不阻塞主窗口，自定义服务不预启动，失败由真实请求重试。三次真实 Node 本地采样就绪 1.977–3.421 秒、工作集 73.7–118.0 MiB、10 秒空闲单核平均 CPU 0–1.248%，未尝试 TCP 连接或监听，关闭输入后正常退出，详见 [测量与实现](docs/NETEASE-STARTUP.md)。主界面每次启动静默检查更新，发现新版本显示非模态提示；支持忽略该版本、稍后和查看更新，忽略持久化后不影响下一版或手动更新。下载、签名校验、安装前备份及重启仍由用户操作，详见 [更新行为](docs/STARTUP-UPDATES.md)。145 项 JS、11 项运行时及 1 项启动设置 Rust 回归、格式检查、TypeScript／Vite 和 Release 构建通过；Playwright 验证忽略跨刷新、后续版本、手动入口、静默失败、稍后及没有自动下载／安装。预览 `target/release/DiscAtelier-startup-preview.exe`，83,451,392 bytes，SHA-256 `7FFD1CAB3E9DE1AD3C8EDD5D0251CE36323B57F8D0CF831332BAC1ABCAA599CB`；5,603 个资源校验通过，正式版 SHA-256 `B02DE94166AF1ED3F84C64542C2663CB4B700658DC35678591179291C3476518` 未变。使用隔离资料目录，未修改实际收藏、备份、登录凭据或用户更新偏好；实机启动待用户测试。

**2026-10-26 CD／BD 同名曲目匹配修复（测试版，未发行）**：原自动匹配把整份实体的曲目合在一起判断重名；BD 现场曲目的重复标题会让缺少时长的 CD 条目也被拒绝。现在按 Disc 独立计算自动匹配，沿用大小写、标点、全半角和繁简转换比较，不改写来源文字或关联键。未指定音源的 DVD／BD 不自动套用录音室专辑，分盘选择后可匹配；已保存单曲与旧手动关联继续优先。使用截图七首标题及合成现场重名条目，复现原逻辑只匹配两首，修复后七首全匹配；实际 TrackLinkManager 组件验证三盘切换、默认影像盘提示、明确选盘音源与播放队列，页面无运行时错误。141 项 JS 测试、TypeScript／Vite 和 Release 构建通过；本轮未改 Rust 或数据库结构。预览 `target/release/DiscAtelier-disc-song-match-preview.exe`，82,632,192 bytes，SHA-256 `24DECEE3784A1106FC67C863AC64467790AD6B7CC91F6534380F7DB2ED25111C`；5,603 个资源校验通过，正式版哈希 `B02DE94166AF1ED3F84C64542C2663CB4B700658DC35678591179291C3476518` 未变。沿用隔离预览资料目录，未启动用户窗口或修改收藏、凭据、备份；用户旧收藏实机复测待完成。

**2026-10-26 实体 Disc 分组与资料编辑（测试版，未发行）**：根据实体载体、原始 heading/index 层级和曲号辅助证据统一旧资料显示、编辑器、网易云分盘匹配及播放顺序。CD + 2 BD 显示三个同级编辑区域，空盘保留；独立编辑分盘标题，盘内条目标明“小标题”，可按真实载体修改所属 Disc，原曲号和歌曲关联身份不改写。原整表及同实体旧分组关联兼容保留，保存与备份恢复经过合成库验证。137 项 JS、77 项桌面 Rust 与 163 项其余 Rust 测试通过，原标记忽略的 9 项未执行；核心模块严格 Clippy、格式检查、前端及 Release 构建通过。完整桌面 Clippy 的构建脚本仍遇 Windows 错误 5，未宣称该项通过。Playwright 验证旧 CD/BR 曲号、未知曲号结构分盘、三份实体含空盘、分盘标题与小标题区分、类型转换保持盘归属、保存确认及原曲号保留；既有编辑表格 14 次布局检查通过。预览 `target/release/DiscAtelier-disc-structure-preview.exe`，82,126,336 bytes，SHA-256 `1493143C97388D24FD76FC8595C5A14E92B869275C3AE5A671E29E66DC2C32D7`；5,603 个运行资源校验通过，正式程序 SHA-256 `B02DE94166AF1ED3F84C64542C2663CB4B700658DC35678591179291C3476518` 未变。预览使用隔离资料目录，本轮未启动操作用户窗口，实机检查待用户完成；未修改实际收藏或清理备份。见 [规则与兼容说明](docs/DISC-STRUCTURE.md)。

**2026-10-26 自定义资料编辑器下拉与表格布局（测试版，未发行）**：Credits 曲目改为可折叠多选下拉，使用独立顶层弹层避免裁切，滚动时更新位置；拆出 `TrackMultiSelect` 与 `ContentEditorTable`。七种资料表格固定列布局与操作列，添加前后表头列位置一致；占位行与输入行使用相同内边距，独立边框保留完整虚线。Playwright 独立合成资料页完成 1200px / 800px 共 14 次列坐标比较、多选／全选／Esc／弹层视口验证，页面无运行时错误；TypeScript / Vite、Release 构建通过。沿用预览 `target/release/DiscAtelier-menu-recognition-preview.exe`，80,538,112 bytes，SHA-256 `55DC1FF9BFD5704843A04547E545F647EA11A3590BDB8710EBF7DA99F3039F6C`；5,603 个运行资源校验通过，Medium 完整性标签保留，正式程序哈希未变。本轮未操作收藏窗口或清理数据，见 [验证说明](docs/CONTENT-EDITOR-LAYOUT.md)。

**2026-10-26 菜单自动关联具体 Disc / BD 同级分盘（测试版，未发行）**：菜单识别结合已保存 Disc 标题、演出年月日及场馆文字自动关联，新增具体 Disc 持久化及纠错入口，不再把同作者提示当作菜单匹配；AI 判断与进度放在对应光驱控制下方。Discogs `BD1-…` / `BD2-…` 与 CD 同级，保留原顺序和全部曲目；长标签换行显示。Schema 16 保留旧绑定并在升级前备份。16 项相关 JS、5 项 application、6 项菜单识别／匹配、3 项光盘关联存储及3 项旧版本迁移测试通过；前端构建、严格 Clippy、Release 构建通过。预览 `target/release/DiscAtelier-menu-recognition-preview.exe`，79,764,992 bytes，SHA-256 `3806431DDC58719D5FCE452061239C2B168A071D80DE55D662247A2C8CF7C7A6`；5,603 个资源核对通过，Medium 标签保留，16:24 启动运行超过 20 秒、主窗口响应正常且无启动错误。正式程序哈希未变，未清理数据或备份；实盘与显示复测待用户完成，见 [测试说明](docs/OPTICAL-DISC-ASSOCIATION.md)。

**2026-10-26 DVD / BD 菜单 AI 识别及预览启动修复（测试版，未发行）**：AI 阻塞请求移至专用工作线程，捕获异常；识别错误不再被光驱刷新清除，新增阶段及计时。截图串行执行、前后核对盘片，修正 DVD 误用 Blu-ray 菜单选项。用户诊断发现预览 WebView2 启动报 0x800700AA；确认当前 Tauri 窗口配置转换丢失 data_directory，改在创建窗口前覆盖预览应用本地数据目录，正式目录不变。前端构建、9 项 VLC 测试、3 项菜单识别测试、1 项真实路径解析隔离测试及 Release 构建通过。最新预览 `target/release/DiscAtelier-menu-recognition-preview.exe`，SHA-256 `E85F85D82A0C69AB2A8413EE2098A40D346456B1D9CA904147E1E8A4E88B3352`；5,603 个资源校验通过，已安装正式程序原哈希不变。启动问题已定位到构建 exe 继承的 Low 完整性标签；用户完成单文件 Medium 标签修正后，15:50 启动验证通过，主窗口正常响应、运行超过 20 秒且无启动错误。文件内容哈希及正式程序均未变；实盘菜单识别待用户测试，见 [测试说明](docs/MENU-RECOGNITION-FIX.md)。

**2026-10-26 编辑版本自定义资料页（测试版，未发行）**：编辑版本增加“版本 / 资料”两页。音乐资料页可改流派、风格、简介、曲目、Credits 和公司；影像资料页可改作品标题、原名、简介、日期、集数、海报、类型、资料条目、图片、人物、角色和章节。角色支持网络头像地址或本地 PNG／JPEG／WebP 头像（内嵌 data URL，约 700,000 字符上限）。音乐内容保存通过新增 `library_content_save` 写入 `edition_content`；影像继续复用 `video.update` 的资料保存和 revision 校验。CDP 验证《Lemon》资料页 41 条曲目保存后关闭，以及《蔚蓝档案 动画版》资料页 21 个角色、12 个章节。115 项 JavaScript 测试、TypeScript／Vite 和发布预检通过；测试预览 `artifacts/DiscAtelier-content-editor-disc-preview.exe`，SHA-256 `dfbb77adb514fa88c2b8bff1f755c9875ea41e7a0b832a3d5fde09fa5dac0745`，77,974,016 bytes；未发布正式版。

**2026-10-26 收藏曲目／章节与当前 CD 搜索（测试版，未发行）**：顶部搜索除收藏标题、作者和标识符外，还读取已保存的 Discogs／网易云曲目表、影片 TMDB／Bangumi 章节标题，以及当前插入音频 CD 的 CD-TEXT／MusicBrainz 曲目。搜索收藏中的歌曲或章节会直接筛出对应收藏；当前 CD 的匹配显示曲号、标题、歌手／专辑和时长，点击直接播放该 CD 曲目。CDP 实测“醜人多作怪”筛出《運氣來得若有似無》，“我不同意”筛出《蔚蓝档案 动画版》。收藏曲目／章节必须已保存资料；当前 CD 不持久化历史曲目。115 项 JavaScript 测试、TypeScript／Vite 和发布预检通过；测试预览 `artifacts/DiscAtelier-collected-search-preview.exe`，SHA-256 `5e43fa2cfdd374aa339701ccce684974b81abbb7ce9d0c775bb3707be8f384fd`，75,476,992 bytes；未发布正式版。

**2026-10-25 影片本地关联改为章节（测试版，未发行）**：影片本地关联界面不再使用“歌曲”和“集数”，总入口显示“歌曲 / 章节”“章节 / 轨”，详情页显示“关联章节”和“章节”；视频行显示“第 N 章”，关联标签写入“第 N 章”。CDP 实测《蔚蓝档案 动画版》本地文件表头为“文件 / 位置 / 章节 / 操作”；扫描测试视频后“关联章节”下拉列出网易云／TMDB 章节，选择第 2 章后轨号立即变为 2、标题为“本篇 · 2 · 我不同意！”。115 项 JavaScript 测试、TypeScript／Vite 和发布预检通过。测试预览 `artifacts/DiscAtelier-video-label-preview.exe`，SHA-256 `3cca19d878188c5db68da63dac8f138bb96b700555dc1ab130e339c260bd95c3`，75,180,032 bytes；未发布正式版。

**2026-10-25 0.1.26 已发布**：修复纯网易云收藏无法建立完整本地音乐关联的问题。内容表为空时回退读取网易云补充专辑曲目，本地关联表显示歌曲标题、自动匹配轨号、支持歌曲下拉，详情曲目显示本地播放图标。115 项 JavaScript 测试、严格 Clippy、格式检查、TypeScript／Vite 和签名 NSIS 构建通过；安装到 `D:\Program Files\DiscAtelier` 后版本为 `0.1.26`，MPV／VLC 运行时和快捷方式保留。Release ID `423439284`，标签 `v0.1.26`，源码提交 `94fcd11a1de68e7a5f35c43bae24dcaed5d000ae`；安装包 166,939,525 bytes，SHA-256 `9117b6b64058f59af92e9666138f8246694ed9486a5db85296c3fbb1383a7351`。五项资产回读一致，公开 Latest 下载与更新验签通过，篡改包被拒绝。仍不定义为 1.0；详见 [0.1.26 发布校验](docs/releases/v0.1.26-verification.md)。

**2026-10-25 纯网易云专辑本地关联修复（测试版，未发行）**：纯网易云收藏的曲目保存在补充资料，`library.content.tracks` 为空，导致本地关联表只显示轨号、没有歌曲标题/下拉，也匹配不到曲目；Discogs 收藏因为内容表有曲目所以正常。现在详情本地文件表和总入口在内容表为空时回退读取 `netease.albums`，按专辑顺序生成曲目标题和轨号；详情曲目的本地播放绑定也改用补充曲目行。CDP 实测纯网易云专辑“六花”已保存 17 条关联显示标题，重新扫描后前 3 行分别为 `鯨の落ちる街 / 1`、`カロン / 2`、`Happiness Umbrella / 3`。115 项 JavaScript 测试、类型检查和发布预检通过。测试预览 `artifacts/DiscAtelier-local-audio-preview.exe`，SHA-256 `fe9da7edec8b5ceb4c748358da007594c94e253e80dd77336746f503f0534704`，74,685,440 bytes；未发布正式版。

**2026-10-25 0.1.25 已发布**：本地音乐和视频改走 VLC；MPV 运行时随安装包提供，仅用于蓝光直读和 MakeMKV 兼容兜底；VLC／MPV／插件缺失显示明确错误；关联歌曲支持手动下拉和轨号双向同步；歌名精确匹配优先；修正曲目行垂直对齐、本地文件弹窗固定标题／表头、表头不透明和表格填充。115 项 JavaScript 测试、严格 Clippy、格式检查、TypeScript／Vite 和签名 NSIS 构建通过；安装到 `D:\Program Files\DiscAtelier` 后确认 `mpv/mpv.exe`、`vlc/libvlc.dll`、快捷方式和卸载注册项。Release ID `423413578`，标签 `v0.1.25`，源码提交 `8900c543e6b65ed20c399e9fd25e62e09c047d2e`；安装包 166,938,075 bytes，SHA-256 `070365af3a4f0c7de350e316c8a5c4916cb2b5cdb94935a6c7a8d1aa652d4a2b`。五项资产回读一致，公开 Latest 下载与更新验签通过，篡改包被拒绝。仍不定义为 1.0；详见 [0.1.25 发布校验](docs/releases/v0.1.25-verification.md)。

**2026-10-25 本地 VLC 与 MPV 打包（测试版，未发行）**：本地音乐和本地视频改走 VLC，VLC 本地音频使用零窗口纯音频模式，本地视频复用内置视频区域；MPV 仅保留蓝光直读播放列表和 MakeMKV 兼容兜底，不再参与本地播放。MPV 运行时（`mpv.exe` + `d3dcompiler_43.dll`）现已加入安装包资源和 `prepare:mpv` 构建步骤，`DISCATELIER_MPV` 指向安装目录 `mpv/mpv.exe`。CDP 实测 VLC 本地音频进入 `playing`、本地视频进入 `playing`；测试签名 NSIS 安装包装到临时目录后确认包含 `mpv/mpv.exe`、`vlc/libvlc.dll`。播放启动缺少 VLC 时底部弹出“未检测到 VLC…”提示；MPV 路径和 VLC 插件目录缺失也有明确错误。同时修正歌曲列表序号、标题、时长的垂直中线对齐，本地文件弹窗标题和表头固定、表头取消半透明、表格填满可用高度。115 项 JavaScript 测试、类型检查和发布预检通过。测试预览 `artifacts/DiscAtelier-local-audio-preview.exe`，SHA-256 `a300cd7f6cb4d980e3a99ae9e1264beb73f10bae6efeb54c853f43b447822487`，74,439,680 bytes；测试安装包 `artifacts/DiscAtelier_0.1.24_vlc_mpv_test-setup.exe`，167,442,244 bytes，未发布正式版。

**2026-10-25 关联歌曲手动下拉与轨号双向同步（测试版，未发行）**：关联表的歌曲列改为从当前专辑曲目表选择，手动改轨号会立即反查并更新歌曲标题。实测第 1 行把轨号改为 6，歌曲立即变为 `Trigger For Ambition`；从下拉框选择 `Summer Attack!`，轨号立即变为 14。新增精确匹配后共 115 项 JavaScript 测试通过。测试预览 `artifacts/DiscAtelier-local-audio-preview.exe`，SHA-256 `1bb5622fd509061b995b0a5be6128e41a4ff1d7b165a22d0848ba1915ee10978`，73,130,496 bytes；未发布正式版。

**2026-10-25 歌名精确匹配修复（测试版，未发行）**：曲目匹配改为精确歌名优先，再尝试包含匹配。`夏のせい` 与 `夏のせい (English ver.)` 同时存在时，无 English 文件名匹配第 1 轨，English 文件匹配第 6 轨，不再因为更长的版本标题被优先选中。新增 1 项回归测试，共 115 项 JavaScript 测试通过。测试预览 `artifacts/DiscAtelier-local-audio-preview.exe`，SHA-256 `0643b8544f9bebbc9457c52f481d86826b7591dfae1670c98b122e84a2387338`，72,865,280 bytes；未发布正式版。

**2026-10-25 0.1.24 已发布**：本地文件关联、CD 式本地播放器、右下角播放列表、无需停止的直接切换、原生顶层播放器返回详情、曲目/章节播放按钮、白色网易云 Logo、关联表歌曲标题与专辑顺序、光驱插入提示已发布并设为 Latest。114 项 JavaScript 测试、严格 Clippy、格式检查、TypeScript／Vite 和签名 NSIS 构建通过；五项资产回读一致，公开 Latest 下载与更新验签通过，篡改包被拒绝。Release ID `423147754`，标签 `v0.1.24`，源码提交 `11bf3817d2e00e3a41b0f377cbb58e657b65abd2`；安装包 131,098,885 bytes，SHA-256 `de8f32ceafb6464dec8ffd87870dc5b020d8ee290893689e83c5975243a8595b`。schema 保持 15，无迁移。真实 DVD／Blu-ray 菜单、BD-J 和菜单识别尚未实盘验收，因此仍不定义为 1.0；详见 [0.1.24 发布校验](docs/releases/v0.1.24-verification.md)。

**2026-10-25 本地音乐 CD 式播放器与右下播放列表（测试版，未发行）**：本地音频播放改为 CD 式界面，按轨号顺序展示整张专辑；关闭后缩到右下角播放列表，可直接点击切歌，不需要先停止。播放器底部把停止、上一首、播放/暂停、下一首放在同一行，循环按钮位于最右侧；网易云播放列表也改为同一布局。后端本地切歌会直接替换当前 MPV 会话。CDP 实测 28 首本地曲目、全屏播放、缩到右下角、直接切歌成功，源路径从 Usagi Flap 切换到 Fall Into The Rabbit Hole。点击本地播放按钮会直接叠层打开播放器，不再需要先关闭收藏详情；关闭播放器回到详情。CDP 验证详情打开时点击播放，`dialog[open]` 从 1 变为 0、播放器出现并显示 28 首，返回后播放器关闭、详情恢复。修复从右下角播放列表重新打开播放界面卡住的问题：关闭播放器后 `closing` 状态未复位，且本地音频仍创建 MPV 原生窗口；现在重新打开时复位状态，本地音频使用 `--vo=null` 且不嵌入原生画面。CDP 验证关闭后从列表重新打开，播放器 `data-closing="false"`、透明度 1、详情隐藏。关联列表新增“歌曲”列，按专辑轨号顺序排列；文件夹路径去掉重复提示，选择文件夹和扫描并列。播放器改为叠层打开，关闭时立即恢复同一收藏详情，不再先回首页执行打开动画；本地播放切换和光驱/视频切换都直接替换当前会话，不需要先停止。播放器改为原生顶层 `<dialog>`，收藏详情在播放期间保持打开，只被播放器盖住；关闭播放器后详情无需重新打开，不会闪过首页。正在播放的曲目再次点击播放按钮会直接打开播放器，不会暂停或重启。CDP 验证播放时详情 dialog 仍为打开状态，关闭播放器后 30ms 内只剩详情 dialog；重播当前曲目直接出现播放器且未暂停。测试预览 `artifacts/DiscAtelier-local-audio-preview.exe`，SHA-256 `eca8b4ff9ef58a69f1f7c10d0c431848cf2c18b8c221a51d6a6ca03292074b8c`，72,620,032 bytes；未发布正式版。

**2026-10-25 0.1.23 已发布**：本地文件总入口与详情入口、文件夹递归扫描、歌名匹配专辑曲目、曲目/章节播放按钮、白色网易云 Logo、光驱插入提示、光驱图标入口和曲目行 hover 调整已发布并设为 Latest。228 项工作区 Rust 测试（9 项忽略）、114 项 JavaScript 测试、严格 Clippy、格式检查、TypeScript／Vite 和签名 NSIS 构建通过；五项资产回读一致，公开 Latest 下载与更新验签通过，篡改包被拒绝。Release ID `423116788`，标签 `v0.1.23`，源码提交 `9759f2ff5e06e1dfe993eaa10ae6b1e17eed268c`；安装包 131,094,709 bytes，SHA-256 `2941e160fc728cd39d3a5a1d786c4c944cff5a8829bdd422071cd71c0d31bac3`。schema 保持 15，无迁移。真实 DVD／Blu-ray 菜单、BD-J 和菜单识别尚未实盘验收，因此仍不定义为 1.0；详见 [0.1.23 发布校验](docs/releases/v0.1.23-verification.md)。

**2026-10-25 光驱插入提示与详情图标（测试版，未发行）**：曲目行取消整条 hover 样式，只保留本地播放和白色网易云按钮的独立反馈。插入已关联光盘后，应用每 3 秒检测光驱状态，在底部弹出“光驱中检测到《标题》· 是否跳转”；点击“是”切到对应分区并滑动到该收藏，标题旁的光驱图标可点击进入光驱界面。测试预览 `target/release/DiscAtelier-local-files-preview.exe`，SHA-256 `491487ce45aa7dfd213561795c415b859d53ef4fe8f65cc73074db7f6db2b258`，69,947,392 bytes；未发布正式版。

**2026-10-25 本地文件关联（测试版，未发行）**：新增“更多 → 本地文件”总入口，选择文件夹后递归扫描子目录，按文件夹名、标题、作者和文件名生成关联表；音频匹配音乐、视频匹配影像，`S01E01`、`第 01 集`、`EP01`、开头 `01/02/03` 识别集数，`01 - 曲名`、`CD03`、`Track 12` 识别轨号；未匹配文件可人工选择或“自动关联未匹配”。每个收藏详情新增独立“本地文件”入口，只处理当前这一套，逐文件填写集数或轨号，保存后保留在面板内直接播放；不会覆盖其他收藏的关联。后台新增 `local_files_scan/get/save` 和 `playback_start_local`，绑定保存在数据目录 `local-files.json`，播放只接受已保存的收藏＋路径组合。113 项 JavaScript 测试（新增 3 项本地匹配测试）、CDP 扫描/保存/播放 WAV 实测通过；测试关联已清空。UI 使用设置页同款 `path-input` 文件夹选择器和自定义 `Select` 下拉框，路径输入不再使用原生灰底样式，表格选择器与设置中的下拉框一致。没有数字前缀的 `艺人 - 歌名` 文件名会读取当前收藏的专辑曲目表，按歌名匹配轨号，并在轨号旁显示匹配到的曲目名；未匹配时明确显示，可手动填写。多碟按曲目顺序编号。114 项 JavaScript 测试通过；实测 `7mai - Usagi Flap` → 第 1 轨（Usagi Flap）、`Aiobahn - Summer Attack!` → 第 14 轨（Summer Attack!）、`KARUT - Fall Into The Rabbit Hole` → 第 3 轨（Fall Into The Rabbit Hole）。曲目行末尾增加本地播放符号和白色网易云播放按钮；章节行增加本地播放符号，绑定变化后即时刷新。网易云按钮使用用户提供的 SVG 中提取的中间白色图形，不再使用近似图标。测试预览 `target/release/DiscAtelier-local-files-preview.exe`，SHA-256 `1e36eb907e191297022441e47d0a767c625e369783ff9a254dd8b78f23f2d3f0`，69,439,488 bytes；未发布正式版。详见 [本地文件关联](docs/LOCAL-FILES.md)。

**2026-10-24 0.1.22 已发布**：仓库已转为公开，项目采用 GPL-3.0-or-later；设置整合“音乐资料”与“关于”，Discogs 自动识别输入保留手动类型兜底，新增从网易云添加、连续手机扫码、手动录入叠层和实验性菜单截图识别；更新检查不再需要 GitHub Token。228 项工作区 Rust 测试（9 项忽略）、110 项 JavaScript 测试、严格 Clippy、格式检查、TypeScript／Vite 和签名 NSIS 构建通过；五项资产回读一致，公开 Latest 下载与更新验签通过，篡改包被拒绝。Release ID `422756896`，标签 `v0.1.22`，源码提交 `1d113837297a7d331b2ea86029e0172dff3311ca`；安装包 131,100,987 bytes，SHA-256 `f44466dccbc2c48fe959a951bdb876ac5c492569f50620a8589cdb5f1d78baee`。schema 保持 15，无迁移。真实 DVD／Blu-ray 菜单、BD-J 和菜单识别尚未实盘验收，因此本版不定义为 1.0；详见 [0.1.22 发布校验](docs/releases/v0.1.22-verification.md)。

**2026-10-24 手动录入叠层（测试版，未发行）**：Discogs 添加页点击“手动录入”不再关闭 Discogs 窗口；手动添加表单作为叠层打开，Discogs 搜索状态保留，点击“返回版本”只关闭手动表单并回到原窗口。CDP 验证叠层打开时两个 dialog 同时存在，返回后仅剩原 Discogs 窗口。测试预览 `target/release/DiscAtelier-manual-add-preview.exe`，SHA-256 `16d5a1824c26664eb7ec52ca1a4801fa2b5908728ad6c0b5c52c9c7e08a30f26`，65,461,760 bytes；未发布 GitHub Release。

**2026-10-24 添加页工具栏与连续扫码（测试版，未发行）**：Discogs 工具栏改为“设置”固定左侧，右侧依次为“手动录入”“从网易云添加”“手机扫条码”。新增“从网易云添加”：打开网易云专辑搜索，确认后直接进入添加表单，预先填入标题、作者、封面和网易云专辑关联。手机扫条码改为限时连续会话：同一条码连接内可连续接收多个条码，每次都更新电脑搜索框，关闭窗口或 15 分钟到期后结束；截图模式仍保持一次接收。后台同步允许条码会话重复提交，并继续使用请求幂等校验。移动端 7 项测试、110 项 JavaScript 测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-mobile-toolbar-preview.exe`，SHA-256 `46d8bfd3043f1249bff5863aada2b394b67870b98180d2115caabe94e3e9cc76`，65,222,144 bytes；未发布 GitHub Release。

**2026-10-24 添加页 Discogs 自动识别输入（测试版，未发行）**：Discogs 添加页保留“自动／条码／品番／关键词／发行 ID”选择，默认自动，误判时可手动指定兜底；单一输入框不再展示长提示文字。自动规则为纯 8–14 位数字按条码、1–7 位数字按发行 ID、同时含字母和数字且无空格的书写按品番、其余按关键词查询；手机扫条码只填入输入框，仍遵循当前选择。CDP 验证下拉选项完整且页面无长提示，自动规则示例为 `4901234567894 → 条码`、`SRCL-12345 → 品番`、`宇多田ヒカル → 关键词`、`123456 → 发行 ID`。测试预览 `target/release/DiscAtelier-auto-search2-preview.exe`，SHA-256 `f6af5aa24d4c6327ad2dfbe54227747737bdba569af9d205f97ade6901015307`，64,965,120 bytes；未发布 GitHub Release。

**2026-10-24 设置整合“音乐资料”与“关于”（测试版，未发行）**：设置导航将 Discogs、MusicBrainz、网易云合并为“音乐资料”，内部用三个标签切换，原 Discogs 深链进入时默认打开 Discogs；单独的分类入口已移除。原“更新”页改名为“关于”，顶部展示 DiscAtelier 版本、作者／维护者 Reversed-Future、私有项目地址、技术栈和许可证说明，下方保留原有更新检查、下载与安装。CDP 验证导航为“数据、汇率、影像资料、音乐资料、助手、播放、关于”，三个音乐资料标签可切换，关于页显示版本 0.1.21。测试预览 `target/release/DiscAtelier-settings-music-about-preview.exe`，SHA-256 `133a32d23ecad3512e88853d45339d138c4c6091f6a4d741c86a5a6d195f5f69`，64,467,968 bytes；未发布 GitHub Release。

**2026-10-24 光盘菜单截图识别（实验，未发行）**：DVD／Blu-ray 光驱页新增“识别菜单”。后端在离屏窗口静默启动 VLC 菜单（DVD 6 秒、Blu-ray 12 秒），用 `libvlc_video_take_snapshot` 截取 1280×720 PNG，删除临时文件后把截图提交到设置中的图片 AI 模型；返回标题、作者、版本、置信度和依据，再调用现有候选接口搜索收藏。AI 只提供候选，关联仍需用户确认，不直接写库。解析器测试、TypeScript／Vite 构建通过；尚无真实 DVD／Blu-ray 样盘，离屏菜单截图、BD-J 叠加层和端到端识别待实盘验收。细节见 `docs/OPTICAL-MENU-RECOGNITION.md`。测试预览 `target/release/DiscAtelier-menu-recognition2-preview.exe`，SHA-256 `9f2a9985509c1a426eefd0d088e641e06673cbca598421e581cdee71de698ede`，64,207,360 bytes；未发布 GitHub Release。

**2026-10-24 0.1.21 已发布**：安装包内置 VLC 3.0.22、Temurin JRE 8.0.504+1、libaacs 和 libbdplus，新增 VLC 蓝光菜单播放／BD-J 运行链路；用户无需单独安装 VLC 或 Java。226 项工作区 Rust 测试（9 项按环境忽略）、两项显式发行验证、110 项 JavaScript 测试、严格 Clippy、格式检查、TypeScript／Vite 和签名 NSIS 构建通过；五项资产草稿／正式回读一致，实际私有更新下载验签通过、篡改包拒绝。Release ID `422585567`，标签 `v0.1.21`，源码提交 `51a7789e94b01cb1cf2ab16809605d9e86909e0f`；安装包 131,079,168 bytes，SHA-256 `51338e8e94cdeaa75049ddd69142282a68bdd48cc6ca27a80e471acab65c846f`。schema 保持 15，无迁移；蓝光菜单和 BD-J 的实盘验收仍待完成。详见 [0.1.21 发布校验](docs/releases/v0.1.21-verification.md)。

**2026-10-24 内置 VLC 与 Java 运行时（测试版，未发行）**：安装包资源新增固定版本 VLC 3.0.22 和 Temurin JRE 8.0.504+1；启动时设置进程内 `VLC_PLUGIN_PATH`、`JAVA_HOME`、`LIBAACS_PATH`、`LIBBDPLUS_PATH`，并把 `vlc/` 与 `jre/bin` 前置到 PATH；播放设置留空 VLC 路径时自动使用安装目录 `vlc/libvlc.dll`。`scripts/prepare-vlc.ps1` 下载并校验两个归档；资源映射为 `vlc/`、`jre/`，`libaacs.dll`、`libbdplus.dll` 同时复制到 `vlc/`，用户无需单独安装 VLC 或 Java。CD 实测通过内置 VLC 播放。VLC 3.0.22 SHA-256 `3a75c0a4e8ee3a04f409b8953c572cea725492cbed27f93d1ce6e29f9cfb59b9`，Temurin 8u504b01 SHA-256 `82e2cdc6693737c5998445b31f69668fa0da77c7705121053f6508ac84961123`。许可与源码说明见 `docs/BUNDLED-VLC.md`。测试预览 `target/release/DiscAtelier-bundled-vlc4-preview.exe`，SHA-256 `8f62d660886d0adf2a5fb04891e7694384fe1a04dbd71b7f94bfe109740344b1`，63,815,168 bytes；签名 NSIS 测试安装包 `target/release/DiscAtelier-bundled-vlc-test-setup.exe`，131,316,577 bytes，SHA-256 `2a3fdeb2cb15f780e4fb5ff2a7b3321ff96edc62bccc6784d954429efb33ad6b`，本地更新签名及版本验证通过。未发布 GitHub Release。

**2026-10-24 VLC 蓝光菜单接入（测试版，未发行）**：光驱页的蓝光条目新增“菜单播放”，通过 VLC 的 libbluray access（`bluray:///X:/`，媒体选项 `bluray-menu=1`）进入蓝光顶层／弹出菜单；原有播放列表按钮保留为 MPV 的 `bd://mpls/...` 直接播放。VLC 输入线程接收方向键／回车导航，播放控制条在蓝光菜单中显示菜单按钮；`bd-menu` 作为固定内部路由，不接受外部 URL。BD-J 取决于 VLC／libbluray 的 JVM 支持，缺少 Java 时会提示或退回无菜单播放，尚需真实蓝光样盘验收。VLC 路由单元测试 9 项通过；预览构建通过。测试预览 `target/release/DiscAtelier-bluray-menu2-preview.exe`，SHA-256 `b76bccba4c340412ade30e3d5a19e1fdc4d321dcac508e2ff8f3298a09055cb4`，63,443,968 bytes；未发布 GitHub Release。

**2026-10-24 0.1.20 已发布**：光驱标题标记与识别缓存、CD 播放器导航／关联封面／音量／平滑进度／220ms 转场／居中曲目列表、首页与 CD 封面扫描缓加载等改进纳入正式发行。225 项工作区 Rust 测试（9 项按环境忽略）、两项显式发行验证、110 项 JavaScript 测试、严格 Clippy、格式检查、TypeScript／Vite 和签名 NSIS 构建通过；五项资产草稿／正式回读一致，实际私有更新下载验签通过、篡改包拒绝。Release ID `422475496`，标签 `v0.1.20`，源码提交 `3bff4d982931dc186cae88c42db25cbd9b7b9fee`；安装包 SHA-256 `974c07c92e0771d2a72532d4fc04c89dd49a0082b80ea72669ef1d27b10b40af`。schema 保持 15，无迁移。详见 [0.1.20 发布校验](docs/releases/v0.1.20-verification.md)。实际安装、覆盖升级和下一版本端到端更新仍待用户手动验收。

**2026-10-24 恢复首页封面扫描缓加载（测试版，未发行）**：首页封面此前命中 `peekStaticArtwork`／`preloadedUrl` 时直接标记 `data-loaded`，扫描动画被跳过。现在 `Cover` 在拿到来源后至少保留 260ms 扫描层，再以 280ms 淡入图片；缓存和预加载封面同样生效。CDP 实测首页封面扫描层从挂载持续约 500ms，`data-loaded` 从 false 变为 true 后图片开始淡入。CD 光盘封面也恢复同款扫描与 280ms 淡入。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-home-cover-scan-preview.exe`，SHA-256 `f972f957b9f2f0ba3bbc52a8aa19a7c7fa48c2f23c1e96efb6e2d41fd875f0c6`，63,205,376 bytes；未发布 GitHub Release。

**2026-10-24 播放列表按整行高度收口（测试版，未发行）**：CD 曲目列表不再用固定的 `48vh` 作为可视高度，而是在布局阶段读取实际行高和到页脚的距离，把最大高度向下取整为整行倍数。实测行高 52.4px、列表高度 471.6px（9 行），可视区最后一行底部 715.96px 与容器底部 715.96px 完全对齐，不再在文字中间截断；列表中心 480.16px，仍保持纵向居中。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-row-aligned2-preview.exe`，SHA-256 `1228e40acba9c3596e411ae8a84a879ad603ef749a459cde2bc41d3ea9a070ea`，62,471,680 bytes；未发布 GitHub Release。

**2026-10-24 修复 CD 播放列表纵向居中（测试版，未发行）**：上一版给 `.audio-body` 加了 `translateY(56px)`，但内容淡入动画的 `transform:none` 填充覆盖了它，列表实际仍在偏上位置。现移除入场动画的 transform，只保留透明度动画，使 `translateY(clamp(12px,6vh,56px))` 生效。CDP 实测视口 960px 时播放列表中心 480.9px、主体中心 458px，列表顶部 250.5px、底部 711.3px，达到纵向居中且不与页脚重叠。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-centered-playlist-preview.exe`，SHA-256 `772a3fedc11b15810623e2ec0a9aae1218af7350edc7405c8dec27fc8dac520e`，61,976,576 bytes；未发布 GitHub Release。

**2026-10-24 放缓播放器淡入并统一 220ms 转场（测试版，未发行）**：上一版 CD 直接切换使淡入看起来过快。现在播放器整体淡入／淡出统一为 220ms 对称 `cubic-bezier(.42,0,.58,1)`；CD 播放器从光驱进入时背景不做整屏淡入，而是以 220ms 淡入头部、主体和底栏，因此仍然不经过“关闭光驱再打开播放器”的闪屏，同时保留可见的慢缓入。音量浮层保持贴图标顶部、10px 悬停桥、数字在滑条上方；暂停时曲目按钮 opacity 固定 1；进度条使用带 180ms 速率缓入缓出的连续时钟和 `step="any"`。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-soft-player-preview.exe`，SHA-256 `a40eb96636f6749e204032fbeb992d338ab73ca8be9579f9cf6d31da1b86d692`，61,720,576 bytes；未发布 GitHub Release。

**2026-10-24 音量悬浮与播放器过渡修正（测试版，未发行）**：音量浮层改为紧贴音量图标顶部，并增加 10px 透明悬停桥，鼠标从图标上移不会再消失；百分比数字移到浮层顶部，实测数字底部 782.8px、滑条顶部 793.8px，不再遮住数字。暂停时曲目按钮短暂 disabled 会受全局 `opacity:.25` 影响而闪烁，现对 `audio-track-list` 保持 opacity 1。淡入淡出统一为 160ms 对称 `cubic-bezier(.42,0,.58,1)`；CD 播放器首次进入使用一帧 instant 标记，直接切换且不再触发 180ms `audio-enter` 动画。播放进度改为带 180ms 速率缓入缓出和误差回拉的连续时钟，输入 `step="any"`；CDP 采样 60 个 20ms 点无回退或跳变。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-volume-hover2-preview.exe`，SHA-256 `c3b67c7ed04c4cc685f80ffae49f65e079680cee6ac0f7edd9d8f00674871ae9`，61,464,576 bytes；未发布 GitHub Release。

**2026-10-24 控制条音量与转场同步（测试版，未发行）**：CD 与网易云播放器控制条右下角新增音量图标，悬停仍显示纵向音量条；视频播放器保持全屏最右。音量在 CD／网易云中为 `playback-options` 最后一项，实测图标右边缘与页脚右边缘同为 1270px、底边同为 914px。播放器淡出等待从 170ms 改为 160ms，与 `.player-view` 淡入／淡出过渡时长完全一致。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-cd-volume-preview.exe`，SHA-256 `81d01b4a3195081af418b3f6f4dbbc3aa0a1ef1eabbc1145f14ccebd70551a31`，60,220,416 bytes；未发布 GitHub Release。

**2026-10-24 播放器平滑进度与转场（测试版，未发行）**：CD 播放器主体按视口高度下移（`clamp(12px, 6vh, 56px)`），实测主体中心 458px（视口 960px），曲目列表与资料间隔 14px。播放进度条改为基于快照锚点和 `requestAnimationFrame` 连续插值，暂停时回到精确值；DVD／视频／CD 共用同一进度条逻辑。CD、网易云和视频播放器退出时先设置 `data-closing`，等待 170ms 淡出后再卸载／隐藏原生画面；进入仍使用原有淡入。CDP 采样进度值 1.5／1.5／1.5／1.6／1.6／1.7／1.8／2.0（80ms 间隔），退出透明度 0.17→0.02→0.0007→卸载。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-smooth-player2-preview.exe`，SHA-256 `de2ac0eabdca9e87ce4475dc9ace677f47ed4295d57356d172115921d3857315`，59,744,256 bytes；未发布 GitHub Release。

**2026-10-24 CD 播放器导航与关联封面（测试版，未发行）**：上一首／下一首从右侧文字链接移入底部播放控制条，按“停止、上一首、播放／暂停、下一首”图标排列，首尾曲目自动禁用对应按钮。光盘表面优先使用已关联收藏的封面，裁成圆形并保留中心孔与轻微辉光；没有关联封面时保留银色光盘回退。“重新识别”移到曲目资料右下角，降低干扰。CDP 用实际 F: 音频 CD 验证：已关联 Anti Anti Generation，封面 `<img>` 已加载 data URL，控制条顺序为停止／上一首／暂停／下一首，首曲上一首禁用、下一首可用。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-cd-player-preview.exe`，SHA-256 `aec82eba930ecd6a93572deabf3a396d7573afa887e381310ca7ef1c4ade469b`，59,232,768 bytes；未发布 GitHub Release。

**2026-10-24 光驱标题标记与识别缓存（测试版，未发行）**：收藏详情和首页当前标题右上角改为只显示一枚发光光盘图标，不再显示“在光驱中 · 光驱名”文字；播放中图标增强辉光并缓慢呼吸，悬停标题可看光驱名。光驱面板增加模块级缓存：光驱列表、关联状态、候选、MusicBrainz 发行结果、CD 曲目资料和检查状态在面板重新打开时立即可用；后台刷新逐项比较，只有实际变化才更新 React state，查询失败保留旧内容。CDP 验证首次打开从 0 个光驱到 1 个，关闭再打开时首个渲染即直接显示 1 个，不再从空白闪成有内容。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-optical-cache-preview.exe`，SHA-256 `b9165b4946ec038fdbaf4ab157ea45a52fb39103129f263ddde413b102dd502b`，58,977,280 bytes；未发布 GitHub Release。

**2026-10-24 0.1.19 已发布**：光驱关联／弹出、MusicBrainz CD 识别、DVD 章节一体化进度条、播放器图标控制、搜索与分区流畅度、同捆购入、影像前后编编辑布局、窗口最大化布局、封面立体查看等改进纳入正式发行。225 项工作区 Rust 测试（9 项按环境忽略）、两项显式发行验证、110 项脚本测试、严格 Clippy、格式检查、TypeScript／Vite 和签名 NSIS 构建通过；五项资产草稿／正式回读一致，实际私有更新下载验签通过、篡改包拒绝。安装包 SHA-256 `30878ce182ccc964b1aaca731964bd453fe870a6148ddfcfc808d19dc9a550a0`。schema 15 首次打开前自动备份。详见 [0.1.19 发布校验](docs/releases/v0.1.19-verification.md)。实际安装、覆盖升级和下一版本端到端更新仍待用户手动验收。

**2026-10-23 编辑版本窗口与分编布局重构（测试版，未发行）**：影像编辑的“分编卡片”由松散的表单行改成独立分区：标题／说明在左，交换前后顺序／取消分编或设置前后编在右；前后两张卡片改为等宽双列卡，每张卡内是卡片名称与封面来源，标题和顺序在卡头显示；作品归属改为独立列表，左侧作品标题／来源、右侧固定 190px 的选择器，窄屏自动单列。设置分编后自动隐藏无意义的全局封面区，分编区直接接在作品资料之后；未设置分编时仍显示全局封面。CDP 验证设置前后编后全局封面消失、两张卡片出现，卡片头和作品归属布局生效。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-edit-edition2-preview.exe`，SHA-256 `882ad4ae7dc777c1aec7883e72928ca0685abafdf9735de242b75a2bb561eb0d`，58,229,248 bytes；未发布 GitHub Release。

**2026-10-23 同捆行距与 Blue 搜索修复（测试版，未发行）**：同捆行距从约 64px 收紧到 30px；原因是通用 `form label` 的 14px 上下外边距覆盖了行样式，现用 `.panel-dialog form .bundle-row { margin: 0 }` 精确覆盖，并把网格 gap 从 6 改为 4、行内边距从 7 改为 5。搜索 `blue` 无结果的原因是候选查询限制了 `status: "owned"`，而库里 Blue Archive 条目不是 owned；现改为不限制状态，仍调用首页 `library_list` 模糊搜索。CDP 验证 `blue` 返回 Vol.5／4／3／2／1，行 top 依次 678／708／738（30px 间距）。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-bundle-fix-preview.exe`，SHA-256 `3a9e3c0581fca559cb2288c1cf48e05615120124f7c7ec42ec53967f0ca01398`，57,737,216 bytes；未发布 GitHub Release。

**2026-10-23 同捆单列列表（测试版，未发行）**：同捆候选与已选条目改为单列纵向列表，每个条目独占一行，保持左侧复选框、右侧标题的横排；列表最大高度 220px、超出后纵向滚动，标题占满剩余宽度并省略溢出。位置仍在购入日期和购入位置之间，搜索仍使用首页 `library_list` 模糊查询并保持 150ms 防抖。CDP 验证前四条候选每行宽度 508px、纵向 top 依次为 692／756／820／884，确认一列一行。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-bundle-column-preview.exe`，SHA-256 `e746efb4491501af733eabd65cf6fdbe323eecf0aa7e9c21ef14ea09e960acc6`，57,482,752 bytes；未发布 GitHub Release。

**2026-10-23 同捆位置与模糊搜索（测试版，未发行）**：同捆区域从价格下方继续下移到“购入日期”与“购入位置”之间；候选和已选条目都改为单行横排：每项左侧复选框、右侧标题，不再显示作者／价格副行。搜索改为每次输入后调用首页同一条 `library_list` 模糊查询管线（音乐／影像各查一次，150ms 防抖），而不是前端 `includes` 过滤；默认仍不显示候选，搜索后才显示，已选条目常驻。CDP 验证：日期底部到同捆顶部 19px，购入位置在同捆之后；搜索 `Pop` 得到复选卡 `Pop Virus`，复选框与标题纵向位置一致（700 vs 699.8），清空搜索后已选仍保留。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-bundle-row-preview.exe`，SHA-256 `347cf0776481e9177399eef8bb57dcacd8432c87ab3cfbc1d54b4f777d6ef224`，57,228,288 bytes；未发布 GitHub Release。

**2026-10-23 同捆选择器布局（测试版，未发行）**：同捆区域从表单底部移到价格／换算价格下方；候选条目改为横向排列的 220px 卡片，不再纵向挤在中间。默认隐藏全部候选，只有在搜索框输入关键词后才显示横向结果；已选条目单独常驻显示为横向卡片，带价格和“移除”，即使清空搜索仍保留。CDP 验证：初始候选 0 个；搜索 `Pop` 后出现 1 张候选卡；选中后清空搜索，候选消失但已选卡常驻；同捆区顶部比价格区域底部低 21px。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-bundle-horizontal-preview.exe`，SHA-256 `8b46aaa9c8b1e09b86c9abcb2776c597c6c64b041d6207ff4904cbe67c0e0efc`，56,719,360 bytes；未发布 GitHub Release。

**2026-10-23 同捆购入信息（测试版，未发行）**：添加／编辑购入信息时新增“同捆购买”选择器，可搜索并多选其他已购入 CD／影像。保存时把购入日期、购入位置、购买链接、币种和状态写入所选条目；价格不复制、不拆分，同捆条目统一记为 0 元，主条目保留原总价，因此汇总总价不变。CDP 验证编辑购入弹窗出现同捆选择器、提示和选项（标题／作者／当前价格）；未执行会修改用户收藏的保存操作。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-bundle-purchase-preview.exe`，SHA-256 `a9f4f2c8db2414c5b32c7d2de83a7d636169ce4ce24fc9f50216795c63be3db3`，56,464,896 bytes；未发布 GitHub Release。

**2026-10-23 MusicBrainz CD 识别与光驱关联（测试版，未发行）**：音频 CD 现在从 TOC 按 MusicBrainz 规范计算 Disc ID（首轨／末轨／leadout／99 个帧偏移，SHA-1 后使用 MusicBrainz 的 `.` `_` `-` Base64 变体），已用官方示例 TOC 校验得到 `49HHV7Eb8UKF3aQiNmu1GR8vKTY-`。设置新增 MusicBrainz API 地址（留空使用公共 `https://musicbrainz.org/ws/2`，无需 API Key，保存时校验 URL）。插入音频 CD 后自动查询 Disc ID，光驱卡片显示识别标题／艺术家和识别状态；用发行标题生成本地候选，点“关联库”可直接按 MusicBrainz 标题检索并保存关联。混合模式 CD 暂不生成 Disc ID，避免错误的音频段偏移。CDP 验证设置页 MusicBrainz API 表单和真实 Disc ID 查询返回 `Ettella Diamant`。110 项脚本测试、Rust 70+5 项测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-musicbrainz2-preview.exe`，SHA-256 `18724d345a2fc48fbf19001f73e3f707ea324118bb51e46324f2e5e51ea3d191`，56,210,432 bytes；未发布 GitHub Release。

**2026-10-23 光驱弹出控制（测试版，未发行）**：每个光驱标题右侧新增“弹出”按钮，调用新增的 `optical_eject` 命令；命令校验盘符只允许单个 A–Z 字母加冒号，打开 `\\.\X:` 后发送 `IOCTL_STORAGE_EJECT_MEDIA`，依次尝试读写／只读／零权限句柄；播放中禁用并在后端拒绝，成功 900ms 后刷新光驱列表。CDP 验证面板出现 `弹出` 按钮（标题“弹出光驱托盘”），对测试光驱 F: 调用命令返回成功。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-optical-eject2-preview.exe`，SHA-256 `c95d87b82e800f654e201695dff636a73b71b0dc840385e60bfce2133e239e0a`，55,589,376 bytes；未发布 GitHub Release。

**2026-10-23 分段悬停实心高亮（测试版，未发行）**：章节悬停高亮从半透明填充＋1px 空心描边改为实心白色块；该段保持底边对齐进度轨道，高度从 2px 向上增长到 6px，形成 B 站式的加粗浮起效果，不再出现空心边框。分段边界仍保留 2px 深色分隔，未悬停段落和主进度填充不变。CDP 验证悬停段背景为 `rgb(255,255,255)`、高度 6px、底边仍在轨道中心附近；进度变量保持 35%。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-segmented-progress4-preview.exe`，SHA-256 `a2658c87e7e7fbac890ec4849d04946d5534aea8d98bdce65220e7c64a887287`，55,266,304 bytes；未发布 GitHub Release。

**2026-10-23 一体化分段进度条（测试版，未发行）**：分段条不再是进度条上方的独立一行，而是精确叠在原 range 轨道上的 2px 覆盖层。章节边界用 2px 深色分隔，进度填充仍由原轨道绘制；鼠标在任一段上移动时，该章段的覆盖层出现半透明亮色和 1px 高亮描边，其他段和已播放／未播放的填充保持原样。点击进度条只跳转到对应章节起点，拖动仍按精确位置 seek；原先隐藏的分段按钮行已完全移除。CDP 验证段覆盖层与输入轨道垂直中心对齐（输入 860.3–876.3，段 867.3–869.3），悬停只改变对应段，进度变量保持 35%。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-segmented-progress3-preview.exe`，SHA-256 `b54ce93445b9ab91a7c75ba9d1f0ae05c7d3a6da12e12b55e74fd3720ff4b9f4`，55,012,864 bytes；未发布 GitHub Release。

**2026-10-23 分段进度条（测试版，未发行）**：DVD 章节不再单独占一行按钮，而是在进度条上方生成按章节时长分段的跳转条；点击任一段跳到该章，鼠标移到进度条或分段条上时对应段亮起。分段条与主进度条之间保留 9px 间距，已播放／未播放的填充仍由原 range 轨道独立绘制，不受分段悬停影响。CDP 验证分段条底部到进度条顶部间距 9px，悬停第 5 段时仅该段背景变亮，进度变量保持 35%。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-segmented-progress2-preview.exe`，SHA-256 `9ba59fb5ca85b52c315541545cdc20a81dec3f3e4dd7f128d801c0e4e8ce733e`，54,759,424 bytes；未发布 GitHub Release。

**2026-10-23 光驱面板按钮重组（测试版，未发行）**：光驱卡片原来把“关联库”“播放”“返回播放”混在信息行和卡片底部，播放按钮还是弱化的文字按钮。现在工具栏左侧固定“返回播放”（有活动播放时），右侧保留“播放历史／刷新”；关联信息与“关联库／取消关联”拆成左右两组；DVD、Blu-ray、CD 的“播放”统一为主按钮，并用上边框与说明区隔开。桌面上当前未连接光驱，面板显示“未连接光驱”；布局和按钮分组通过 TypeScript／Vite 构建与样式检查。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-optical-layout-preview.exe`，SHA-256 `d82f30232d9231273905f6be39a2a0b00fcf52387d2156e8f995d816ae9066f1`，53,999,616 bytes；未发布 GitHub Release。

**2026-10-23 播放器图标化控制条（测试版，未发行）**：播放器文字按钮全部改为图标：左侧为停止、播放／暂停（加载中显示旋转盘片），右侧依次为 DVD 菜单、音量、速度、音轨、全屏，全屏固定最右。音量默认只显示扬声器／静音图标，hover、键盘聚焦时向上弹出 34×112 的纵向音量条，并在底部显示百分比；纵向滑条用旋转 range 实现，低音量在下、高音量在上。速度与音轨仍使用下拉选择，但收窄为紧凑文本值，避免占据控制条。用相同类名与图标渲染控制条验证：transport 左对齐，全屏右边缘与控制条右边缘重合，纵向音量条尺寸 34×112。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-player-icons-preview.exe`，SHA-256 `5aab3b203889660d2a63899294458dab8305f04866fbe2fffbb9d58dfca8d39a`，53,746,176 bytes；未发布 GitHub Release。

**2026-10-23 分区切换流畅度优化（测试版，未发行）**：切换音乐／影像时原来会先重播整个场景的 180ms 淡入，并短暂保留上一分区的列表，等新查询返回后再替换，造成闪一下。现在移除分区切换的场景淡入；按“分区＋状态＋搜索词”缓存快照，启动后后台预取另一分区，切换时立即用缓存替换并清除旧选中项；视频元数据增加模块级缓存，并在预取视频分区时提前拉取前 8 条的原文／中文标题。CDP 验证首次切到影像时首个双 RAF 已直接显示原文标题与中文副标题，场景透明度保持 1；切回音乐和再次切到影像均即时。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-category-switch2-preview.exe`，SHA-256 `89c66504ee0a663a8eb92d3b4ff6b195ba73957c6105f39f90a6be38d1eb1cf3`，53,493,248 bytes；未发布 GitHub Release。

**2026-10-23 搜索常驻、影像列表标题与路径选择（测试版，未发行）**：顶部搜索框改为常驻输入，不再点击后展开；影像整理列表的大标题使用作品原文标题，小标题使用中文标题（如 `彼女、お借りします` / `租借女友`，`劇場版 マクロスΔ 激情のワルキューレ` / `超时空要塞Δ：激情的女武神`），没有中文差异时回退作者。Bangumi／TMDB 跳转按钮与“类型”事实行的间距从 28px 收到 17px，与其他元数据行一致。播放设置中 MPV、VLC、MakeMKV 路径新增“浏览”按钮，通过 Tauri dialog 插件打开资源管理器文件选择器，并新增 `dialog:allow-open` 权限。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-search-list-path-preview.exe`，SHA-256 `90375827a0bb8196555805a4142e76c111ddd5694e66904045188852eb3f48a6`，53,022,720 bytes；未发布 GitHub Release。

**2026-10-23 窗口居中与最大化详情布局（测试版，未发行）**：主窗口新增 `center: true`，实测 2048×1104 工作区上 1440×960 窗口位于 `(304,72)`，与工作区居中一致。新增 ≥1600px 的详情布局：内容最大宽度改为 `min(92vw,2000px)`，封面槽 450→560px，详情栏 390→640px，标题 48→约 59px 并允许四行，避免长标题被截断；最大化后详情标题和封面明显增大，普通 1440 初始化尺寸保持原布局。CDP 在 2048×1104 最大化窗口验证：布局宽 1884px、详情栏 640px、封面 560px、标题约 59px 且四行完整显示。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-window-layout3-preview.exe`，SHA-256 `1be75250a50de94b5c24a385a34cb0a571e39f93e0c82253199d02000a079b96`，52,443,136 bytes；未发布 GitHub Release。

**2026-10-23 立体查看小范围缓入（测试版，未发行）**：监听面仍用 `.object-stage` 接收事件，但有效范围改为封面矩形外扩 24px 的小光环，远离封面的舞台空白不再触发倾斜。首次从舞台进入光环时与离开一样使用 480ms 缓入，光环内继续移动使用 150ms 跟随；离开光环立即开始 480ms 缓出。CDP 验证：封面左 100px 不触发，左 20px 首次进入 `--tilt-duration:480ms`，继续移动到封面内变为 150ms，离开后回到 480ms 并复位。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-cover-tilt5-preview.exe`，SHA-256 `1f14b644e0386f1406797a2d3cf6e49fea40d5a01301d1f92ffa8988eabc3413`，51,687,424 bytes；未发布 GitHub Release。

**2026-10-23 立体查看范围外扩与慢回正（测试版，未发行）**：立体视角的监听面从封面槽扩大到整个 `.object-stage`，指针移到封面周围的空白边缘仍继续生效，倾斜角度以封面矩形为基准并在边缘封顶。鼠标离开舞台后不再立即回正：`--tilt-duration` 切到 480ms 缓出；在舞台内移动时保持 150ms 响应。CDP 验证：舞台左侧空白处仍输出倾斜矩阵，离开后 80ms 仍在回正、260ms 接近正面、约 560ms 完全复位。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-cover-tilt4-preview.exe`，SHA-256 `cb735b2df915cbfc6858167b825d65dfbd65219cbf44902afcd6f0329702f92f`，51,452,416 bytes；未发布 GitHub Release。

**2026-10-23 立体查看事件修复（测试版，未发行）**：详情封面通过 React portal 渲染，`onMouseMove` 挂在 portal 外的槽位上收不到鼠标事件，因此实测没有倾斜。现在改为在槽位节点上注册原生 `mousemove`／`mouseleave` 监听；同时移除鼠标悬停文字提示，并让 `prefers-reduced-motion` 只关闭过渡、不关闭视角。CDP 用真实鼠标事件验证：移动后生成倾斜矩阵、离开后变量复位到 0。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-cover-tilt3-preview.exe`，SHA-256 `4f0495f6db1e170d723f5213f1208d11fae087986aa5a20146cad4d21ffcf1b2`，51,200,512 bytes；未发布 GitHub Release。

**2026-10-23 无模型封面立体查看（测试版，未发行）**：对于没有 3D 模型的普通封面，详情页加入指针驱动的立体倾斜：鼠标位置映射为 `rotateX/rotateY/rotateZ`（约 ±8°／±12°／±1.5°），并移动封面高光位置；离开封面时平滑回到正面。模型条目继续使用现有 ModelView，前后编条目保留 3D 翻面，不叠加倾斜。`prefers-reduced-motion` 下关闭过渡。CDP 验证指针移动后生成倾斜矩阵与高光坐标，离开后复位。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-cover-tilt-preview.exe`，SHA-256 `501871b406efb57cde3cc54e12a069169bb821efd6adff7e9df399fd5994f8c1`，50,713,600 bytes；未发布 GitHub Release。

**2026-10-23 封面体积感简化（测试版，未发行）**：上一版在封面内部加右侧暗色脊线仍显得突兀。现在完全去掉边缘渐变条，只保留：柔和的底部环境阴影、极细的半透明轮廓、覆盖整张封面的轻微斜向高光。书架、详情实体盒、共享封面和前后编卡片统一使用这套样式；不再有任何独立灰色条或内侧暗边。CDP 检查详情实体盒为 `0 10px 22px #0008` 阴影、`1px rgba(255,255,255,.12)` 轮廓，无伪元素脊线。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-cover-clean-preview.exe`，SHA-256 `23a30fcb370be480b72ee08a06834e326e8613ebf578a14a7653d5bcb15bf5cc`，50,461,696 bytes；未发布 GitHub Release。

**2026-10-23 封面体积感重做（测试版，未发行）**：书架封面、详情实体盒、共享封面和前后编卡片原先用 `4px 0 #888`、`5px 1px #414141`、`4px 1px #888`、`6px 2px #ddd` 等硬偏移阴影模拟厚度，右侧灰色条与封面本体脱开。现在删除所有硬偏移条，改为附着在封面内部的右侧渐变脊线（`transparent 94% → 高光 97% → 暗边 100%`）加柔和环境阴影；边框仍保持 1px 实体轮廓。CDP 验证实体盒阴影为 `0 10px 22px #0008`，内部脊线渐变生效，没有独立灰色条。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-cover-volume-preview.exe`，SHA-256 `0297fa8a776a6ecee282c0993a9f42d800b36b3112120abbdbb5a4b90d7ee9a3`，50,210,304 bytes；未发布 GitHub Release。

**2026-10-23 设置状态缓存与去闪烁（测试版，未发行）**：设置页每次重新挂载都从 `null`／`false` 开始，先显示“未登录／未配置”，异步检查后才跳到已登录／已配置。现在网易云账号、集成设置、蓝光 KEYDB 状态均在模块级缓存：组件首次渲染直接使用上次确认的状态；重新检查时做字段级全量比较，只有状态变化才更新 React state；无缓存时显示“检查中…”而不是错误的未登录／未配置。CDP 验证：KEYDB 已配置状态跨“播放→网易云→播放”切换保持不变；网易云首次检查期间显示检查中，确认登录后再次切回立即显示账号名，不再闪回未登录。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-settings-cache-preview.exe`，SHA-256 `f24f2545a3442f37e79de1f47fe7d99c6ed098adabbcf8429561d9b566f519e6`，49,958,912 bytes；未发布 GitHub Release。

**2026-10-23 前后编改为连续 3D 翻面（测试版，未发行）**：上一版仍是两张独立卡片交换位置和 z-index，观感生硬。现在改为单一 `preserve-3d` 翻转容器：前编作为正面、后编旋转 180° 作为背面，`backface-visibility:hidden`，切换时容器绕 Y 轴连续旋转 520ms（`cubic-bezier(.2,.8,.2,1)`），不再瞬间切换层级或做两段位移。单卡软阴影也消除了右侧堆叠体积条；无海报时的独立占位逻辑保留。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-video-flip-preview.exe`，SHA-256 `54d790454e076c44662872f31bebcdd5561cf36e0ab52239bbf3bc92b7f43444`，49,724,416 bytes；未发布 GitHub Release。

**2026-10-23 前后编封面区分与翻面动画修复（测试版，未发行）**：前后编卡片原来始终在底层渲染同一张版本封面，某一份作品的独立海报缺失／加载失败时两张卡就显示相同图片。现在每张卡片只使用自己 `coverSourceKey` 对应作品的海报；没有海报或加载失败时显示带“前编／后编”及各自作品名的独立占位，不再回退到共用封面。翻面动画移除两段式 spread／130ms 定时器，改为单段 280ms `cubic-bezier(.23,1,.32,1)` 变换；卡片硬边 `2px 0 #53514d` 阴影改为柔和外阴影，减少右侧怪异体积条。验证两份海报 URL 不同、失败时占位标题不同、transition 为 0.28s。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-video-parts2-preview.exe`，SHA-256 `5609a379377a63e790085283756fcc5eb541a75ef009916185007a9cbf6c6524`，49,473,536 bytes；未发布 GitHub Release。

**2026-10-23 光驱关联弹窗匹配条目铺满（测试版，未发行）**：关联弹窗继承通用 `.panel-dialog` 固定 720px 高度，5 条结果下方留下大块空白；候选按钮的文字区域也没有占满剩余宽度。现在关联弹窗改用内容自适应高度（受视口上限约束），候选列表上限改为随视口计算，单条候选的左侧文字区 `flex:1` 占满整行，置信度仍靠右。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-optical-modal-preview.exe`，SHA-256 `ce4d97a9c2f4ce7c564062f94792a3ed86c3b48d382db3ab763a8d5bced760bf`，48,970,752 bytes；未发布 GitHub Release。

**2026-10-23 章节／角色／图库标题与刷新按钮对齐（测试版，未发行）**：章节、角色、图库的标题行受 `.setting-hint` 默认 `margin-top:8px` 和按钮 `padding:8px 0` 影响，角色／图库标题比章节低 8px，按钮基线也不统一。现在详情页统一标题行按基线对齐、标题零外边距、按钮零纵向 padding；CDP 测得三处标题和按钮的 top 分别为 382.9／383.7px，左右边界统一为 878.4／1298.4px，与简介、购入内容列一致。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-video-heading2-preview.exe`，SHA-256 `8f320cf51abce0d9bcd9e1aeeee1849130a80dfcc92914fe6abe3a226e587928`，48,719,872 bytes；未发布 GitHub Release。

**2026-10-23 章节页首段间距收紧（测试版，未发行）**：章节页“刷新章节”与第一章之间原来由标题边距、分组标题边距和首项 padding 叠加，实测 38px。现收紧章节专属边距，并隐藏空的分组标题；有“本篇”分组标题时降到 22px，无标题时约 6px。章节内容与刷新按钮仍保持清晰分隔。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-chapter-gap2-preview.exe`，SHA-256 `767859b9891b3bd4b21f4c1262ff72046b503dccfd35181210c07ebb6e7b1e23`，48,218,112 bytes；未发布 GitHub Release。

**2026-10-23 章节与角色末尾分割条修复（测试版，未发行）**：章节行和角色行原来每项都有 `border-bottom`，最后一项会在列表末尾多出一条分割线。现在只有非最后一项保留行间横线，由 `.video-chapter-list`／`.video-characters` 容器统一提供固定底部分割线。CDP 检查 12 章、13 个角色：最后一项 `border-bottom-width` 为 0，列表容器为 0.8px；视觉上仍保留列表底部分隔。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-video-divider-preview.exe`，SHA-256 `3e78b74bbfa3c3dd19a00cd0cc96dfeb4132ddaeab177429f6cdb98c8b2e6484`，47,716,352 bytes；未发布 GitHub Release。

**2026-10-23 列表列对齐与分隔线修复（测试版，未发行）**：列表首个单元格原来直接 `display:flex`，破坏了表格单元格布局，造成载体列附近横线 1px 错位；表头又继承浏览器默认居中和 1px 内边距，载体／状态／价格标签未与内容左对齐。现在保留 `td` 为 `table-cell`，把拖拽按钮、封面和标题放进内部 flex 包装；表头显式 `text-align:left`、`padding:0`，数据单元格垂直居中。CDP 测得四列表头与首行单元格左右边界完全一致。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-list-align-preview.exe`，SHA-256 `928dce6360d6569cd33bc5b0e76c96d4176f297f6afb62982607e146015a0511`，47,465,472 bytes；未发布 GitHub Release。

**2026-10-23 列表返回缓出速度对齐打开（测试版，未发行）**：列表返回的淡出从 420ms 缩短到与打开动画一致的 280ms，并复用 `ARTWORK_MOTION_DURATION`／`ARTWORK_MOTION_EASING` 常量，避免两处动画各自漂移。CDP 验证关闭后约 280ms 完成淡出并移除，打开与关闭时长一致；再次打开仍立即显示封面。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-list-speed-preview.exe`，SHA-256 `4e64f10cd88765614a0b685a9c5b1c66177dd49bb1dde5db6f8262ec03f9327a`，47,214,592 bytes；未发布 GitHub Release。

**2026-10-23 再次打开详情封面不显示修复（测试版，未发行）**：缓出动画使用 `fill: forwards`，移除后节点仍保留透明度 0；再次打开时共享封面虽然重新挂载，却保持不可见，直到关闭才短暂出现。现在动画结束后取消 fill 并清除透明度；同时让当前条目的详情 portal 在列表/书架状态下保持挂载但从文档中分离，封面与图片节点常驻，重新打开时直接追加并立即显示。CDP 连续打开—关闭—再打开验证：第二次打开首个双 RAF 时图片已存在且 `opacity: 1`，关闭后缓出与最终移除仍正常。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-list-reopen2-preview.exe`，SHA-256 `18b2cfbe162fc6be42938ffe7fe505b373081b19cc9f76fb3ce7b89df5793128`，46,980,096 bytes；未发布 GitHub Release。

**2026-10-23 列表返回封面缓出（测试版，未发行）**：在上一项“列表无书架槽时立即移除”基础上改为 420ms `ease-out` 透明度缓出，动画完成后才移除共享封面；`prefers-reduced-motion` 下仍直接移除。CDP 实测关闭后 30ms 透明度 0.967、150ms 0.482、300ms 0.035、约 420ms 后移除，不再突兀消失，也没有长时间残留。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-list-fade2-preview.exe`，SHA-256 `ad0bb50d3b62c1c6f60a5f0bff70c034e9cfdacc88400cae248f19319eefcb25`，46,511,616 bytes；未发布 GitHub Release。

**2026-10-23 列表返回残留封面修复（测试版，未发行）**：整理列表模式没有书架封面槽，进入详情再返回时 `prepareClose` 把当前矩形当作目标，共享封面会一直挂在关闭中的详情弹窗里，直到弹窗过渡结束才随组件卸载。现在关闭前检查 `shelf.isConnected`；列表模式没有可用书架槽时立即取消动画并移除共享封面，不再等待弹窗关闭。CDP 在列表详情按 Escape 后 30ms 检查：弹窗已关闭且 `.shared-artwork` 不存在。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-list-return-preview.exe`，SHA-256 `19a79c00c39259e19781f1a528e9a8c0b5a77924393f26e9cda2dc47c4c6b941`，46,043,136 bytes；未发布 GitHub Release。

**2026-10-23 详情封面旁双击选中修复（测试版，未发行）**：详情物体舞台、封面槽、共享封面、实体盒和图片统一设置 `user-select: none`，并禁止图片拖拽，双击封面周围空白不再选中图片或文字。CDP 在详情舞台空白处发送双击后 `window.getSelection()` 为空，舞台和封面计算样式均为 `user-select: none`。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-detail-select-preview.exe`，SHA-256 `f1337d927ec4164598d00b5f17e01971be8d0dd3cb674f5f90f0c6eb238b4c29`，45,809,152 bytes；未发布 GitHub Release。

**2026-10-23 封面放大闪屏修复（测试版，未发行）**：点击封面进入详情时，共享封面 portal 会重新挂载一个 `Cover`，而解码缓存在多张大图之间可能被淘汰，导致图片再次加载并重播扫描／淡入。现在当前条目的封面 URL 在组件状态中固定保留，详情 `Cover` 直接带预载 URL 渲染并立即标记 `data-loaded`，同时保留已解码缓存快速路径。经 CDP 在点击后的首个双 RAF 检查，详情封面已存在且 `opacity: 1`，不再出现空图或扫描闪烁。110 项脚本测试、TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-cover-preload2-preview.exe`，SHA-256 `76bceba8deec874e0e09e2aaa1d78251cd189149813c373fad546c87fa1d8aee`，45,558,272 bytes；未发布 GitHub Release。

**2026-10-23 收藏库模糊搜索修复（测试版，未发行）**：收藏搜索不再依赖 SQLite 区分大小写的 `instr` 精确子串。现在统一做小写化、全角转半角、Windows `LCMapStringEx` 简繁体归一，支持部分匹配、多关键词同时匹配、4 字符以上 1–2 个编辑距离的模糊匹配，以及标题、作者、版本名、条码、品番、介质标签、来源 ID、导入标识符、卖家、存放位置和备注的联合搜索；3 字符拉丁词仍只做直接子串，避免 `lem` 误命中 `Limited`。154 项工作区 Rust 测试（含 4 项搜索单元测试和 1 项端到端搜索测试）、110 项脚本测试、严格 Clippy、格式检查和 TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-search-preview.exe`，SHA-256 `6c14243ab51991377d9be03477ec1bfc10e71e622e4e0dbe7a7bd01fda79fb96`，44,855,808 bytes；未发布 GitHub Release。

**2026-10-23 光驱标题误匹配修正（测试版，未发行）**：`DVD_VIDEO` 等通用卷标曾通过介质标签前缀匹配到库中 DVD 标签为“DVD”的其他作品，导致 Lemon DVD 被误识别为 Radwimps 的 `2+0+2+1+3+1+1= 10 Years 10 Songs`。现移除介质格式标签参与识别，要求前缀匹配双方至少 4 个字符，并把仅作者匹配降为弱匹配：不再自动显示为识别标题，只提示“同作者，请选择”。4 项标题匹配测试、110 项脚本测试、TypeScript／Vite 构建通过。修正预览 `target/release/DiscAtelier-optical-match-preview.exe`，SHA-256 `d46741775f907529d06fc54895311cd7858fcffa08ffe014741ead0a8b55a46d`，44,832,256 bytes；未发布 GitHub Release。

**2026-10-23 DVD 章节识别与进度条切片（测试版，未发行）**：DVD 播放时只读解析 `VIDEO_TS.IFO` 标题表与对应 `VTS_xx_0.IFO` 的 PGC/program/cell 表，按 cell 播放时长计算章节起点和时长；进度条显示章节刻度和按章节时长比例排列的可点击分段，点击通过 libVLC 章节接口跳转，非标准 IFO 或解析失败时退回普通进度条。解析失败、非 DVD 或菜单画面不伪造分段。149 项工作区 Rust 测试、110 项脚本测试、严格 Clippy、格式检查和 TypeScript／Vite 构建通过；IFO 解析用合成 IFO 测试，真实 DVD 的标题映射、多角度／多 PGC 和章节跳转仍需按 [DVD 章节验收](docs/DVD-CHAPTERS.md) 手动验收。测试预览 `target/release/DiscAtelier-dvd-chapters-preview.exe`，SHA-256 `8ca36d18f73c19434450f2a08549154e5d7c00c4e036a7889bafda034eea7e7f`，44,621,824 bytes；未发布 GitHub Release。

**2026-10-23 光驱标题识别与库关联（测试版，未发行）**：光驱面板把卷标规整后与已拥有副本的标题、作者、版本名、条码／编号和介质标签比对，显示“识别为”候选；可打开关联窗口搜索全库并关联／更换／取消。关联按光盘媒体令牌写入新表 `optical_bindings`（schema 15，删除副本时级联清理），不写光盘。收藏详情轮询只读光驱状态，显示“在光驱中 · 盘符”或“光驱播放中”。148 项工作区 Rust 测试、2 项桌面标题匹配测试、4 项桌面设置／密钥测试、110 项脚本测试、严格 Clippy、格式检查和 TypeScript／Vite 构建通过。测试预览 `target/release/DiscAtelier-optical-link-preview.exe`，SHA-256 `04ff0cf8fc627a8a1dda3e98415ba98f4743475652b21fb09a7afbd691ed6f8a`；未发布 GitHub Release，实盘识别、关联和详情状态由用户手动验收。

**2026-10-22 0.1.18 已发布**：蓝光本地解密（libaacs／libbdplus、FindVUK 日语优先＋英语补齐的 KEYDB 自动下载、下载进度、来源显示、MakeMKV 兼容兜底）、Bangumi Token 链接与 7／14／30／90／180／365 天到期提醒、Discogs Token 链接和封面扫描淡入动效纳入正式发行。147 项工作区 Rust 测试、4 项桌面设置／密钥测试及本地签名验证、110 项脚本测试、严格 Clippy、格式检查、TypeScript／Vite 和签名 NSIS 构建通过；五项资产草稿／正式回读一致，实际私有更新下载验签通过、篡改包拒绝。发布后逐个删除 61,303 个预览程序和构建缓存文件，失败 0，文件大小统计约减少 21.18 GiB；保留源码、签名密钥、主程序、`aacs`／`netease-runtime` 资源、收藏与备份。详见 [0.1.18 发布校验](docs/releases/v0.1.18-verification.md)。蓝光实盘解密与兜底仍需用户手动验收。

**2026-10-22 蓝光本地解密 libaacs + KEYDB（测试版记录，已并入 0.1.18）**：蓝光默认改走随包的 libaacs 0.12.0／libbdplus 0.2.0，由 MPV 内置 libbluray 边读边解密，不启动 MakeMKV 实例；设置页可从 FindVUK Online Database 自动下载／更新 KEYDB.cfg（默认日语，英语补齐缺失条目，日语标题优先；下载区域显示连接、双文件下载、合并和写入进度条），并显示已下载来源（日语／英语／本地导入）和更新时间；也可导入本地文件（校验后原子复制到 libaacs 标准 `%APPDATA%\aacs` 目录，保留旧文件备份，不改源文件、不记录密钥）。Bangumi 设置新增 Token 获取链接、7／14／30／90／180／365 天过期时间下拉框和到期状态提醒；Discogs 设置新增开发者页面跳转。封面加载时使用暗灰底色和自左上向右下的白色扫描光（2.8 秒一周），图片解码完成后淡入并停止扫描；收藏架、详情、表单、Discogs 搜索结果和网易云封面共用该动效。修正缓存图片先触发 load、随后 effect 重置加载状态导致永久扫描的问题，加载状态改为按图片 URL 记录。MakeMKV 兼容兜底复选框与 libmmbd64.dll 路径放在同一行，不再单独居中。Discogs 设置页新增“获取 Token ↗”按钮，跳转到 Discogs 开发者设置页。仅对明确识别的 AACS／BD+／KEYDB 缺失／AACS2 解密能力失败尝试兜底，且要求开关打开和 DLL 有效；普通读盘错误、光盘取出、停止、区域不匹配和 BD-J 提示不触发。兜底前释放前一 MPV 会话，播放时显示“正在使用兼容模式”。界面分别显示 AACS／BD+／BD-J 检测结果，区域仍为“未确认”，不修改光驱区域、固件或光盘，不宣称全区或完整 BD-J 菜单。147 项工作区 Rust 测试（排除桌面 crate，5 项按环境忽略）加 3 项桌面 ZIP／进度测试、1 项令牌到期状态测试和 1 项已手动执行的 FindVUK 下载测试、110 项脚本测试、严格 Clippy、格式检查和 TypeScript／Vite 构建通过；实际 FindVUK 日语＋英语下载和合并写入临时 APPDATA 后通过校验；本测试版不发布 GitHub Release。预览 `target/release/DiscAtelier-cover-preview.exe`，SHA-256 `6115f524f536f7f103656095d87c7d51cd69e0449834bcbd974f7fe449525244`；实盘解密、兜底和播放控制由用户手动验收。

**2026-10-22 0.1.17 已发布**：助手 Markdown 显示、即时发送与重试，网易云 15 MiB 封面与 schema 14 迁移，小米 MiMo 空 `tool_calls` 兼容，更新安装自动停播与说明完整显示，视频音量／倍速与底部控制条，收藏删除，章节／图库确认按钮上移、空简介显示及详情封面侧面按钮移除，均纳入正式发行。110 项脚本测试、139 项 Rust 测试（排除桌面 crate，5 项按环境忽略）、严格 Clippy、格式检查、TypeScript／Vite 与签名 NSIS 构建通过；草稿和正式发布五项资产完整回读一致，实际私有更新下载与签名验证通过，篡改包被拒绝。发布后逐个删除 56,646 个预览程序和构建缓存文件，失败 0，文件大小统计约减少 18.88 GiB；保留源码、签名密钥、主程序、`netease-runtime` 资源、收藏与备份。详见 [0.1.17 发布校验](docs/releases/v0.1.17-verification.md)。

**2026-10-22 详情封面侧面按钮移除（未发行）**：收藏详情中没有模型的封面不再显示“侧面／正面”切换按钮，封面保持默认正视角；两编版本的“翻面”按钮保留。同步删除 `data-side` 状态、侧面旋转样式和相关旧 `side` 选择器。110 项脚本测试、TypeScript／Vite、全工作区 139 项 Rust 测试（排除桌面 crate，5 项按环境忽略）、严格 Clippy 与格式检查通过。Tauri Release 预览 `target/release/DiscAtelier-netease-cover-15mb-preview.exe` 已重建，SHA-256 `9bf2c350ce25a03ebdfcc3eadb2ad368cc79245ca40aab17bb4e1931a516dbfd`，与构建主程序一致；`DiscAtelier-assistant-preview.exe` 同步为同一构建；同目录保留 4,831 个 `netease-runtime` 运行资源。未打包安装包；实际详情封面显示由用户验收。

**2026-10-22 助手消息与输入体验（未发行）**：助手回复改用安全的轻量 Markdown 渲染，支持标题、列表、引用、代码块、强调、删除线和 http/https 链接，原始 HTML 只按文本显示，不使用 `dangerouslySetInnerHTML`。发送后输入框立即清空，用户消息先以动画出现；发送／停止按钮移入输入框内部右下角。最后一条用户消息在空闲状态可重试，重试入口是气泡下方、右对齐的圆形箭头图标、不带文字；对话消息区不再显示滚动条。后端会丢弃该轮中断的回答和工具消息后重新请求，不重复用户消息。新增 2 项 Markdown 解析测试和 1 项重试前置回归；110 项脚本测试、TypeScript／Vite、全工作区 139 项 Rust 测试（排除桌面 crate，5 项按环境忽略）、严格 Clippy 与格式检查通过。主预览正被运行占用，本轮构建另存为 `target/release/DiscAtelier-assistant-preview.exe`，SHA-256 `2cb69b79976a9da89f711579db2bb45b37b7c698bcb1d220f00041190e1a3ac9`（随后被上方详情封面侧面按钮移除构建替换，当前哈希以最新条目为准），与构建主程序一致；同目录保留 4,831 个 `netease-runtime` 运行资源。未打包安装包；Markdown 显示、发送动效和重试由用户验收。

**2026-10-22 删除确认弹窗与空简介显示（未发行）**：收藏删除的二次确认改为屏幕中央的窄幅弹窗（约 460px），带小号“删除收藏”标题，提示语位于标题下，取消与确认按钮在底部右侧并留出间距；背景使用模糊遮罩，弹窗与遮罩均有进入／退出动效，Esc 只关闭确认弹窗、不关闭收藏详情。没有简介的网易云专辑和作品条目仍显示“简介”标题，内容显示为“无”，不再隐藏整个简介区或显示特殊占位提示。108 项脚本测试、TypeScript／Vite、全工作区 138 项 Rust 测试（排除桌面 crate，5 项按环境忽略）、严格 Clippy 与格式检查通过。`DiscAtelier-delete-confirm-preview.exe` 为上一版且正被运行占用；收窄标题版构建写入 `target/release/DiscAtelier-netease-cover-15mb-preview.exe`，SHA-256 `aef8f017a4c9615dab25d701e983e55b4020c81054ff019933aabef16bf65048`（随后被上方助手消息与输入体验构建替换，当前哈希以最新条目为准），与构建主程序一致；同目录保留 4,831 个 `netease-runtime` 运行资源。未打包安装包；实际弹窗动效与空简介显示由用户验收。

**2026-10-22 收藏删除（未发行）**：收藏详情新增“删除收藏”，二次确认后按副本 revision 在事务内删除。同版本还有其他副本时只删除该套收藏及购入记录，版本资料、封面和模型保留；最后一套时清理版本、媒体、来源与标识符、内容、网易云关联、章节／图库快照及不再被其他版本引用的封面或模型资产，播放历史保留。请求使用幂等 receipt，过期 revision 返回冲突。新增 2 项存储回归（共享版本与资产保留、最后一套清理与历史保留），未新增 schema 迁移。全工作区 138 项 Rust 测试（排除桌面 crate，5 项按环境忽略）、108 项脚本测试、TypeScript／Vite、严格 Clippy 与格式检查通过。Tauri Release 预览 `target/release/DiscAtelier-netease-cover-15mb-preview.exe` 已重建（同时包含 schema 14、15 MB 封面、空简介、封面格式识别、助手流式、更新安装、章节／图库按钮、音量／倍速和控制条修复），SHA-256 `d78ddd72839bdfacc7e2e61cb15a2ec909e8cc0de1f3f489ff4e17872e589ddd`，与构建主程序一致；同目录保留 4,831 个 `netease-runtime` 运行资源。未打包安装包；实际删除界面与确认流程由用户验收。该预览随后被用户运行占用，修正版另存并见上方新条目。

**2026-10-22 视频播放器控制条常规划（未发行）**：视频播放器顶栏只保留返回和当前标题，进度、音量、倍速、暂停／继续、音轨、全屏／退出全屏、停止和 DVD 菜单全部移到底部控制条；全屏按钮不再位于窗口顶端，避免最大化时被自定义窗口控制条遮挡。底部控制条改为可复用的标题开关与全屏入口，播放器页脚高度从 205 调为 170；全屏空闲收起、Esc／F 和 DVD 方向键行为不变。108 项脚本测试、TypeScript／Vite 构建通过；本轮未改 Rust，最近全工作区 136 项 Rust 测试、严格 Clippy 与格式检查保持通过。Tauri Release 预览 `target/release/DiscAtelier-netease-cover-15mb-preview.exe` 已重建（同时包含 schema 14、15 MB 封面、空简介、封面格式识别、助手流式、更新安装、章节／图库按钮和音量／倍速修复），SHA-256 `f0d39574db99685d28b052f6c4af91bb0cc2843a0e8cf8e4a7906bc7b2f44955`（随后被上方收藏删除构建替换，当前哈希以最新条目为准），与构建主程序一致；同目录保留 4,831 个 `netease-runtime` 运行资源。未打包安装包；实际窗口、最大化与全屏布局由用户验收。

**2026-10-22 视频播放器音量与倍速（未发行）**：内置视频播放控制新增 0–100% 音量和 0.5／0.75／1／1.25／1.5／2 倍速，保留进度、暂停、音轨、停止与 DVD 菜单；音量与倍速只在视频播放器中显示。`PlaybackControl` 增加 `Volume`／`Rate`；MPV 下发 `volume`／`speed`，VLC 调用 `libvlc_audio_set_volume`／`libvlc_media_player_set_rate`；两个后端在快照中回传当前设定值，变速时重置观看进度采样，音量限制 0–100、速度限制 0.25–4 倍。108 项脚本测试、TypeScript／Vite、全工作区 136 项 Rust 测试（排除桌面 crate，5 项按环境忽略）、严格 Clippy 与格式检查通过。Tauri Release 预览 `target/release/DiscAtelier-netease-cover-15mb-preview.exe` 已重建（同时包含 schema 14、15 MB 封面、空简介、封面格式识别、助手流式、更新安装和章节／图库按钮修复），SHA-256 `31d5d387ac7d6a4ddc1a4081b5b50178bd14462d9755dc8d5028239bb8ed4343`（随后被上方视频播放器控制条常规划构建替换，当前哈希以最新条目为准），与构建主程序一致；同目录保留 4,831 个 `netease-runtime` 运行资源。未打包安装包；实际光盘／视频音量与倍速由用户验收。

**2026-10-22 章节与图库确认按钮上移（未发行）**：收藏详情的章节、图库来源预览把“确认保存这些章节／确认保存此图库”和“取消”从内容底部移到标题行右侧，与刷新按钮同组；点击确认后按钮立即移除并显示“保存中…”，保存失败时恢复按钮并保留草稿以便重试。章节与图库组件的保存入口同步为相同结构。108 项脚本测试、TypeScript／Vite 构建、全工作区 136 项 Rust 测试（排除桌面 crate，5 项按环境忽略）、严格 Clippy 与格式检查通过。Tauri Release 预览 `target/release/DiscAtelier-netease-cover-15mb-preview.exe` 已重建（同时包含 schema 14、15 MB 封面、空简介、本地封面格式识别、助手流式和更新安装修复），SHA-256 `be165226a3e1768e41cd48894b5dbef23f4b157f1ab94342034218b895f025c1`（随后被上方视频播放器音量与倍速构建替换，当前哈希以最新条目为准），与构建主程序一致；同目录保留 4,831 个 `netease-runtime` 运行资源。未打包安装包、未写入真实收藏；实际布局与确认流程由用户验收。

**2026-10-22 更新安装与说明显示修正（未发行）**：安装更新不再要求先手动停止播放。后端在更新签名验证后自动关闭播放会话，等待播放线程结束并写入最终播放历史，再取得收藏库锁、执行升级前备份并启动安装器；播放中“安装并重启”保持可用，提示改为自动停止播放并备份。更新说明去掉 150px 内层滚动限制，在设置内容区完整展开，并为设置内容启用可见滚动条，长说明不再被隐藏滚动条截断。全工作区 136 项 Rust 测试（排除桌面 crate，5 项按环境忽略）、108 项脚本测试、TypeScript／Vite、严格 Clippy 与格式检查通过。Tauri Release 预览 `target/release/DiscAtelier-netease-cover-15mb-preview.exe` 已重建（同时包含 schema 14、15 MB 封面、空简介、本地封面格式识别和助手流式修复），SHA-256 `2408fa3c1a91a628c9ef0d27d46e0f40d9b22fda902f6329c52cf6b5b56bb495`（随后被上方章节与图库确认按钮上移构建替换，当前哈希以最新条目为准），与构建主程序一致；同目录保留 4,831 个 `netease-runtime` 运行资源。未打包安装包；实际更新安装和播放中升级由用户验收。

**2026-10-22 助手流式空 tool_calls 修复（未发行）**：使用 Xiaomi `mimo-v2.6-flash` 时，每个 SSE 分片的 `delta` 都显式带 `"tool_calls":null`；`Delta.tool_calls` 为 `Vec<Call>` 并只加 `#[serde(default)]`，只能处理字段缺失，`null` 被 serde 判为类型错误，助手报「流式字段不匹配」。改为 `Option<Vec<Call>>` 并在累积时按空数组处理，保留原有工具索引／类型／结束原因校验。用配置的 MiMo 服务捕获真实分片确认 `tool_calls:null`，并新增同形状回归（`content:null`、`reasoning_content`、`tool_calls:null`）；全工作区 136 项 Rust 测试（排除桌面 crate，5 项按环境忽略）、严格 Clippy、格式检查，以及 108 项脚本测试、TypeScript／Vite 构建通过。Tauri Release 预览 `target/release/DiscAtelier-netease-cover-15mb-preview.exe` 已重建（同时包含 schema 14、15 MB 封面、空简介和本地封面格式识别修复），SHA-256 `27a733e8f82d7a332ab74bcab365c4be5d894b6a68cef19c403123539b90fbce`（随后被上方更新安装与说明显示修正构建替换，当前哈希以最新条目为准），与构建主程序一致；同目录保留 4,831 个 `netease-runtime` 运行资源。未打包安装包、未写入真实收藏；真实助手对话由用户验收。

**2026-10-22 本地封面格式识别修复（未发行）**：用户提供的 `UPCH-29241_Add_extralarge.jpg` 实际为 PNG（500×500 RGBA，655,552 字节），Windows／Chromium 按扩展名报告 `image/jpeg`；手动封面读取直接使用 `readAsDataURL(file)`，把 JPEG 前缀写入 data URL，保存时被 `assets` 的格式一致性检查拒绝，提示「封面格式与文件内容不一致」。`readCover` 改为读取文件字节签名（PNG／JPEG／WebP）决定 MIME，再用对应类型的 Blob 生成 data URL；扩展名和浏览器声明类型不再影响校验，无法识别的容器给出明确提示。新增 2 项前端回归（签名识别、PNG 命名为 .jpg 的完整读取）；108 项脚本测试、TypeScript／Vite、全工作区 135 项 Rust 测试、严格 Clippy 与格式检查通过。Tauri Release 预览 `target/release/DiscAtelier-netease-cover-15mb-preview.exe` 已重建（同时包含 schema 14、15 MB 封面和空简介修复），SHA-256 `7fc855201134e1bce408f948acc0fb4becc89cb4421f54366aac4bfa89ed79d6`（随后被上方助手流式空 tool_calls 修复构建替换，当前哈希以最新条目为准），与构建主程序一致；同目录保留 4,831 个 `netease-runtime` 运行资源。未打包安装包、未写入真实收藏；实际上传由用户验收。

**2026-10-22 网易云空简介修复（未发行）**：专辑 405163276 的 `/album` 响应中 `album.description` 为 `null`，适配结构把它当作 `String` 并只加 `#[serde(default)]`（只处理字段缺失），因此报「网易云专辑响应格式不匹配」。改为 `Option<String>` 并归一为空字符串，字段缺失或为 `null` 都不再影响曲目、歌手、发行信息和封面。新增空简介与字段缺失回归；用内置运行时真实响应核对标题、8 位歌手和 28 首曲目。全工作区 135 项 Rust 测试（排除桌面 crate，5 项按环境忽略）、严格 Clippy 与格式检查通过。Tauri Release 预览 `target/release/DiscAtelier-netease-cover-15mb-preview.exe` 已重建（同时包含 schema 14 与封面上限修复），SHA-256 `b1eea39e707ccb77c6888f3d37adf9cf692e499e3b6fa577a3a0600f96ca8b2d`（随后被上方本地封面格式识别修复构建替换，当前哈希以最新条目为准），与构建主程序一致；同目录保留 4,831 个 `netease-runtime` 运行资源。未打包安装包、未写入真实收藏；界面与联网读取由用户验收。

**2026-10-22 网易云封面上限调整与 schema 14（未发行）**：网易云封面下载与封面资产保存上限由 8 MB 提高到 15 MB，覆盖「编辑版本 → 使用网易云封面」「网易云资料 → 用作封面」及助手封面提案；专辑／图片域名、禁重定向、8192px 解码检查保留，手动选择封面及其他来源仍按各自 8 MB 限制。首轮预览保存 8 MB 以上封面时报「数据库操作失败，数据未提交」：定位为 `assets` 表仍保留 `CHECK(byte_length BETWEEN 1 AND 8388608)`，`INSERT OR IGNORE` 忽略表检查后，`editions.cover_asset_id` 外键找不到刚写入的资产，并非磁盘或文件权限问题。schema 13→14 重建封面资产表并把表级上限同步为 15 MB；迁移沿用升级前一致性备份，事务内暂停外键并在提交前执行 `foreign_key_check`，资产写入改为仅忽略主键冲突。新增 v13 旧库迁移、既有资产保留及 10 MB 封面入库回归；15 MB 封面经完整 IPC 保存成功，迁移后外键检查为空。全工作区 134 项 Rust 测试（排除桌面 crate，5 项按环境忽略）及严格 Clippy、格式检查通过。Tauri Release 预览 `target/release/DiscAtelier-netease-cover-15mb-preview.exe` 已重建，SHA-256 `ef27b184746b98cad6db379904e984592ca486a9365e4cbfca13ad76e314874c`，与构建主程序一致；同目录保留 4,831 个 `netease-runtime` 运行资源（该预览随后被后续构建替换，当前哈希以最新条目为准）。未打包安装包；诊断和验证使用数据库副本，未写入真实收藏；真实库首次打开会先备份再迁移到 schema 14，大图下载和界面显示由用户验收。见 [封面与播放预览](docs/MUSIC-QUEUE-PREVIEW.md)。

**2026-10-22 V3 模型兼容（未发行）**：按 AtelierPublisher 的真实 v3 定义接入六套固定装配，保留 V2 与现有按需加载／首帧淡切。原生校验、事务入库与备份恢复覆盖 v3，结构动作按需加载并通过 React 控件呈现，取消加载和退出停止纹理任务／动画。67 项脚本测试、145 项 Rust 测试、严格 Clippy、TypeScript／Vite 和 Tauri Release 预览构建通过；六份实际包原生图片校验、六套几何／会话取放归位及四套歌词本翻页视角检查通过，目录中 16 份 V2/V3 模型均可解析。完整回归前两次遇到 Windows 拒绝执行依赖构建程序，用户要求重试后原配置通过。预览 `target/release/DiscAtelier-model-v3-preview.exe` 已校验，4,834 个共享运行资源一致，现有正式程序保持不变。测试未操作用户窗口和个人库，实际渲染由用户手动验收；未发布安装包。见 [V3 说明与测试](docs/MODEL-V3.md)。

**2026-10-21 0.1.11 已发布**：手机扫码、同 Wi-Fi 购物截图上传、图片读取超时与取消、识别结果勾选修复纳入正式发行。63 项前端测试、142 项 Rust 测试、严格 Clippy、前端及签名 NSIS 构建通过；五项资产在草稿与正式发布后完整回读一致，应用实际私有更新下载及验签通过，篡改包被拒绝。保留 schema 8、更新签名身份与数据目录。发布确认后逐个删除 20,867 个安装包／旧预览／缓存文件，失败 0 个、不删除目录；按文件标识去重约减少 9.42 GiB。正式程序及每处 4,834 个运行资源保留并校验，收藏与备份未触碰。真实安卓 Chrome 选图、相机扫码和覆盖安装仍由用户验收，详见 [发布校验](docs/releases/v0.1.11-verification.md)。以下预览状态为历史开发记录。

**2026-10-21 截图勾选与手机读取反馈修正（未发行）**：确认购物截图结果的复选框被全局 `appearance: none` 隐藏了勾选外观，现局部恢复原生勾选、键盘焦点，并显示已选字段数量；事件处理先捕获勾选值再更新状态。针对安卓 Chrome 选图后无缩略图且按钮无响应的反馈，图片读取改为 FileReader／图片元素优先、备用位图解码，各异步阶段增加超时与清理，手机增加取消读取、上方阶段进度、逐张预览，读取完成后才重置文件选择框。手机具体卡点尚未由真实设备日志确认，不把防卡住处理视为实机验收通过。63 项脚本测试（含 5 项新增图片超时、取消、备用读取和资源释放回归）及 TypeScript／Vite 构建通过；需用户在新预览中复测。

修复版 Release 构建已通过：`target/release/DiscAtelier-phone-images-fix.exe`，已与构建程序校验 SHA-256；正式程序保持不变，未启动程序或操作收藏数据。构建与哈希记录见 `artifacts/phone-connection/images-fix-build.log`、`images-fix-verification.json`。

**2026-10-21 安卓同 Wi-Fi 手机接入（未发行）**：Discogs 搜索新增“手机扫条码”，购入编辑／添加新增“手机传图”；临时二维码打开内置手机页，支持拍照识别 EAN-13／UPC-A／EAN-8、核对后回填搜索，以及多张截图传入现有表单再人工触发 AI 识别。连接按需开启、一次接收后关闭，具备随机凭据、来源校验、图片大小限制、幂等处理和超时清理，不修改数据库结构、不公开收藏／密钥接口。58 项脚本测试、142 项 Rust 测试及严格 Clippy／前端构建通过；6 项有意跳过的专项 Rust 测试未计入通过数。安卓相机、真实局域网连接和界面动效待用户手动验收，见 [手机接入与测试步骤](docs/PHONE-CONNECTION.md)。

本轮 Release 预览已生成并校验：`target/release/DiscAtelier-phone-preview.exe`，4,831 个共享运行资源一致，原 0.1.10 正式程序哈希未变。首次构建遇到 Windows 错误 5，按原配置重试成功；最终构建日志及哈希记录于 `artifacts/phone-connection/`。没有启动应用、发布安装包、修改防火墙或操作个人收藏与备份。

**2026-10-21 0.1.10 已发布**：右下角助手浮窗、流式回复、收藏变更确认、播放控制和购物截图填写已纳入正式发行。56 项脚本、136 项 Rust 测试、严格 Clippy、签名构建通过，313 项依赖声明无缺失许可证；五项远端资产在草稿和正式发布后完整回读一致，实际私有更新下载／验签通过，篡改包被拒绝。沿用签名与数据目录，schema 8 不变。上传验证后逐个删除本地安装包、3 个旧预览及无用缓存共 24,492 个文件，失败 0 个、不删除目录，去重约减少 10.65 GiB；收藏、备份、正式主程序和运行资源保留。详见 [发行内容](docs/releases/v0.1.10.md)及[验证与清理记录](docs/releases/v0.1.10-verification.md)。

**2026-10-21 购物截图填写（未发行）**：编辑购入和添加收藏的购入步骤接入单张／多张上传及图片粘贴，复用配置的图片 AI 模型。分订单展示识别字段、原文依据和修改前后值，勾选后仅填写草稿，普通保存才写收藏；金额／币种绑定应用，无数据库迁移，截图不持久化。56 项脚本、136 项 Rust 测试和严格 Clippy／前端构建通过；真实图片模型及界面待用户手动验收，见 [截图填写测试](docs/PURCHASE-SCREENSHOTS.md)。

本轮 Tauri Release 预览为 `target/release/DiscAtelier-purchase-screenshots-preview.exe`，程序及共享运行资源入口哈希校验通过。未启动程序、操作个人收藏或发布安装包。

**2026-10-21 0.1.9 发布**：备份占用、手动选择删除和折叠区域键盘导航纳入正式发行。53 项前端、119 项 Rust 测试及严格 Clippy、签名 NSIS 构建通过；五项远端资产完整回读一致，实际私有 GitHub 更新下载与验签通过，篡改包被拒绝。沿用数据目录、schema 8 和更新签名身份，不自动清理个人备份。按用户授权在发布验证后清理本地安装包、旧测试程序和无用构建缓存；结果见 [发布校验](docs/releases/v0.1.9-verification.md)。

0.1.9 发布后已按明确清单逐个删除 105,866 个旧程序／缓存文件，无失败，不删除目录；文件标识去重后约减少 44.80 GiB。当前正式程序及运行资源已保留并校验，收藏与备份未触碰；项目约 1.54 GiB，另一构建目录约 0.16 GiB。

**2026-10-21 备份管理**：设置 → 数据新增折叠式备份占用、日期与大小列表，支持勾选、确认后逐个删除，显示部分完成结果并在失败时停止。管理不依赖数据库 schema，限制在备份目录并与备份／恢复／升级串行，当前收藏不在删除范围内。7 项删除安全测试、3 项升级备份回归、53 项前端测试及严格 Clippy／前端构建通过；用户数据未被操作，实际界面待手动验收。另完成项目空间只读排查并记录发布后缓存清理授权，见 [备份管理与空间说明](docs/BACKUP-MANAGEMENT.md)。

本轮 Tauri Release 预览已构建并校验：`target/release/DiscAtelier-backups-preview.exe`。未启动程序或制作发行版，未清理用户备份或构建缓存。

**2026-10-21 编辑封面入口**：音乐收藏的「编辑版本」封面区增加「使用网易云封面」，按点击时已保存的专辑关联获取图片，仅替换编辑草稿，随「保存版本」提交；取消编辑不改变已存封面。加载和失败状态复用封面控件，未关联时明确提示，预览淡入。TypeScript / Vite 与 Tauri Release 构建通过，未变更数据结构；实际界面与下载待手动验收，见 [增量预览](docs/MUSIC-QUEUE-PREVIEW.md)。

**2026-10-21 播放列表与封面增量**：网易云播放控制移到右下角可收起列表，点击单曲载入整张关联专辑，应用级播放队列跨页面保留；最近三个专辑及列表／单曲循环偏好保存到本地 UI 缓存，重开不自动播放。账号区补充标题、头像及失败占位；移除服务说明的 106px 固定占位，详情标签下统一保留 16px。网易云资料支持「用作封面」，图片经 Rust 下载校验后保存到现有封面资产，保留模型。51 项 JS、8 项账号和 7 项 provider 测试通过；实际播放／头像／封面／动效待用户手动验收，见 [预览测试](docs/MUSIC-QUEUE-PREVIEW.md)。没有升级收藏库或发布新版本。

**2026-10-21 曲目交互与播放初始化修复**：Disc 标签移除选中底纹，保留下划线；收藏曲目移除播放／关联图标，已匹配条目整行点击播放，关联管理移入「网易云资料」。已离线复现 api-enhanced 4.41.1 的 `xeapi public key is missing`；内置播放按需初始化官方模块所需公钥，并区分初始化与播放请求错误。32 项前端／脚本测试通过，实际音源及界面由用户手动验收，见 [测试步骤](docs/MUSIC-DETAILS-PLAYBACK.md)。本轮不变更数据库结构。

更新日期：2026 年 10 月 21 日。当前开发版：**0.1.6，标签和间距调整已发布到 GitHub 私有仓库并支持应用内更新；详情编辑与曲目存储已实现。Discogs 入库、AtelierPublisher v2 模型与连续取放已接通；BD 会话通过前一轮实盘验收，统一内置播放和自动收起控件的真全屏已用本地合成视频验证。DVD 原盘菜单代码已接入 libVLC，实盘画面与交互待用户手动验收。**本文不把方案、占位接口或 UI 演示计为功能完成。

**2026-10-21 资料合并与曲目播放**：网易云简介／数字发行信息并入收藏资料；Discogs credits、companies、notes 及逐曲 credits 接通解析、存储、旧资料补全和展示。已保存专辑内严格匹配曲目，支持手动关联保存；点击后通过 API 获取 URL，由现有 libVLC 内置播放并记录历史，暂停、拖动沿用现有控件。两级标签间距缩为 12px。数据格式升级到 schema 8，升级前自动备份；界面和实际音源待用户手动验收，见 [验收步骤](docs/MUSIC-DETAILS-PLAYBACK.md)。未发布新版本。
**2026-10-21 内置网易云增量**：Node 22.23.3 与 api-enhanced 4.41.1 已纳入构建资源。默认内置、首个在线查询按需启动、私有管道通信、并发复用、退出与异常父进程终止清理；自定义地址收进模式选择，兼容已有设置。真实公开接口与隔离进程生命周期测试通过，窗口交互由用户手动验收。未发布新版本，见 [测试步骤](docs/NETEASE-BUILTIN.md)。

**2026-10-21 内置网易云启动修复**：复现 Tauri 的 Windows 规范资源路径导致 Node 入口加载报 EISDIR 并退出的问题，启动边界改用兼容路径解析。新增中文、空格与规范路径回归测试，7 项生命周期／路径测试及 Release 目录真实脚本离线启动检查通过，严格 Clippy 通过。修复版 `DiscAtelier-netease-fix.exe` 的在线查询待用户验收；数据库与界面无变更，未发布新版本。

**2026-10-21 网易云搜索补全**：专辑搜索从固定第一页改为按需分页，保留上游 `albumCount`，内置／自定义服务均传递 `offset`。结果展示封面、专辑、歌手，详情保留所选封面并可返回原搜索页；固定高度、独立滚动、翻页淡切与图片淡入。缺图保留占位，不覆盖收藏封面。11 项相关 Rust 单元测试、1 项已捕获真实响应校验、24 项前端／脚本测试通过。联网翻页、图片加载和界面由用户手动验收；见 [测试步骤](docs/NETEASE-BUILTIN.md)。

2026-10-21 当前未发布增量：CD 播放、网易云补充与 AI 助手第一阶段已实现，详见 [手动验收与实现边界](docs/CD-NETEASE-ASSISTANT.md)。公开发行仍为 0.1.6；本轮不替换旧发行资产。下一步先由用户验收 CD 实盘、服务配置与界面，再按反馈推进收藏绑定、歌词和助手新增／批量工具。


0.1.5：购入先展示再编辑；两个页签的编辑入口固定在底部；编辑保留详情及模型背景；移除“再收一套”；Discogs 分盘标签保留原标题，第一曲目与封面对齐，来源按钮移至右下角；设置加宽至 1000 CSS px。新增 schema 6 保存曲目／流派／风格，旧收藏可按来源补全，详情按需读取，迁移前自动备份。21 项前端逻辑测试、原有 60 项 Rust 测试及新增 3 项存储测试、构建与严格检查通过。画面与交互待用户手动验收，见 [0.1.5 验收步骤](docs/CATALOG-DETAILS-0.1.5.md)。没有操作窗口、个人库或光盘。

当前使用用户确认的原陈列：中央模型／封面放大，两侧逐层后退、缩小和变暗，保留静态阴影，没有横向架板；支持左右翻阅，页面名称为 DiscAtelier。黑白与少量米白、MiSans、自定义控件和输入框无焦点高亮的方向已迁入 React 桌面界面。原型保留用于对照；桌面版从真实空库开始，不导入原型演示数据。

状态定义：已完成＝有可检查产物和验证；进行中＝有实际实现正在验证；待开发＝未实现；待专项验证＝需要真实服务或硬件确认；未来＝不进入当前主线。

2026-10-21 发行后本地调整：详情一级标签改为“资料／曲目／购入”，曲目内以分盘原标题作为二级标签；流派与风格留在资料页。共享一次详情内容读取，换页签保留分盘选择；曲目填满固定内容区并独立滚动。TypeScript／Vite 构建、21 项现有前端逻辑测试通过。实际页签、滚动与淡切仍待用户手动验收，本项纳入 0.1.6 发行，0.1.5 发行资产保持原样。

2026-10-21 界面调整：陈列来源链接移至详情底部；详情页签固定布局；新增自定义日历；Discogs 搜索／详情／入库共用加宽、固定高度外框；发行详情显示封面、曲目独立滚动、多盘分页，保留嵌套曲目；载体展示消除完整重复前缀。20 项前端逻辑测试、53 项 Rust 测试、前端构建和严格检查通过。实际窗口、日历键盘操作及动效待用户手动验收，见 [验收步骤](docs/CATALOG-UI-ACCEPTANCE.md)。DVD 原盘菜单验收保持待完成。

## 版本总览

2026-10-21 光驱弹窗修正：去掉工具栏 `-10px` 上边距，修复其进入滚动容器后顶部裁切；弹窗加宽到 720 CSS px，保留窗口宽度约束与固定高度。前端和 Release 构建通过，未操作窗口或读取光盘。当前旧版仍在运行，修复版另存为 `target/release/discatelier-desktop-ui-fix.exe`，按钮显示与窗口宽度待用户手动检查。

| 版本 | 交付目标 | 依赖 | 当前状态 |
| --- | --- | --- | --- |
| 0.0 | 产品方案、架构、界面原型、私有仓库、路线 | 无 | 已进入开发，UI 持续随功能完善 |
| 0.1 | 可日常使用的离线收藏管理 | 0.0 | 核心流程及恢复／缩放／键盘已验证；发布与规模验证待完成 |
| 0.2 | Discogs 具体发行入库与版本管理 | 0.1、个人 Discogs 凭据与来源策略 | 核心入库流程已实现；真实认证搜索、复杂曲目与版本比较待完成 |
| 0.3 | 实体模型检视与完整陈列衔接 | 0.1、模型运行库独立化 | 当前 10 份模型及共享物体取放已验证；恢复原陈列风格，自定义姿态、万级收藏和长期稳定性待完成 |
| 0.4 | 光驱识别、CD 播放、网易云补充 | 0.1、真实光驱与样盘、播放嵌入验证 | CD TOC、播放、逐曲历史和网易云补充已实现；公开响应解析通过，实盘与用户服务待手动验收 |
| 0.5 | DVD／BD 内容分配、播放、区域能力验证 | 0.4、播放后端专项矩阵 | BD 控制与历史有实盘基线；内置画面、真全屏及自动收起已用本地视频验证；DVD 菜单代码已接入，待手动实盘验收；内容分配、字幕扩展及全区矩阵待完成 |
| 0.6 | 可操作库和数据源的 AI 助手 | 0.2、稳定应用用例与审计 | 兼容接口、持久工具循环、查询、状态修改确认及撤销已实现；真实模型联调、批量与新增工具待完成 |
| 0.7 | 签名安装、自更新、备份迁移与稳定性收尾 | 0.1–0.6 的首发范围 | 私有更新与版本绑定签名已实现；Windows 代码签名及安装升级验收待完成 |
| 1.0 | 经兼容性矩阵定义的稳定个人版本 | 所有首发验收通过 | 待开发 |
| 1.1+ | 购物价格、其他品类、可选网站同步 | 稳定插件契约 | 未来 |

表中的版本是产品增量。0.7 的签名和流水线基础设计在 0.1 就开始，避免最后才发现无法分发；0.7 承担端到端发布验收。0.3 与 0.4 可在 0.1 完成后分支推进，数据库契约保持唯一。

## 0.0 设计基线

- [x] 检查 AtelierPublisher 实际模型格式、运行库入口和交互规范。
- [x] 检查现有网易云服务精确契约。
- [x] 形成领域模型、接口边界、权限与发布设计。
- [x] 创建真实代码界面原型，明确演示范围。
- [x] 创建 GitHub 私有空仓库。
- [x] 用户明确授权开始 Tauri + Rust 桌面开发；按离线收藏流程先行。
- [x] 提供按依赖和验收划分的更新路线。
- [x] 完成 MiSans、控件样式和输入焦点调整；14 项浏览器检查通过，记录见 `docs/VALIDATION.md`。

证据入口：`README.md`、`docs/PRODUCT-PLAN.md`、`docs/ARCHITECTURE.md`、`docs/INTERFACE.md`、`docs/INTEGRATIONS.md`、`docs/VALIDATION.md`、`prototype/`。

## 0.1 离线收藏闭环

**已实现并验证（开发版 0.1.2）**：

- [x] Tauri 2 原生窗口、React／TypeScript 前端、分 crate 的 Rust workspace。
- [x] SQLite 初始迁移和校验、作品／发行／载体／实物副本／购买信息分表。
- [x] 手动录入，精确保留条码／品番，CD+BD 等多载体，以及同版多套独立购买记录。
- [x] 想购入／在途／已购入；价格、币种、购入日期、位置、购买链接、存放位置、备注。
- [x] 音乐与影像分区、数据库搜索、状态筛选、封面翻阅、默认封面和整理表格。
- [x] 按币种统计已购入金额，未知价格与零价分开；套数和盘片数分开。
- [x] 重复写请求去重、编辑 revision 冲突、真实关闭进程重启后保留。
- [x] SQLite 在线一致性备份，备份完整性检查。
- [x] 版本资料与多载体编辑；同版多套共享资料，各套购买记录独立。
- [x] PNG／JPEG／WebP 封面导入、替换和移除；按哈希去重，封面随数据库备份和重启保留。
- [x] schema 1 → 2 升级前自动备份，校验历史迁移后在事务内升级。
- [x] 修复音乐／影像切换产生瞬时滚动条；空库和有收藏的逐帧溢出检查均为零。
- [x] 恢复界面：备份列表／外部路径、完整性及封面哈希预检、数量预览、确认整体恢复、原库自动备份。
- [x] 恢复后重启保留、过期预览拒绝、损坏资产及不兼容结构拒绝。
- [x] 1440×960 和最小 960×680 窗口，100%／125%／150%／175%／200% 原生缩放检查；表单可滚动、按钮可达、无横向溢出。
- [x] 键盘新增、再收一套、详情、恢复；下拉方向键、Home／End、Enter、Escape；弹窗 Tab 循环、焦点返回；减少动态模式。
- [x] 按用户偏好隐藏短内容滚动条，特别长的内容才显示细滚动条。

**尚未完成**：真实万级收藏、多显示器 DPI／屏幕阅读器、启动损坏数据库救援、签名安装与发行。当前资产库支持封面与有大小限制的模型，模型规模验证仍待完成。故不能按完整稳定版验收。

证据：`docs/DESKTOP-DEVELOPMENT.md`、`docs/DISCOGS-DEVELOPMENT.md`，14 项 Rust 存储测试、4 项数据源 HTTP 测试，原有 15 项桌面回归及新增恢复／键盘／缩放、真实 Discogs 发行与凭据验证脚本。短内容隐藏滚动条调整后的最新验收记录分别为 `artifacts/desktop-1792489648407/results.json`、`artifacts/recovery-access-1792489610960/results.json`、`artifacts/discogs-1792489611006/results.json`。上述 0.1.2 验收时尚未接入模型、光驱和播放器；模型增量见 0.3。

**实现**：Tauri 2 桌面壳、React／TypeScript UI、Rust workspace、SQLite 迁移；作品／发行／副本／盘片分层；手动入库、重复副本、多载体套装；想购入／在途／已购入；价格币种、店铺、日期、链接；音乐影像分区、搜索筛选、默认盒体、资产库、备份恢复。

**验收**：

- 同一发行保存两套不同价格的副本，独立编辑，统计正确。
- CD+BD 套装计一套、两张，费用只计算一次。
- 未填价格与零价区分；人民币、日元、港币分别汇总；想购入不计已持有总价。
- 退出重启、异常关闭和离线状态不损坏数据。
- 全新安装与已有库迁移都能打开；备份恢复到隔离目录后资产哈希一致。
- 键盘、200% 缩放、减少动态模式可完成主要流程。

**不纳入**：真实在线搜索、光盘播放、云端同步、完整 AI。

## 0.2 版本准确的联网入库

**当前增量**：

- [x] 独立 MetadataProvider 端口与 Discogs 适配器；请求不占用收藏库锁。
- [x] Windows 凭据管理器保存／替换／移除 Token，界面不回读密钥。
- [x] 条码／品番／关键词搜索实现、分页、节流、HTTP 错误区分；隔离服务测试通过。
- [x] 发行 ID 在线预览，保留载体数量、标识符、品番和顶层曲目；真实公开接口验证通过。
- [x] 详情来源标注与链接、临时预览过期；市场及用户资料不写入个人收藏。
- [x] 搜索结果选择具体发行，返回保留查询和分页；复用版本／购入表单，只有确认后写库。
- [x] 搜索面板固定高度，结果隐藏滚动条、保留滚轮与键盘操作；封面缩略图、缺图及加载失败占位，底部固定翻页。移除搜索列表每行的来源文字，详情保留链接。
- [x] 音乐分区“添加”直接进入 Discogs 搜索，保留手动录入；空库入口行为一致，影像添加与“再收一套”保持原有表单。
- [x] 新发行自动下载对应封面，确认时随收藏保存、离线显示及备份恢复；已有版本保留本地封面，缺图使用默认外观，下载失败或损坏可重试。
- [x] 右上角更多菜单收拢为范围、整理、设置和统计；凭据、备份、恢复、版本信息移入设置。
- [x] 按 providerId + externalId 唯一关联版本；同版再收一套共享资料、购买独立；不同发行分开。
- [x] 载体数量展开，礼盒包装不算盘片；未知载体需手动选择；多条标识符按原文保留并可检索。
- [x] 本地人工修订不被重复导入覆盖；事务与请求幂等保护，旧版本预览冲突拒绝。
- [x] schema 3 来源迁移与升级前备份；来源关联随备份恢复和重启保留。
- [ ] 用户配置 Token 后完成真实认证检索验证。
- [ ] 来源更新差异预览、逐字段合并及持久化的来源覆盖层；当前只读取新资料，不自动覆盖本地确认记录。
- [ ] 真实多载体样本、复杂曲目结构、版本比较与扫描队列。

0.1.3 验收证据：`artifacts/discogs-import-1792491519089/results.json`（隔离 HTTP + 原生桌面入库 11 组）、`artifacts/discogs-1792490784513/results.json`（真实公开发行入库）、`artifacts/desktop-1792491331120/results.json`（原有 15 项回归）。18 项存储和 6 项数据源 Rust 测试通过；完整认证搜索仍按上面的待办保留。快速缩放的异步状态问题已修复，最小窗口 200% 导入表单通过。

本轮界面与添加入口验收：`artifacts/discogs-search-layout-1792492753670/results.json`，验证锁定高度、隐藏滚动条后滚轮／焦点可达、封面成功／缺失／失败／回退、图片请求不携带 Token、最小窗口 200%、音乐添加直接打开 Discogs、手动及影像入口保留、移除重复来源文字。`artifacts/discogs-import-1792492765170/results.json` 验证从新的“添加”入口完成选版、入库及原有 11 组检查。以上均为隔离人工样本，真实认证搜索待联调。前端构建、原生构建和 6 项数据源测试通过。

自动封面与设置调整验收：`artifacts/discogs-1792493659698/results.json` 验证真实发行 249504 的主封面下载、入库显示与重启保留；`artifacts/discogs-import-1792493598421/results.json` 验证人工样本的 14 组检查，含自动封面备份恢复、503／损坏图片不写库、重试、同版不重复下载、缺图默认外观；`artifacts/discogs-search-layout-1792493632830/results.json` 验证设置归类、嵌套弹窗焦点、搜索保留和 200%；`artifacts/recovery-access-1792493669357/results.json` 验证新设置入口的键盘备份恢复及 10 组窗口／缩放组合。前端和原生构建、Clippy、25 项非桌面 crate 测试通过。该轮真实认证搜索和模型上传尚未完成；模型增量现见 0.3。

**实现**：Discogs token 配置、搜索节流、条码／品番／关键词检索、发行详细资料、版本比较、批量扫描队列、来源覆盖层、来源时间和归属标识。数据库检索与本地库检索分开。

**验收**：

- 用真实响应固定测试样本，核对 `formats`、`identifiers`、`labels`、`tracklist`，包含多盘和混合载体。
- 同一条码多版本必须选择；编号原文和前导零保留。
- 429、失效凭据、无结果、网络超时和取消分别呈现；重试不重复建档。
- 来源刷新不改用户购买资料和人工修订。
- Discogs 展示／缓存／图片边界落实后再启用实际 API 收藏导入。

**出口**：可从条码或品番完成一次准确发行选择与副本入库。

## 0.3 实体陈列和模型

**2026-10-20 详情退出停顿修复（最新）**：

- [x] 详情资料区、放回／旋转按钮不再使用保留最终透明度的入场关键帧；改为可中断的 opacity 过渡，消除退出样式被入场动画覆盖的问题。
- [x] 点击放回即进入退出状态，资料和按钮在模型收起期间就开始淡出；失败时恢复显示。背景及模型位移仍在收起完成后衔接，阴影也使用淡出。
- [x] 默认比例逐帧验证：按钮与资料区约 154 ms 降为透明，在弹窗卸载前完成，透明度无回弹；模型双向淡切与三次加载中返回通过。
- 证据：`D:\DiscAtelierBuilds\artifacts\model-on-demand-1792509588554/results.json`。

**2026-10-20 陈列切换闪露与点击边界修复**：

- [x] 当前项与相邻项共享已解码的静态封面，切换组件时同步复用；首次读取／解码期间不显示默认文字封面，真正无图片或加载失败才回退。
- [x] 静态图片缓存最多 12 项，按 URL 与解码像素估算总额上限 64 MiB；仍然只在点击取出后加载完整模型。
- [x] 移除封面 `focus-visible` 外框，Esc 返回继续恢复键盘焦点。
- [x] 扩大的模型展示容器不参与陈列命中，按钮按自身封面尺寸接收点击。
- [x] `verify-artwork-switch.mjs`：人为延迟解码 300 ms、24 次快速切换无文字占位／加载空帧且无重复图片读取；右边缘外 8 px 命中相邻项，Esc 与方向键通过。证据：`D:\DiscAtelierBuilds\artifacts\artwork-switch-1792509057748/results.json`。

**2026-10-20 点击加载与双向淡切（已验证，交互保留）**：

- 按用户最新要求，陈列只显示封面；点击取出后读取完整模型并创建 WebGL，首帧就绪且取出位移结束后以 180 ms 淡切显示。
- 放回前恢复正视角，返回位移过程中淡切回封面；回到陈列后释放画布，加载中返回会取消未完成任务。
- 陈列优先本地封面，没有本地封面时使用模型包内原始预览，不再使用实时模型截图缓存。此前缓存代码退出展示流程，不产生额外截图与编码工作。
- 保留正视角、原画质与拆装动作；默认比例验收脚本为 `scripts/verify-model-on-demand.mjs`。首进双向淡切、零陈列画布／完整模型读取、三次加载中返回已通过；正视角运行库完成《24时》12 状态、25 转换、29 次单件检视及复位回归。
- 证据：[点击加载验收](docs/MODEL-ON-DEMAND-VALIDATION.md)。不将历史缓存测试数值套用到这一流程。

**2026-10-20 封面与模型正视角衔接（前一轮，自动加载及截图缓存已由上述流程替代）**：

- [x] 按用户要求将初始模型和复位后的陈列改为正视角，居中、无左右倾斜；保持原材质、贴图、抗锯齿、阴影及拆装轨迹，单件检视沿用原视角。
- [x] 当前模型首帧显示后空闲生成一次无损预览，后续加载先使用同视角缓存；更新预览版本使旧倾斜缓存失效，不批量预渲染收藏。
- [x] 分别保存首次原始封面／模型、缓存／模型的截图；默认比例下取出放回、三次中途反向返回、缓存重启保留与上下文丢失回退通过。
- [x] 13 项单元测试与前端构建通过。初始正视投影的四边及展示范围有几何回归验证。
- 范围：正视对齐不等于原始封面与有光照的实体模型逐像素一致。原始图片构图和模型贴图不同仍会有内容差异；此前的最大通道差 1/255 只对应旧测试中的缓存帧／同视角实时帧，不能用于首次切换。
- 证据及性能边界：[正视角与预览验收](docs/MODEL-PREVIEW-VALIDATION.md)。

**2026-10-20 陈列风格恢复（前一轮）**：

- 按用户提供的图一恢复 `store.css` 原有的中央放大、两侧后退、缩小及变暗布局，移除横向架板和 64° 侧转。
- 保留同一画布的连续取出／放回、加载优化和原渲染画质。
- 无独立封面的模型在加载期间使用包内预览；有独立封面仍优先以封面占位。
- 继续使用隔离测试库展示模型，正式收藏库不写入测试数据。此前竖放架面版本的记录保留为历史验收，不代表当前外观。

**2026-10-20 竖放陈列与连续取放增量（前一轮，架面外观已被上面的恢复替代）**：

- [x] 10 份现有 v2 模型：188 个状态、1,009 条点击／收回转换、1,053 次单件检视；验证复原到初始姿态及视角。
- [x] 每份模型运行代表性的原时长动作；含书本的代表路径连续翻四次页。完整状态图遍历采用减少动态模式，不把它描述为所有组合逐帧人工验收。
- [x] 竖向陈列、侧向相邻项、架面和静态阴影；无模型使用封面／默认盒体，音乐和影像分区保留。
- [x] 稳定 portal 复用同一模型画布；取出／放回不重复挂载，开启动效中可反向返回。
- [x] 修复关闭弹窗时一帧零尺寸画布、CSS 移动缩放影响详情清晰度，以及共享会话在显卡上下文丢失后无法重试的问题。
- [x] 保留原始贴图、材质、抗锯齿、灯光和阴影设置；最大现有模型的总像素预算提高至 192 × 1024²，保留其余校验和限额。
- [x] 取放逐帧检查、减少动态、默认影像盒、最小窗口 200% 无页面溢出通过；9 组模型及 6 组加载回归通过。

证据与范围：[模型与陈列验收](docs/MODEL-SHELF-VALIDATION.md)。当前选中项为实时 3D，相邻项为模型预览；不同时加载整排模型。没有新增首页按钮和提示性副标题。本轮只完成上述三项，不启动光驱或播放器接入。

**2026-10-20 首帧与加载衔接增量（前一轮）**：

- [x] 实际 Windows 文件窗口：取消、中文和空格路径、损坏文件不覆盖旧选择、失败重试、更换后取消与关闭表单，共 5 项通过。
- [x] 已入库模型直接通过只读 Rust 协议进入 Worker；最近一个解析结果缓存、共享读取及独立取消；贴图最多四张并发。
- [x] 首帧前准备着色器变体及参数，提前采用固定 Three 版本实际使用的阴影类型，避免首次绘制使预编译失效；保留实际画质与原拆装路径。
- [x] 加载期间保留封面，完整首帧后 180 ms 交叉淡入；快速切换／关闭释放旧 Worker、纹理和画布；减少动态模式无渐变。
- [x] 同一 32.24 MiB 模型、全新进程与隔离库、各三次 Release 对照：首次显示中位数 **12.76 → 6.45 秒，减少 49.5%**。这是加载开始至可见状态并等待两次帧回调的观测值，包含调度，不是纯 GPU 时间。

证据：[首帧性能报告](docs/MODEL-DISPLAY-PERFORMANCE.md)；原生选择 `F:\DiscAtelierBuilds\artifacts\native-picker-1792499068793\results.json`（5 项），模型回归 `F:\DiscAtelierBuilds\artifacts\models-1792502185689\results.json`（9 组），加载专项 `F:\DiscAtelierBuilds\artifacts\model-loading-1792502055773\results.json`（6 组）。加载专项包含画布已创建但尚未显示时切换、缓存往返、关闭检视、协议拒绝及减少动态模式。

**同日导入性能增量（前一轮）**：Rust 直接限长读取 `.ateliermodel`，校验后保存不可变快照；前端只传引用，保存不重复解码图片／计算模型哈希。已增加原生和前端分段计时，普通 Release 与测试构建隔离，启动脚本优先 Release。

同一份 32.24 MiB 模型、每组全新库测三次：Debug 总导入中位数 **19.83 → 17.44 秒**，Release **9.96 → 8.65 秒**；Release 点击保存后等待 **7.43 → 1.90 秒**。校验前移使准备阶段变长；完整范围和分段见 [性能对照](docs/MODEL-PERFORMANCE.md)，不能只凭保存阶段宣称总提速。该轮未改善模型显示；本轮首帧结果见上文，两个测量范围不能混用。

该轮验证：31 项 Rust 测试、前端构建、4 项基础测试及 Clippy 通过；当时 22 个模型运行库文件哈希未改变。9 组模型回归见 `F:\DiscAtelierBuilds\artifacts\models-1792497884736\results.json`；14 组 Discogs 人工样本入库回归见 `F:\DiscAtelierBuilds\artifacts\discogs-import-1792498470132\results.json`。原先待验收的系统文件选择／取消现已通过本轮实际窗口检查。

**本轮已完成并验证**：

- [x] 独立打包 AtelierPublisher v2 解析／运行库，记录原始源码哈希，保留 Three.js 许可，不依赖兄弟项目运行。
- [x] 添加／编辑版本上传、替换、移除 `.ateliermodel`；与封面独立，版本写入原子提交，同版副本共享。
- [x] 当前收藏优先显示真实模型，相邻项和整理表格使用模型包预览；无模型恢复封面及默认外观。
- [x] 取出后旋转、缩放、按模型动作拆装、单件收回、全部收起；关闭详情前按模型路径收纳。
- [x] schema 4 迁移前备份；模型 SHA-256 去重、自包含备份、损坏资产拒绝、恢复与进程重启保留。
- [x] 50 MiB 包上限、嵌入式图片与资源校验；一次性 Worker 完整校验，Rust 存储边界独立检查。
- [x] 原生窗口验证翻盖、抽屉及 32 MiB 完整唱片模型，模型加载失败／显卡上下文丢失时回退封面。
- [x] 加载中快速关闭、画布释放、最小窗口 200% 无横向溢出及编辑入口焦点；背景弹窗打开时停止架上模型。

证据：`artifacts/models-1792495341684/results.json`，9 组原生桌面检查及截图；`crates/storage-sqlite/tests/models.rs` 的 3 项原子性／持久化／拒绝测试。完整唱片包原生文件选择至校验约 2.9 秒，校验及保存累计约 19.7 秒，包含两次模型展示及截图共约 48.6 秒（本机 debug 构建），仍需继续优化大型模型加载。源码边界、存储选择与限制见 `docs/MODELS-DEVELOPMENT.md`。 原有 Discogs 入库的 14 组回归通过（`artifacts/discogs-import-1792495499175/results.json`）；28 项非桌面 crate 测试、前端／原生构建、Clippy 和格式检查通过。

**仍待完成**：所有动作组合的人工逐帧审查、自定义陈列姿态和尺寸编辑、万级收藏和长期 GPU／内存稳定性。当前现有模型兼容矩阵、自动适配陈列和共享物体连续取放已完成；v2 运行库不直接接受旧 v1 专用 rig 或任意 GLB／OBJ。


**实现**：版本化提取模型解析器和运行库、来源溯源；模型导入校验；姿态／尺寸配置；竖放架、封面、表格；取出到检视的连续过渡；缓存、静态阴影与降级。

**验收**：

- 翻盖、抽屉、纸套、歌词本等真实现有模型可加载、拆装、单件查看和收回。
- 连续翻页保持相机和可见性；收回遵守逆序，不隐藏无关部件。
- 无模型有封面、无封面、损坏模型、超限包都能正确降级。
- 用户上传模型后优先显示模型，独立保存的 Discogs 封面作为无模型或模型不可用时的外观；本轮已实现这一优先级。
- 加载中退出与快速切换不泄漏 WebGL 资源。
- 1 万副本可浏览，架上不同时解码全部模型。

**出口**：现有模型无需改名、改节点标识或转换成另一个不兼容格式即可接入。

## 0.4 光驱和音乐播放

**2026-10-21 本地开发增量**：新增只读 TOC 解析及音频 CD 曲目／时长，复用 libVLC 完成曲目播放、暂停、拖动、换曲、后台继续、自然结束自动下一首和逐曲历史；解析测试不访问设备。网易云采用用户指定的 api-enhanced，可配置服务、专辑检索、分盘资料预览及单独保存；4.41.1 真实公开响应已通过适配器解析。schema 7 迁移前备份及补充资料备份恢复已验证。实盘、用户部署服务与界面待手动验收；收藏绑定、CD-Text、歌词、在线播放仍待开发。见 [说明与验收步骤](docs/CD-NETEASE-ASSISTANT.md)。

**2026-10-20 增量**：新增独立 Windows 只读设备适配器、更多菜单中的光驱面板；确认 Optiarc BC-5500S（F:）可读取实盘 UDF／BDMV，得到 23 个播放列表文件。检查前后校验介质标记，拒绝任意路径与过期请求；无弹出、介质写入、区域写入和固件操作。音频 CD TOC、设备通知、收藏绑定与 CD 播放历史未完成；BD 会话历史于 10 月 21 日完成，见 0.5。见 `docs/OPTICAL-DEVELOPMENT.md`。

**先做技术验证**：Tauri 原生视频区域与 WebView 层级、DPI、全屏、播放器事件；Windows 多光驱枚举与介质变化。若嵌入窗口限制影响效果，明确选独立播放窗口，不靠 CSS 掩盖。

**实现**：设备会话状态机、音频 CD TOC 指纹、本地绑定、可选 MusicBrainz 辅助、CD 曲目播放与历史；网易云服务适配、人工绑定歌曲 ID、歌词及实际可播放内容。

**验收**：

- 同盘换光驱可识别；同版多副本需要区分；不把 TOC 当精确发行身份证。
- 拔盘、USB 断连、睡眠恢复和读盘错误可恢复；旧识别任务不绑定新盘。
- 暂停不计时、拖动不算完成、崩溃有检查点。
- 网易云不可用不影响本地库；完整、试听、不可播放状态准确。

**所需实物**：用户实际光驱、普通和多碟音频 CD。型号和读盘结果纳入兼容性表。

## 0.5 DVD 和 BD

**2026-10-21 DVD 菜单接入（最新，待用户实盘验收）**：

- [x] 新增独立 `player-vlc` crate 与后端分派，DVD 使用 libVLC 3，BD 保留 MPV；共享内置页面、原生画布和全屏控件。
- [x] DVD-Video 只读结构识别、限长 IFO 哈希、播放前介质核对；设置加入 `libvlc.dll` 路径，不加载用户 VLC 配置。
- [x] 接入鼠标原盘按钮、方向／确认、返回菜单、暂停、拖动和音轨控制；菜单页面禁止拖动，视频子窗口焦点的按键由限定作用域桥接处理。
- [x] 历史保存标题编号与位置；返回菜单保留正片书签；旧记录兼容，续播先选标题再跳转。光盘菜单循环不计为整盘看完。
- [x] 本机 libVLC 3.0.24 无媒体初始化和所用 ABI 符号检查通过；源码构建与非 UI 测试证据见 [DVD 菜单说明](docs/DVD-MENU-PLAN.md)。
- [x] 45 项相关 Rust 测试、前端构建、Clippy 通过；普通 Release 和隔离测试版已生成，未启动。路径及 SHA-256 见 [播放构建记录](docs/PLAYBACK-DEVELOPMENT.md)。
- [ ] 用户手动实盘验收：菜单显示、点击／键盘、章节／音轨／字幕菜单、全屏收起、续播和退出。步骤见 [人工验收](docs/DVD-MENU-ACCEPTANCE.md)。
- 本轮遵守用户“不操控电脑”：不启动应用、不操作现有窗口、不运行 UI 自动化、不读取实盘。测试入口使用独立库，不动用户现有数据。

**2026-10-21 内置播放与全屏增量**：

- [x] MPV 视频作为 DiscAtelier 原生子窗口，与进度、暂停、音轨、停止处于同一个页面，无独立视频窗口。
- [x] 全屏画面覆盖整个窗口；顶部和底部控件静止约 2 秒后收起，鼠标移动／按键唤回。菜单操作、拖动及停留控制区时保留控件。
- [x] 控件通过原生裁剪区域和短时 CSS 位移动画衔接；不缩放视频画布，不把视频帧复制到 WebView。
- [x] 返回收藏暂停，加载时返回取消；再次打开保留会话和位置。初始窗口按当前屏幕工作区约束。
- [x] 本地 90 秒 H.264 + 两条 PCM 测试音轨：5 组桌面验收通过，见 `D:\DiscAtelierBuilds\artifacts\embedded-playback-1792516925858\results.json`。原生窗口检查确认父子关系、视频区域、全屏展开与收起时画布尺寸相同；另用 Computer Use 检查实际全屏画面和原生 Esc。
- [ ] 内置后的 BD 实盘复验：用户已取出 BD，本轮没有执行。前一轮 BD 证据保留在下方。
- [ ] DVD 原盘菜单实盘验收：代码增量见上方。本机 VLC 3.0.24 与菜单接口已核对，前一轮只读确认 `VIDEO_TS/VIDEO_TS.IFO`；本轮由用户操作，见 [DVD 菜单说明](docs/DVD-MENU-PLAN.md)。

**2026-10-21 正式播放基线（内置改造前）**：

- [x] MPV 独立原生视频窗口，JSON 命名管道同步实际状态；本机视频输出 `gpu-next`、音频输出 `wasapi` 已回读。
- [x] 暂停／继续、鼠标拖动进度、3 条日语 LPCM 音轨选择；收起面板后可从底部返回控制。
- [x] SQLite schema 5 保存日期、盘片标记、播放列表、位置、时长和最后音轨；同盘插入时从历史续播。
- [x] 暂停和跳转跨度不计入观看时长；跳到结尾不标“看完”；重启恢复未结束记录为“中断”。
- [x] 加载中停止、停止按钮、关闭 MPV、关闭主程序及主程序异常退出均已验收，自己启动的 MPV 不残留。
- [x] 历史包含在备份；拒绝播放中整体恢复，损坏历史在恢复前被拒绝；保留现有库。

9 组原生实盘检查通过：`D:\DiscAtelierBuilds\artifacts\playback-1792515110556\results.json`。此次打开至播放 2 秒约 **12.27 秒**，加载中停止约 **0.18 秒**；拖动请求 529.8 秒、实际位置 530.110089 秒，界面使用实际回报值。36 项相关 Rust 测试、TypeScript／Vite 构建和全 workspace Clippy 通过。使用隔离测试库，光盘只读；未生成媒体副本，未修改系统 DLL、区域或固件。

下一步顺序：**用户手动验收 DVD 菜单并修复反馈 → 内置 BD 实盘复验 → 章节与播放列表信息 → 人工内容分配及收藏绑定 → 字幕／拔盘恢复 → A/B/C 与 BD-J 实盘矩阵**。当前不宣称全区完成。实现与使用说明见 [播放说明](docs/PLAYBACK-DEVELOPMENT.md)。

**2026-10-20 增量**：设置新增 MPV／MakeMKV 路径配置；按真实播放列表执行静默首帧诊断。初始错误为 MPV 未加载 AACS 库；使用本机 MakeMKV `libmmbd64.dll` 后，用户提供的《缘之空》春日野穹盘 `00000.mpls` 首帧成功，识别 1080p H.264、3 条日语 LPCM 音轨。没有制作 MKV 文件，也没有修改系统 DLL。区域保持“未确认”，不把首帧成功计作全区或完整播放验收。下一步是播放会话和结构化内容信息，随后完成绑定、历史及 A/B/C 实盘矩阵。

**2026-10-21 验收**：`D:\DiscAtelierBuilds\artifacts\optical-readonly-1792511865120\results.json` 的 7 项真实桌面检查通过，包括本机 MakeMKV 首帧解码（约 12.94 秒）、设置经进程重启保留、非法设备路径和过期介质拦截。3 项诊断单元测试、前端构建与 Clippy 通过。全程使用隔离测试收藏库，光盘只读。

**实现**：DVD 标题／菜单、BD 播放列表／章节／音轨／字幕；手工内容分配；每盘可播放能力；A/B/C 区域配置适配；不支持时外部播放器入口。

**验收矩阵**：DVD 单片／多集／菜单／多角度；BD 正片／花絮／BD-J；A、B、C 区样盘；受保护与无保护介质；不同光驱；字幕音轨切换；全屏和恢复播放。

“全区完成”仅限矩阵已通过的后端、光驱、区域与盘片类型，发布说明列出能力。区域配置不等价于 AACS／BD+ 处理，UHD BD 必须另列专项。结构识别失败时不自动将最长标题归为正片。

**出口**：插盘后能说明是哪张已绑定盘、哪些内容可播放、不可播放的具体原因。

## 0.6 Agent harness

**2026-10-21 收藏操作、播放与流式（未发行）**：新增收藏、网易云补充资料和网易云／Discogs 封面提案，先展示实际变更，确认后复用保存用例；拒绝过期、重复确认和旧版本覆盖。加入内置播放查询／播放／控制，关联原播放队列和历史。兼容接口接入 SSE 与可取消网络等待，完整拼接工具参数后才执行；提示词改为自然温和的音乐伙伴，保留资料证据和确认约束。现共 13 个工具。53 项 JavaScript、全工作区 Rust 测试及严格 Clippy 通过，新增 11 项隔离回归；真实模型、播放出声和窗口效果待用户手动验收。详见 [能力与测试步骤](docs/ASSISTANT-ACTIONS-STREAMING.md)。

本轮 Tauri Release 预览已生成：`target/release/DiscAtelier-assistant-actions-preview.exe`；与构建主程序及共享资源校验通过。保留正式主程序、收藏和备份，未启动应用、未发布新版本。

**2026-10-21 助手浮窗（未发行）**：助手入口移至右下角，与播放列表并排，浮窗互相收起；保留会话、草稿、确认／撤销及操作记录，全屏播放器隐藏入口。将请求控制、浮窗展示和共享原生弹窗宿主拆分，空闲收起时停止轮询。本次沿用现有 system prompt 与 7 个工具，未增加模型权限或数据库迁移。TypeScript／Vite 和 53 项现有 JavaScript 测试通过；窗口交互与真实模型待用户手动验收，详见 [助手说明](docs/ASSISTANT-DOCK.md)。

Tauri Release 预览构建通过：`target/release/DiscAtelier-assistant-preview.exe`，与构建主程序哈希一致，共享运行时六个入口文件校验通过。项目原正式程序保留，未启动程序或发布安装包。

**2026-10-21 本地开发增量**：独立 harness crate 与兼容 Chat Completions 接口，支持显式工具注册、单工具循环、上下文限额、持久检查点、操作记录、取消及中断恢复提示。接入库内查询／统计、Discogs／网易云查询；状态修改先展示，确认后走原应用用例，支持幂等、冲突拦截和最近一次撤销。密钥按请求地址绑定到 Windows 凭据管理器。模拟接口及隔离库测试通过；真实模型配置尚未提供，不能计为外部服务验收。新增收藏、批量编辑、流式输出与历史会话选择待推进。

**实现**：模型适配器、schema 工具注册、上下文最小化、策略执行、持久会话、日志与检查点、幂等写入、取消恢复、差异预览和撤销。第一版使用单 agent 工具循环。

**验收**：

- 能通过工具回答库内检索和统计，查询来源可追溯。
- 用户授权的新增／状态修改准确执行；重复工具调用不重复副本。
- 批量操作先列明确差异；过期 revision 返回冲突而非覆盖。
- 外部网页和 API 内容不能提升权限，密钥不会发送给模型。
- 网络失败、工具超时、用户取消后可恢复；完成声明有工具执行证据。

**评估入口**：隔离数据库与固定工具样本；不拿真实库作破坏性测试。

## 0.7 发布与可靠性

**2026-10-21 0.1.4 增量**：已实现私有 GitHub API 更新、Windows 凭据管理器 Token、版本绑定的 Tauri 签名验证、检查／下载／安装分离、安装前一致性备份、播放期间安装拦截。设置改为数据／Discogs／播放／更新固定导航，菜单改为直接筛选和简洁入口。收藏路径和 schema 保持不变。20 项前端测试、60 项 Rust 测试及严格 Clippy 通过。[0.1.4 已发布](https://github.com/Reversed-Future/DiscAtelier/releases/tag/v0.1.4)，五项远端资产完整回读并校验；实际 Rust 私有下载及安装包验签通过，篡改副本被拒绝。本地安装包已单独删除。覆盖安装、真实重启、窗口动效仍待用户手动验收，见 [更新说明](docs/UPDATES.md)。

**2026-10-21 首次安装版**：[0.1.3 Windows x64 NSIS 安装包](https://github.com/Reversed-Future/DiscAtelier/releases/tag/v0.1.3) 已发布到私有仓库 `Reversed-Future/DiscAtelier`，源码标签对应提交 `ed07991450740e5779f1b3b1e885baf53f02a8fd`。20 项前端测试、53 项 Rust 测试通过。安装包、SHA-256 清单、发行清单均已从 GitHub 回读并校验大小与摘要；发布后复核资产，已单独删除本次本地安装包。详见 [发布记录](docs/RELEASING.md)。Windows 代码签名、应用内自更新、干净机器安装和覆盖升级仍待完成，未执行安装器或操作用户窗口。

**实现**：GitHub Actions 私有构建、依赖锁定、发行材料、NSIS 安装、Tauri 更新签名；个人只读凭据或更新网关；数据库迁移备份、诊断导出。

**验收**：

- 干净 Windows 环境安装、覆盖更新、卸载保留数据选项。
- 从版本 N 更新到 N+1，来源私有、签名正确、数据完整。
- 错误签名被拒绝；凭据过期、下载中断、磁盘不足均不破坏现有应用。
- 播放中点击安装时自动停止播放、保存进度并结束写事务；不在后台自动安装。
- 验证远端安装资产与哈希后，按本次清单逐个删除明确本地安装包；失败保留。
- 更新私钥备份恢复流程验证；Windows 签名与 updater 签名单独标记状态。

## 1.0 稳定个人版

冻结可用能力矩阵、完成恢复演练和回归测试、整理变更记录和升级指南。未通过的商业 BD 类型明确保持不可用或外部播放器模式，不用“全区”掩盖真实限制。

稳定版不要求购物网站抓价或所有未来品类完成；需要当前收藏、显示、播放与助手已纳入首发的功能达到可靠可用。

## 1.1 以后

1. 购物链接适配：确定首批站点、实际页面和登录方式后再实现。价格包含币种、运费、税、变体、时间与证据；反爬或登录失效时保留旧记录并标识过期。
2. 品类插件：书籍、游戏、磁带或黑胶，复用副本和交易，定制字段、显示和识别方式。
3. 网站同步：用户选择公开记录和字段后导出，遵守现有网站隔离与来源授权。
4. 跨设备：先定义冲突、凭据与资产同步，不能用文件同步直接共享正在写入的 SQLite。
5. 价格历史和库存提醒：有稳定站点适配后加入，不承诺通用抓取任意商城。

## 更新规则

**2026-10-21 0.1.8 发布**：升级备份不再依赖当前应用可打开的 schema 版本；手动录入可直接读取网易云资料和封面并事务保存。51 项前端测试、112 项 Rust 测试、严格 Clippy、签名构建通过；五项远端资产回读一致，实际私有更新下载及签名验证通过，篡改包被拒绝。已分别删除本次本地安装包和 `DiscAtelier-update-music-preview.exe`；收藏、备份和共享资源保留。旧版若已被较新数据库拦截，首次仍需手动覆盖安装；实际安装／重启由用户验收。详见 [发布校验](docs/releases/v0.1.8-verification.md)。以下未发行与预览状态为各次开发阶段的历史记录。

**2026-10-21 升级备份与手动网易云入库修正（未发行）**：升级前改用独立 SQLite 只读快照，收藏业务服务因 schema 过新无法打开时仍可备份后更新；包含 WAL 中已提交数据，完整性检查或备份失败继续拦截安装。设置明确备份永久保留、不自动清理。手动添加音乐收藏可搜索／粘贴网易云链接获取名称、作者、简介、曲目和封面，实体字段保留，确认时事务保存并防止重复入库。51 项前端测试、112 项 Rust 测试（含 6 项新回归）、严格 Clippy、TypeScript／Vite、Tauri Release 构建通过；预览为 `target/release/DiscAtelier-update-music-preview.exe`，未启动程序、操作个人库或发布安装包。旧正式版首次切换仍需手动安装，不能由远端安装包修补其已运行代码。详见 [修正与手动测试](docs/UPDATE-BACKUP-MANUAL-MUSIC.md)。

**2026-10-21 网易云账号预览**：设置接入内置服务扫码登录、昵称和退出；Rust 管理会话和安全凭据，播放按账号权限请求音源，过期提示重新扫码。凭据只保存在 Windows 凭据管理器，不进入收藏备份、前端或自定义 API。47 项脚本测试、8 项账号测试（含真实隔离凭据项）、9 项运行时测试、严格 Clippy 和 Release 构建通过；真实未登录接口二维码及等待扫码状态检查通过。手机扫码确认、重启保留和全曲出声待用户验收。预览：`target/release/DiscAtelier-netease-login-preview.exe`，未发布安装包。详见 [扫码登录测试步骤](docs/NETEASE-LOGIN.md)。

**2026-10-21 网易云播放兼容与匹配修正**：实际公钥响应返回 `publicKey` 而无 `sk`，现已按核实结构适配并保留响应签名和公钥校验；源码及 Release 内置管道实测均成功获取试听地址，实际出声待手动确认。曲目匹配支持繁简、大小写、全半角、空格和标点差异，放宽时长容差；重复标题结合明确分盘／曲号和时长核对，保留版本差异及手动关联优先。43 项脚本测试、前端和 Release 构建通过。新预览为 `target/release/DiscAtelier-music-match-preview.exe`，资源哈希与源码一致；无数据库迁移、安装包或发布。详见 [验证记录](docs/MUSIC-DETAILS-PLAYBACK.md)。

**2026-10-21 入库音乐资料增量**：Discogs 入库时可搜索／选择网易云专辑，资料与收藏在同一事务保存；支持粘贴已核实格式的网易云专辑及歌曲链接。逐曲 Credits 改为歌名同行的折叠入口，来源入口与购入状态同行，两级标签统一样式并去除额外间隔。修正内置播放错误被 Rust 通道覆盖的问题，具体网络失败和实际出声仍待手动复测。38 项 JavaScript 测试、网易云适配器 5 项、运行时 9 项、入库事务 11 项通过，TypeScript／Vite 和严格 Clippy 通过；隔离测试未操作用户窗口、个人库或光盘。详见 [资料与播放记录](docs/MUSIC-DETAILS-PLAYBACK.md)。

本轮 Tauri Release 预览已构建：`target/release/DiscAtelier-import-music-preview.exe`；预览与构建主程序、内置 runner／播放模块与源码均已校验哈希。没有生成安装包或发布 GitHub。

每次合并功能记录版本、完成项、验证命令、实际证据及未解决问题；新需求先标依赖与范围影响。里程碑只在出口标准满足后关闭。延期或阻断更新状态与原因，不以 UI 按钮出现作为完成依据。

下一步由用户从 0.1.4–0.1.6 的“设置 → 更新”安装 0.1.7（需配置 GitHub 只读 Token），完成真实覆盖更新、重启与收藏核对；0.1.3 用户手动安装 0.1.7。再补网易云真实账号音源、跨页面播放列表、封面替换、多盘发行及 DVD 原盘菜单只读实盘验收。来源更新差异确认、版本比较仍待推进。搜索和预览不会修改收藏，确认入库才写入本地版本、来源和独立购买记录；自动检查通过不代表界面或实盘验收通过。

**2026-10-21 0.1.5 发布**：安装包、签名、更新清单、发行清单和 SHA-256 清单已上传并逐字节回读一致；本地及真实私有 GitHub 下载验签通过，篡改包被拒绝，沿用 0.1.4 公钥。本次唯一的本地安装包已单独删除。未运行安装器或操作窗口，详见 [发布校验](docs/releases/v0.1.5-verification.md)。

2026-10-21 本地间距修正：曲目二级标签与列表增加 16 CSS px 固定留白，收藏曲目页与 Discogs 详情同时调整；搜索详情的封面与第一曲目仍共用同一行顶部，保持外框固定与列表独立滚动。此修正纳入 0.1.6 发行，实际画面由用户手动验收。

上述标签层级和间距调整的 Tauri Release 构建通过；手动验收文件：`target/release/DiscAtelier-tabs-preview.exe`。该次预览构建没有生成安装包、发布新版本或操作用户窗口；后续 0.1.6 发行另行记录。

**2026-10-21 0.1.6 发布**：标签层级与 16 px 间距调整已发布；21 项前端测试、63 项 Rust 测试、签名构建通过。五项远端资产逐字节回读一致，真实私有更新下载、签名及版本绑定验证通过，篡改包被拒绝。本次本地安装包已单独删除。未操作窗口或执行安装器，详见 [发布校验](docs/releases/v0.1.6-verification.md)。

**2026-10-21 三项集成预览验证**：74 项 Rust 测试、21 项前端测试、真实网易云响应解析、严格 Clippy、TypeScript／Vite 与 Tauri Release 构建通过。预览为 `target/release/DiscAtelier-integrations-preview.exe`，未启动、未制作安装包、未发布。混合模式 CD 暂拦截播放，避免曲号索引误读；标准音频 CD 的实盘播放、真实 AI 服务及 UI 由用户手动验收。

**内置网易云验证结果**：81 项 Rust 测试、21 项前端测试及严格检查通过；Tauri Release 与 4,828 个资源逐文件校验通过。预览：`target/release/DiscAtelier-netease-preview.exe`，需保留同目录的 `netease-runtime`。未启动桌面或发布安装包。

**2026-10-21 0.1.7 发布**：网易云扫码登录、右下角跨页面播放列表、三个专辑历史、循环模式和网易云封面替换已纳入正式发行，同时包含 0.1.6 后的 CD／网易云／AI 第一阶段集成。51 项前端测试、106 项 Rust 测试、严格 Clippy、签名构建通过；五项远端资产完整回读一致，应用实际私有更新下载、签名和版本绑定验证通过，篡改包被拒绝。已删除本次本地安装包，并按用户特许逐个删除 14 份旧预览／测试程序；以上预览路径作为历史验证记录保留。未操作窗口、个人库或光盘，实际安装与播放由用户手动验收。详见 [发布校验](docs/releases/v0.1.7-verification.md)。

**2026-10-22 网易云单曲独立关联（开发预览）**：逐曲关联独立保存，不要求先关联专辑；网易云资料中的关联入口可粘贴歌曲分享链接、核对歌名／歌手／时长后确认，支持跨专辑歌曲与解除／恢复自动匹配。点击原曲目播放并纳入右下角跨页面列表、循环和最多三个收藏历史；更换专辑资料不覆盖独立关联。schema 8→9 前完整备份，迁移旧手动关联，事务防冲突及备份恢复校验。70 项脚本测试、149 项 Rust 测试、严格检查通过；真实播放与 UI 待用户验收，未发行。详见 [单曲关联测试步骤](docs/INDEPENDENT-SONG-LINKS.md)。


**2026-10-22 每日汇率换算（开发预览）**：设置新增汇率页，配置接口盒子开发者 ID／KEY 和 CNY／HKD／JPY 显示币种；KEY 放入 Windows 凭据管理器，单位汇率独立缓存。每日本地日期自动更新一轮，重启去重、失败保留旧缓存、手动更新有冷却；购入表单、购入详情、整理列表和菜单合计显示参考换算，原币种和金额不改写。实测公开示例发现 rate 为高精度字符串而 result 已舍入，现按完整 rate 用整数运算换算。74 项脚本测试、6 项汇率 Rust 回归、严格检查通过；用户账号和 UI 待验收，未发行。详见 [使用及测试记录](docs/EXCHANGE-RATES.md)。


**2026-10-22 多数字专辑与实体分盘关联（开发预览）**：一份实体可关联多张网易云专辑，分别保存和切换简介、数字发行资料及完整曲目；保留原实体、载体数量、购入记录、封面和独立单曲关联。每个已有实体 Disc 可单独选择音源专辑并保存，匹配只在该专辑内进行，手动单曲优先。连续播放按实体原曲目顺序跨盘进行，切歌重新读取最新关联，历史仍按实体版本保留三份；无实体曲目时按关联顺序。schema 9→10 自动快照备份，旧资料原字节保留及 fallback 身份迁移；事务冲突、回滚、重启和恢复验证通过。同时修复浏览卡片进入中央时替换已解码封面节点的逻辑，改为浏览期间复用封面，仅详情挂载共享层，待用户实测黑帧。80 项脚本测试、160 项 Rust 测试（7 项按原设置忽略）、严格 Clippy、TypeScript／Vite 通过；用户确认《24时》已有两个 Disc 标签，可直接绑定。测试版 `target/release/DiscAtelier-multi-albums-preview.exe`，未发行、未启动窗口或操作个人库。详见 [测试与兼容说明](docs/MULTI-ALBUM-LINKS.md)。

**2026-10-22 0.1.12 已发布**：多专辑关联、Disc 分盘绑定、封面切换修复及单曲关联、V3 模型、每日汇率设置已发布私有正式版并设为 Latest。80 项脚本测试、160 项 Rust 测试、严格检查和签名构建通过；五项远端资产完整回读一致，应用实际更新下载验签通过，篡改包被拒绝。沿用更新公钥与数据目录，schema 10 自动备份迁移。确认上传后逐个清理 30,532 个明确文件，包含本次安装包、四份旧预览及无用构建缓存，约减少 11.75 GiB，保留收藏、备份、正式程序及资源。没有运行安装器或操作窗口，实际 UI、播放及覆盖安装由用户验收。详见 [发布校验](docs/releases/v0.1.12-verification.md)。

**2026-10-22 V3 直接操作调整（开发预览）**：移除专属部件与操作面板，沿用 V2 的直接点击拆装、点击页翻页及按状态出现的放回／返回／全部收起。原装配约束保留，研究海报点击展开，解密保留当前歌词卡的精简入口。82 项脚本测试、六份真实模型内存几何交互验证及前端构建通过；实际窗口验收待用户测试，构建记录见 [V3 说明](docs/MODEL-V3.md)。

V3 直接操作测试版 `target/release/DiscAtelier-v3-direct-preview.exe` 已完成 Tauri Release 构建及 4,834 项必要资源校验。保留正式 0.1.12 主程序；未启动窗口、修改收藏或发布安装包。

**2026-10-22 列表与封面样式调整（开发预览）**：列表模式使用固定视口高度，顶部导航留在滚动区之外；表格保持原有视口宽度与左右留白，滚动条不挤压列宽。汇率来源链接统一灰白，包括访问后状态。封面禁止浏览器原生拖选，去掉按下缩放，保持侧边切换与中央打开逻辑。TypeScript／Vite 通过，未操作用户窗口或收藏；视觉效果由用户验收。测试版同时包含上一轮 V3 直接操作调整，未发布。

列表样式测试版 `target/release/DiscAtelier-layout-preview.exe` 已完成 TypeScript／Vite 与 Tauri Release 构建，47022592 bytes，SHA-256 `e782d6aeb3e4f441bccefd7a66c2e0c36c86cedf65146ac570ab1aad3dc8fc71`；4,834 个运行资源校验通过，正式主程序未覆盖，未启动窗口。

**2026-10-22 助手提示词精简（开发预览）**：将用户提供的完整规范从 7,074 字符精简为 2,195 字符，保留自然陪伴、事实边界和界面确认。对齐现有多专辑查询、Disc 绑定读取、按专辑 ID 追加／更新资料、默认封面来源及实体播放队列，明确当前不能由助手修改绑定、独立单曲关联或指定非默认专辑封面；同步修正五项工具说明，参数和后端授权机制不变。9 项工具／流式测试、5 项确认与冲突测试通过，TypeScript／Vite 和 Tauri Release 构建通过。新提示词已核实嵌入 `target/release/DiscAtelier-assistant-prompt-preview.exe`，4,831 个内置资源哈希一致，正式程序和个人数据未改动。未启动窗口或调用用户 AI 服务；真实语气、意图和工具选择待用户验收，详见 [提示词与测试步骤](docs/ASSISTANT-PROMPT.md)。

**2026-10-22 0.1.13 已发布**：助手提示词、V3 直接交互、列表独立滚动及灰白链接／封面交互样式调整已发布私有正式版并设为 Latest。82 项脚本测试、160 项 Rust 测试、六份模型交互检查、严格 Clippy 与签名构建通过；五项远端资产完整回读一致，应用实际私有更新下载及签名、版本验证通过，篡改包被拒绝。沿用更新身份、收藏目录及 schema 10，无新增数据库迁移。验证后逐个清理 19,724 个文件，包括本次安装包、三个旧预览和无用构建缓存，约减少 8.50 GiB；保留收藏、备份、正式主程序与必要资源。没有运行安装器或操作窗口；实际 UI、模型对话和覆盖安装由用户验收，详见 [发布校验](docs/releases/v0.1.13-verification.md)。

**2026-10-22 影像作品资料（开发预览）**：接入 TMDB 电影／剧集及 Bangumi 动画／影像的作品名搜索、分页和作品链接。新增独立作品快照与实体版本扩展，保留旧字段；包装图片识别沿用兼容 AI 接口和手机上传，逐项展示原值、新值与证据，确认填写后再最终保存。已有影像可从编辑版本补充，Discogs 入口保留。schema 10→11 迁移前自动备份，保存事务、幂等性、冲突和恢复通过验证。84 项前端测试、168 项 Rust 测试（原有 7 项忽略）及严格 Clippy、TypeScript / Vite 和 Tauri Release 构建通过，4,831 个资源哈希一致。测试程序 `target/release/DiscAtelier-video-metadata-preview.exe` 使用独立测试库，不升级正式库。真实 TMDB 账号、用户 AI 与安卓交互待用户测试；未操作窗口或实盘。详见 [影像资料与测试步骤](docs/VIDEO-METADATA.md)。

**2026-10-22 影像辅助文字字号调整**：作品搜索和包装识别的空态提示复用现有 `form-note` 样式（10px、1.8 行高）；作品原名／日期说明、识别证据与来源说明统一到现有辅助文字的 11px 规格，搜索结果摘要采用 11px、1.7 行高。仅修改展示样式，TypeScript / Vite 与 Tauri Release 构建通过。新预览 `target/release/DiscAtelier-video-typography-preview.exe` 延用独立测试库，正式程序哈希未变；未操作窗口或改动收藏。

**2026-10-22 影像设置字段样式补齐**：TMDB／Bangumi 令牌字段改用设置页共用表单样式，标签 11px、输入与占位文字 12px；保存和移除按钮复用现有按钮规格与操作栏间距，支持 Enter 提交并保留空值／忙碌拦截。TypeScript／Vite 与 Tauri Release 构建通过。测试程序 `target/release/DiscAtelier-video-settings-preview.exe` 使用独立测试库，正式主程序哈希保持不变；未启动窗口，视觉效果由用户验收。

**2026-10-22 影像封面与作品详情扩展（开发预览）**：BD／DVD 默认封面框改为 7:10 竖版并完整显示图片，自定义模型不变；新增“使用作品封面”草稿操作，最终确认才保存，简介不重复海报。影像“曲目”改为“章节”，新增角色标签与声优／演员，演职人员展开留白 16px。依据 Bangumi 7157 实际响应保存并展示中文名、别名、话数、放送资料、原作、电视台、版权和官网；新字段缺省兼容旧快照，实体与购入记录不变，schema 保持 11。84 项前端、8 项影像接口及 4 项存储恢复测试、TypeScript／Vite 通过。严格 Clippy 与 Tauri Release 构建通过，测试版 `target/release/DiscAtelier-video-details-preview.exe` 使用独立测试库，两份正式程序哈希未变。未操作窗口，视觉与真实账号验收由用户完成，详见 `docs/VIDEO-METADATA.md`。


**2026-10-22 章节获取与影像显示修正（开发预览）**：补齐 Bangumi 分页分集和 TMDB 按季分集读取，已有收藏可直接读取并核对保存，作品分集与实体收录分开；新增快照字段兼容旧资料，保存保留封面、购入与实体分盘。封面选图及“使用作品封面”移到作品资料顶部。影像大标题显示原名、副标题显示译名，简介移除重复名称及演职人员；停止 Bangumi 人员请求，角色保留头像与声优／演员。86 项前端、11 项影像接口、4 项存储恢复测试及 TypeScript／Vite 通过；公开《缘之空》12 集响应已校验。严格 Clippy 与 Tauri Release 构建通过，预览为 `target/release/DiscAtelier-video-chapters-preview.exe`，使用独立测试库，正式程序哈希未变。视觉与真实 TMDB 账号验收由用户执行，详见 `docs/VIDEO-METADATA.md`。


**2026-10-22 角色属性与简介排版（开发预览）**：角色图改为放大且完整显示；接入 Bangumi 角色详情的性别、生日、血型、身高，保留声优头像。已有收藏增加“刷新角色资料 → 预览 → 确认保存／取消”，保留其他资料并检查版本冲突。简介移至资料页最前，复用 CD 的 12px／1.9 行高。公开 26 个角色详情全部读取成功；旧角色快照和新属性备份恢复通过，schema 保持 11。测试程序使用独立测试库，未修改个人收藏或启动窗口。详见 [影像资料测试](docs/VIDEO-METADATA.md)。

本轮预览已完成：86 项脚本、14 项影像接口、4 项存储恢复测试通过，严格 Clippy、TypeScript／Vite 与 Tauri Release 构建通过。`target/release/DiscAtelier-video-characters-preview.exe` 已校验独立测试库标记与 SHA-256，两份正式程序恢复并保持原哈希。构建记录：`artifacts/video-characters-verification.json`。未启动程序，窗口视觉待用户验收。


**2026-10-22 影像多来源合并与图库（开发预览）**：支持追加并分别保存 Bangumi／TMDB 来源，简介、角色、分集和图库按来源切换，保留原标题来源与收藏封面，可在编辑草稿调整。TMDB 分集增加简介与图片，独立图库展示海报、剧照及分集图片，支持放大；读取后确认保存，图片按需加载。旧单来源快照兼容，多来源备份恢复与版本冲突检查通过。89 项脚本、16 项影像接口、6 项存储测试及严格 Clippy 通过；TypeScript／Vite 与 Tauri Release 构建通过，独立测试程序 `target/release/DiscAtelier-video-sources-preview.exe` 已校验，正式主程序哈希未变；真实 TMDB 账号与视觉效果由用户验收。详见 [影像资料测试](docs/VIDEO-METADATA.md)。

**2026-10-22 影像合并展示修订（开发预览）**：仅简介切换来源，资料属性、章节与图库统一展示；分集使用明确类型／季号和唯一对应关系合并，保留 Bangumi 原名／译名并补入 TMDB 剧情和图片，图片与简介直接展开，不跨特别篇或歧义季强行对应。TMDB 停止演职员查询，角色只显示 Bangumi 动画角色图和声优文字；图库平铺各来源图片并逐图标注。旧快照兼容，读取后确认保存、版本冲突及备份恢复保留，schema 11 不变。95 项脚本、16 项影像接口、6 项存储测试及严格 Clippy、TypeScript／Vite 通过。独立测试版 `target/release/DiscAtelier-video-merged-preview.exe` 已完成 Tauri Release 构建及隔离标记／哈希校验，两份正式程序哈希不变。未操作个人库或窗口；真实 TMDB 与界面由用户验收。详见 [测试步骤](docs/VIDEO-METADATA.md)。

**2026-10-22 旧分集对应及代理修复（开发预览）**：新增逐集按原始集号、原名／译名和播出日期双向唯一核对，旧快照缺少季号也能离线合并；用户截图的《缘之空》第 1 集与时长差异已回归覆盖，同组其他日期冲突不再阻挡该集。已有章节不强制联网补字段。实测环境代理 TLS 失败、Windows 系统代理可达，影像客户端优先跟随当前已开启的单服务器系统代理，连接／超时有限重试并保留原数据。98 项脚本、19 项影像测试、1 项真实无凭据 TMDB 传输测试及严格 Clippy、前端构建通过。独立测试版 `target/release/DiscAtelier-video-episode-fix-preview.exe` 已完成构建与隔离标记、哈希校验，正式程序原哈希不变；未读取个人库或令牌、未操作窗口。详见 [测试步骤](docs/VIDEO-METADATA.md)。

**2026-10-22 分集译名宽松对应（开发预览）**：逐集核对改为同收藏已关联来源内集号、播出日期双向唯一对应，不再用译名完全相同作硬门槛；标题仅辅助消歧。覆盖“害羞／难为情”、旧资料、时长差异、日期冲突、多季歧义及反向一致性，保持原名／译名并补入简介和配图。102 项脚本测试、TypeScript／Vite 通过；不改数据库、原始来源快照或网络配置。独立测试版 `target/release/DiscAtelier-video-translation-preview.exe` 已完成 Tauri Release 构建与隔离标记、哈希校验，正式程序原哈希不变；未操作个人收藏或窗口。

**2026-10-22 影像标签结束线与资料间距（开发预览）**：移除章节页和作品预览中的实体收录提示；底部分隔线统一由共用操作行绘制，章节隐藏编辑入口时保留行尺寸与键盘不可访问状态，修复切标签时结束线错位。官网及类型统一放入同一资料网格，使用现有 17px 行间距。TypeScript／Vite 通过；本轮仅展示调整，无数据或匹配逻辑改动。独立测试版 `target/release/DiscAtelier-video-tab-layout-preview.exe` 已完成 Tauri Release 构建及隔离标记、哈希校验，两份正式程序原哈希保持不变；未操作个人收藏或窗口。

**2026-10-22 0.1.14 发布准备**：BD 资料、TMDB／Bangumi 多来源合并、章节匹配和界面修订纳入正式发行。102 项脚本测试、185 项 Rust 测试和工作区严格 Clippy 通过；8 项需要环境的测试默认忽略，更新签名及私有仓库下载将在发布流程中单独验证。版本统一为 0.1.14，沿用正式数据目录与更新签名，schema 10 → 11 备份迁移及旧收藏、购入、多来源资料恢复已通过测试。发布后远端校验与清理结果另记于发布校验文档。


**2026-10-22 0.1.14 已发布**：BD 资料、TMDB／Bangumi 合并、章节匹配和界面修订已发布私有正式版并设为 Latest。102 项脚本、185 项 Rust 测试、严格 Clippy 与签名构建通过；五项远端资产完整回读一致，应用实际私有更新下载、签名和版本验证通过，篡改包被拒绝。schema 10 → 11 备份迁移及旧收藏恢复测试通过。验证后按清单逐个删除 32,457 个安装包、预览和无用缓存文件，失败 0，去重占用减少约 14.80 GiB；收藏、备份、正式主程序及必要资源保留。未运行安装器或操作窗口，详见 [发布校验](docs/releases/v0.1.14-verification.md)。


**2026-10-22 前后编卡片（开发预览）**：实体版本可显式设置两编、来源分配、封面来源和顺序；首页与列表仍只计一份收藏，详情翻面切换作品资料并保持当前标签，购入信息共用。来源内继续合并，跨编章节隔离；刷新只查询当前编，确认保存保留完整资料。schema 11 → 13 增加版本级分编表及排序表并迁移前备份，旧收藏不自动分组。106 项脚本测试、73 项存储测试及 TypeScript／Vite 已通过；严格 Clippy 与 Tauri Release 构建通过。详见 [测试步骤](docs/VIDEO-PARTS.md)。


同批修复文件输入取消事件冒泡导致编辑弹窗关闭；列表增加拖拽及 Alt + 上下键排序，事务持久化、跨分类拒绝、备份恢复通过。Windows 前端拖拽已按本地 Tauri 文档配置。最终独立测试程序 `target/release/DiscAtelier-video-parts-preview.exe` 已校验隔离标记、SHA-256 和 4,834 个资源；两份正式程序哈希保持原值，未启动窗口或读取个人数据库。实际选图取消、翻面和鼠标拖拽由用户验收，记录 `artifacts/video-parts-verification.json`。

**2026-10-22 自定义窗口栏（开发预览）**：取消系统标题栏和白色边框，使用与导航同色的紧凑黑白窗口按钮；支持拖动、双击最大化／还原、最小化、关闭及原生边缘缩放。窗口控制随活动弹窗进入顶层，面板独立动画和滚动，视频全屏隐藏控制栏。关闭继续触发原播放器及内置网易云退出流程；保留文件选择取消修复和列表拖拽配置。本轮不新增数据库变更。106 项脚本、TypeScript／Vite 与 Tauri Release 构建通过；独立测试程序 `target/release/DiscAtelier-window-chrome-preview.exe` 已校验隔离标记、哈希及 4,834 个运行资源，两份正式程序哈希保持原值。未启动程序、未读取个人库，原生窗口交互待用户验收；详见 [测试步骤](docs/WINDOW-CHROME.md)，记录 `artifacts/window-chrome-verification.json`。

**2026-10-22 0.1.15 发布准备**：前后编翻面、文件选择取消修复、列表持久排序及自定义窗口栏纳入正式发行。106 项脚本、189 项 Rust 测试、工作区严格 Clippy 和 Rust 格式检查通过；8 项环境测试默认忽略，其中本地安装包与私有 GitHub 更新验证将在正式签名构建后单独执行。schema 11 → 13 迁移前备份、旧收藏保留、分编与排序恢复已验证。正式版沿用原数据目录与更新签名身份，不启用独立预览特性。

**2026-10-22 0.1.15 已发布**：前后编翻面、文件选择取消修复、列表拖拽排序与自定义窗口栏已发布私有正式版并设为 Latest。106 项脚本、189 项 Rust 测试、严格 Clippy、格式检查及签名构建通过；五项远端资产完整回读一致，应用实际私有更新下载、签名及版本验证通过，篡改包被拒绝。schema 11 → 13 迁移前备份、旧收藏与分编／排序恢复测试通过。确认远端后按清单逐个删除 23,229 个安装包、预览及缓存文件，失败 0，占用减少约 9.12 GiB；收藏、备份、源码、密钥及正式主程序必要资源保留。未运行安装器或操作窗口，详见 [发布校验](docs/releases/v0.1.15-verification.md)。

**2026-10-22 CD 曲目读取修复（开发预览）**：在用户 F: 的 Optiarc BC-5500S 上复现零访问权限 TOC 查询返回 Windows 错误 5、界面只显示卷标而没有播放入口。TOC 改用单独的 GENERIC_READ 只读句柄，设备元数据查询继续使用零访问权限；未识别的介质不再静默吞掉 TOC 读取错误。实际 WindowsOptical.enumerate 已读出 3 首曲目、时长及全部播放路由。3 项光驱测试（含实盘 TOC 回归）、严格 Clippy、TypeScript／Vite 与 Tauri Release 构建通过。独立测试程序 `target/release/DiscAtelier-cd-read-preview.exe` 已校验隔离标记、哈希及 4,834 个运行资源，两份 0.1.15 正式程序原哈希保持不变。未播放声音、操作窗口或修改个人收藏；实际音频输出待用户验收。详见 [CD 读取修复](docs/CD-READ-FIX.md)，记录 `artifacts/cd-read-verification.json`。

**2026-10-22 CD 歌名与元数据（开发预览）**：通过配置的 libVLC 3 读取整盘子项，补充歌曲名、艺术家、专辑、年份／日期、流派及曲号／总曲数；在光驱选择框、CD 播放页、返回首页后的播放提示和播放历史使用识别标题。资料查询不发声、不打开窗口，与设备枚举和播放独立；按盘片 token 校验，缓存成功及短期失败，支持重新识别，缺失资料仍可按真实曲号和时长播放。F: 实盘已读出 Lemon、クランベリーとパンケーキ、Paper Flower，均为米津玄師／Lemon／2018，流派为空。14 项相关 Rust 测试、严格 Clippy、格式检查、TypeScript／Vite 和 Tauri Release 构建通过。独立测试程序 `target/release/DiscAtelier-cd-metadata-preview.exe` 已核对隔离标记、SHA-256、4,834 个资源的两处副本及两份正式程序原哈希。没有数据库迁移，未启动应用或测试声音输出。详见 [测试步骤](docs/CD-METADATA.md)，记录 `artifacts/cd-metadata-verification.json`。

**2026-10-22 0.1.16 发布准备**：CD 目录读取修复与曲目资料识别纳入正式发行。106 项 JavaScript 测试、193 项 Rust 测试、工作区严格 Clippy 和格式检查通过；8 项环境测试默认忽略，其中本地安装包和实际 GitHub 私有更新将在签名构建后单独验证。升级前备份（包括较新 schema）、旧收藏保留和备份恢复测试通过。本版没有数据库迁移，沿用正式数据目录和更新签名身份。

**2026-10-22 0.1.16 已发布**：CD 播放目录读取修复及歌曲元数据识别已发布私有正式版并设为 Latest。106 项脚本、193 项 Rust 测试、严格 Clippy、格式检查及正式签名构建通过；五项远端资产完整回读一致，实际私有更新下载、签名及版本验证通过，篡改包被拒绝。发布后按清单逐个删除 24,278 个安装包、旧预览和无用构建缓存文件，失败 0，文件去重占用减少约 10.07 GiB；收藏、备份、源码、密钥及正式主程序和必要资源保留。两份正式程序均为 0.1.16，哈希及各 4,834 个资源复核通过。未执行安装器或声音播放，详见 [发布校验](docs/releases/v0.1.16-verification.md)。


**2026-10-26 0.1.27 发布准备**：自定义资料编辑、收藏曲目与章节搜索、光盘菜单识别修复及具体 Disc 自动关联／纠错、BD 同级分盘和编辑表格布局纳入正式版。修复嵌套曲目删除误删整组的问题，旧测试补齐角色头像字段，网易云进程测试改用独立临时目录。118 项 JavaScript、236 项 Rust 测试及工作区严格 Clippy 通过；9 项环境测试默认忽略，签名和公开更新下载另行验证。上一版功能命令、运行资源、正式数据标识和更新公钥保留；schema 15 → 16 迁移前备份与旧关联保留已通过回归。用户确认沿用本人设为公开的仓库发布源码及安装包。


**2026-10-26 0.1.27 已发布**：公开 GitHub 正式发行并设为 Latest，源码标签与安装包同步上传。五项资产在发布前后完整回读一致，本地及实际更新下载签名／版本验证通过，损坏包被拒绝。118 项前端和 236 项 Rust 回归、14 项编辑表格布局及严格 Clippy 通过，旧 119 个接口与资源配置保留。匿名代理发生 GitHub 限流，直连大包下载超时；已有 GitHub 登录身份的测试链路通过，网络限制如实记录。确认上传后逐个删除本次安装包与旧预览；没有批量清理缓存，收藏和备份未改动。详见 [发布校验](docs/releases/v0.1.27-verification.md)。

**2026-10-26 0.1.28 发布准备**：分盘结构与旧关联兼容、按 Disc 匹配歌曲、网易云静默预启动、启动更新提醒及忽略、提示淡入淡出、曲目编辑入口纳入发行。145 项 JavaScript、243 项 Rust 测试、工作区严格 Clippy 和格式检查通过；9 项环境测试默认忽略，本地包签名及远端更新另行验证。上一版 121 个命令、运行资源映射、正式数据标识、更新公钥和安装配置均保留，无新增数据库迁移。

**2026-10-26 0.1.28 已发布**：公开 GitHub 正式发行并设为 Latest。145 项 JS、243 项 Rust 回归、严格 Clippy、格式检查及签名构建通过；121 个旧接口与原数据／更新身份保留，无新增数据库迁移。五项资产在草稿与正式发布后完整回读一致；本地与实际更新下载签名／版本验证通过，损坏包被拒绝。当前代理匿名请求遭 GitHub 限流，已有登录身份的更新链路通过。上传验证后删除单个本地安装包；按最新批量清理限制保留旧预览及缓存，收藏和备份未改动。详见 [发布校验](docs/releases/v0.1.28-verification.md)。

**2026-10-26 0.1.29-beta.1 本地安装包已交付**：包含 SMTC、网易云歌词、完整播放界面及紧凑方形开关。5,607 个运行资源完整性、安装包更新签名与版本绑定验证通过；分发副本 SHA-256 为 D5B860C6F40946C1FA68EBFE6515EAAEED2055956E5D483E7850620485580137。按用户最新要求仅交付安装包供手动安装，未执行安装器、未发布 GitHub，已安装正式程序哈希保持不变。安装前数据库和设置备份已保留；旧备份经真实恢复校验确认含 52 条收藏、67 张图片和 15 个模型，尚未写回正式数据目录。签名验证记录 artifacts/beta-installer-signature-verified.log，资源验证记录 artifacts/beta-install-packaging.json。

**2026-10-26 播放页布局与网易云音量（开发预览）**：网易云播放弹窗复用本地音量控件；网易云、本地音乐与 CD 播放页删除顶部来源和排序提示，专辑信息到曲目／歌词标签保留 24px 间距，光盘与内容区上沿对齐。CD 专辑／艺术家采用同一标题样式，保留年份、流派、曲号和重新识别。实际 React 组件在 1440×960 与 960×680 下通过 12 项来源／标签组合的几何检查，光盘保持圆形，底部控制条无重叠；网易云小弹窗 0 与 100 音量命令验证通过。截图采用隔离示例数据和演示歌词，未访问实际收藏或播放声音。TypeScript、Vite、Tauri Release 构建及 5,603 个资源哈希通过；预览 target/release/DiscAtelier-netease-volume-preview.exe，SHA-256 603ADA77440A48B879FB62323BB5A6B8D5FC0410632D5DE75390C142AC366558。已安装 Beta 程序哈希保持不变，未覆盖安装或清理数据。记录 artifacts/audio-layout-verification.json、artifacts/netease-volume-verification.json。

**2026-10-26 光盘与上一首按钮对齐（开发预览）**：按用户进一步调整，光盘左边缘随窗口尺寸对齐上一首按钮左边缘；网易云、本地音乐和 CD 统一应用，右侧标题、标签、曲目／歌词位置保留。1440×960、960×680 下 12 项布局组合检查通过，含按钮与光盘左边缘误差小于 1px、圆形比例和底部无重叠。TypeScript、Vite、Tauri Release 构建与 5,603 个资源校验通过。预览 target/release/DiscAtelier-audio-disc-left-preview.exe，SHA-256 96BD136DCE017835AA2A929AB5FB476669223E6099D9A6149AD5565137035078。截图和证据 artifacts/audio-layout-verification.json；正式程序及收藏数据未修改。

**2026-10-26 0.2.0 发布准备**：按用户指定版本号，将 SMTC、网易云歌词、统一完整播放页、本地音乐切换、网易云弹窗音量和紧凑方形开关纳入正式发行。149 项 JavaScript 与 247 项 Rust 回归通过（版本号调整前的同一功能代码；9 项环境测试默认忽略），0.2.0 工作区严格 Clippy 和版本一致性／源码敏感文件检查通过。保留 0.1.28 全部 121 个接口、收藏数据身份、更新公钥及安装配置；无新增数据库迁移。三来源、两标签、两窗口尺寸共 12 项布局检查及音量控制指令通过，SMTC 与歌词的模拟 IPC 验证记录保留。正式签名包和远端更新正在验证。

**2026-10-26 0.2.0 已发布**：按用户指定版本号公开发布正式版并设为 Latest，源码标签与五项发行资产已上传。草稿及正式发布后完整回读五项文件，大小和哈希一致；本地签名及实际已发布更新下载、签名版本、损坏包拒绝验证通过。本机匿名 GitHub 请求被拒绝，使用已有 GitHub CLI 登录身份的实际更新链路通过，未改动应用凭据。149 项 JS、247 项 Rust 回归、0.2.0 主程序 80 项补充测试、严格 Clippy、版本／源码检查及 5,607 个打包资源校验通过。发布后只删除已验证的单个本地正式安装包；按最新批量删除限制保留旧 Beta 安装包、预览及缓存，收藏和备份未改动。详见 [发布校验](docs/releases/v0.2.0-verification.md)。
