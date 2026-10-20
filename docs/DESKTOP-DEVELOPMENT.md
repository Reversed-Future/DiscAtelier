# 桌面开发记录

2026 年 10 月 20 日，开始正式 Tauri + Rust 开发。当前版本号 0.1.3 表示开发增量，不表示整个 0.1 或 0.2 里程碑、稳定版已经完成。

## 本轮可用流程

启动桌面程序 → 空收藏库 → 手动填写版本和载体 → 填写购买资料 → 保存 → 浏览、检索或整理 → 修改购入信息 → 关闭程序 → 重开仍保留。

音乐分区的添加入口直接进入 Discogs → 条码／品番搜索 → 选择具体版本 → 核对本地版本 → 购入 → 加入收藏；需要时切换手动录入。新发行自动下载、保存并显示封面，同一来源发行再次收藏复用本地版本及封面，购买记录独立。更多菜单的配置操作统一到设置：Discogs 凭据、备份、恢复和版本信息；详见 Discogs 开发记录。

同一发行可以通过详情的“再收一套”创建独立实物副本，不重复创建作品和发行；每套独立计价。CD+BD 是一套、两张载体。只有已购入的价格计入金额合计，分币种，不做隐含汇率换算。未填写金额保持 NULL；零价单独保存。条码和品番不转换大小写、不删除前导零。当前搜索是 SQLite 参数化精确子串检索，不做大小写归一；FTS 与更大规模虚拟化仍待后续。

所有版本和副本使用 UUID 内部标识；原型样片不会自动导入。无封面时由本地文字与盒体样式绘制默认外观。新增与“编辑版本”可导入 PNG／JPEG／WebP，单图最多 8 MiB、8192 × 8192；Rust 校验文件格式与完整解码，并限制解码内存为 128 MiB。图片原始字节保持不变，SHA-256 去重后与版本引用一起事务提交。浏览时按需获取封面，前端最多缓存 8 个资产请求。

版本编辑同步同一发行所有副本的标题、作者、版本、条码、品番、载体与封面；各套价格、店铺等购买资料独立。多套版本的编辑窗口显示受影响套数。移除封面只解除引用，恢复默认外观；当前保留原资产，不执行资产回收。

## 工程边界

| 目录 | 职责 |
| --- | --- |
| apps/desktop/src | React 界面、输入状态和 LibraryGateway 调用 |
| apps/desktop/src-tauri | 窗口配置、状态组装、异步命令边界 |
| crates/domain | 字段、金额／日期／状态／链接校验，品类和载体注册 |
| crates/contracts | v1 请求、响应和可识别错误 |
| crates/application | LibraryRepository 端口、写入前校验、统计用例 |
| crates/storage-sqlite | SQL、事务、迁移、去重凭据、备份 |
| crates/provider-discogs | Discogs HTTP、精确响应字段、节流与错误映射 |

UI 不使用 SQL、文件系统或通用 shell 接口。SQLite 适配器实现仓储端口，后续数据源和助手应调用应用用例，不能绕过校验直接写库。品类／载体描述由后端注册表返回前端。本轮仅内置静态注册，不宣称已支持第三方运行时插件。

## 持久化

Tauri 使用 `app.path().app_local_data_dir()` 下的 `library.sqlite3`，应用标识为 `com.reversedfuture.discatelier`。Windows 对应用户本地应用数据目录中的该应用文件夹。启用外键、WAL 和 5 秒锁等待。

迁移在事务内完成，记录版本和 SHA-256；未知新版本、迁移缺失或校验不符拒绝打开并由主界面显示错误。schema 2 增加发行 revision、封面引用与 assets 表。已有 schema 1 库先通过在线备份保存到 `backups/before-schema-1-{uuid}.sqlite3`，成功后才迁移；已升级库重开不重复备份。

0.1.3 新库直接初始化到 schema 3；schema 3 增加 `edition_sources` 与 `imported_identifiers`。旧库升级前保存 `before-schema-{version}-{uuid}.sqlite3`；迁移失败回滚，原记录和封面继续保留。旧备份恢复时在隔离快照上完成迁移，不修改原始备份。

当前有大小限制的封面保存在 SQLite BLOB 中，使版本资料、资产引用、图片与请求回执能够原子提交，也使现有单文件备份包含封面。代价是数据库会随图片增长；模型等大型资产的独立文件适配器仍待实现。

写请求带 UUID requestId，事务内保存操作类型、序列化载荷摘要和结果。重试同一请求返回同一结果；复用同一标识但修改载荷会被拒绝。副本与发行各自维护 revision，修改必须匹配各自的 expectedRevision，旧窗口无法覆盖新数据。前端对未改变内容的重试保留 requestId。

“备份收藏”使用 SQLite Online Backup API，在同应用数据目录的 `backups` 中创建唯一时间戳／UUID 文件。

“恢复收藏”可选择已有备份或填写外部备份的完整路径。先只读打开源文件，复制到独立内存数据库，校验完整性、迁移 checksum、完整表结构、外键、购买记录、封面 SHA-256 和图片解码；显示套数、版本数、封面数后，由用户确认整体替换。提交前检查当前库是否在预览后改变，先备份当前库，再用 SQLite Backup 的单步提交恢复。重复确认无效；源文件在检查后改变不会影响已检查的快照。原始备份不修改、不清理，恢复前自动备份可再次选中恢复。

恢复当前采用内存暂存，所需内存随备份体积增长；尚未验证超大数据库。当前库能正常打开时可从界面恢复，启动即损坏的数据库仍需专项救援流程。恢复与当前实例的其他数据库操作串行；尚未支持多个程序实例同时编辑同一数据目录。

## IPC

| 命令 | 请求 | 返回 |
| --- | --- | --- |
| library_list | query: categoryId、status（null 表示全部）、query | copies、categories、carriers、amounts、ownedCount、mediumCount、unpricedCount |
| library_create | request: requestId、edition 或 existingEditionId、copy、cover（新版本的图片 data URL 或 null） | 新副本 id |
| library_update | request: requestId、id、expectedRevision、copy | 修改副本 id |
| library_update_edition | request: requestId、editionId、expectedRevision、edition、cover | 修改发行 id |
| library_cover | assetId | 图片 data URL |
| library_backup | 无 | 备份文件路径 |
| library_backups | 无 | path、name、byteLength 列表 |
| library_prepare_restore | path | token、copies、editions、assets |
| library_restore | token | 恢复前自动备份路径 |

版本更新的 cover 为 `{action:"keep"}`、`{action:"remove"}` 或 `{action:"replace",dataUrl:"…"}`。列表副本增加 editionRevision、editionCopyCount、coverAssetId，避免把图片正文放进每次列表查询。

金额单项为整数最小货币单位；跨副本汇总返回十进制字符串，前端使用 BigInt 排版，避免 JavaScript 合计精度损失。错误包含 code 和面向用户的 message。当前 v1 为随程序一起发布的本地契约；外部插件的协议版本协商尚未实现。

## 构建和检查

已用 Rust 1.95.0、Node.js 22.19.0、Tauri 2.12.4 构建。npm 与 Cargo 均生成锁文件。

```powershell
npm run build
cargo build -p discatelier-desktop
cargo test --workspace
## Windows 若拒绝启动桌面 crate 的空测试执行文件，可单独运行全部逻辑测试：
cargo test --workspace --exclude discatelier-desktop
node scripts/verify-desktop.mjs 'E:\ToolsForMyself\AtelierPublisher\node_modules\@playwright\test\index.mjs'
node scripts/verify-recovery-access.mjs 'E:\ToolsForMyself\AtelierPublisher\node_modules\@playwright\test\index.mjs'
node scripts/verify-discogs.mjs 'E:\ToolsForMyself\AtelierPublisher\node_modules\@playwright\test\index.mjs'
node scripts/verify-discogs-import.mjs 'E:\ToolsForMyself\AtelierPublisher\node_modules\@playwright\test\index.mjs'
```

0.1.2 基线包含存储测试 14 项：原有 11 项覆盖重启保留、重复请求、独立副本、统计检索、字段校验、事务回滚、迁移、共享发行和封面；新增 3 项覆盖恢复及恢复前备份、损坏资产／额外触发器／过期预览拒绝、源文件在预览后变化不影响恢复快照。Discogs 适配器另有 4 项隔离 HTTP 测试，覆盖多载体原值、查询编码与认证头、HTTP 错误和退避、重定向／错误结构／发行 ID 不一致。

0.1.3 新增 4 项导入存储测试和 2 项数据源测试，共 24 项逻辑测试通过，Clippy 全 workspace、全部 targets 无警告。当前机器两次拒绝启动桌面 crate 的空单元测试执行文件（Windows error 5），因此不将 `cargo test --workspace` 记作通过；上述排除空桌面测试执行文件的命令通过，实际桌面程序则通过真实 WebView2／Rust IPC 验证。原生 UI 脚本依次运行，避免多个测试窗口抢占焦点。

实际桌面验证使用 WebView2 CDP 操作编译后的 Tauri 程序，经真实 IPC 读写 SQLite，无浏览器假数据库。15 项覆盖手动新增、多载体、编辑、重复副本、筛选统计、品番检索、备份、进程终止重启、整理、分区隔离、切换溢出、封面导入替换、共享版本编辑和封面重启保留。脚本异常为零。0.1.3 最新证据在 `artifacts/desktop-1792491331120/results.json`；重新执行会创建独立目录。测试封面使用项目图标，只写入隔离测试库。

切换滚动条的原因为整个内容区入场位移 6 px，短暂超过窗口高度。完整页面改为淡入，保留局部与弹窗位移动效，快速切换取消前次入场动画；未隐藏真实长列表的滚动。修复前脚本测得最大文档溢出 6 px，最新回归空库 244 帧、有收藏 235 帧，文档、内容区及横向最大溢出均为 0。

测试专用 `DISCATELIER_TEST_DATA_DIR` 仅在 debug 构建中识别，测试时由子进程环境传入。测试脚本只关闭自己启动的进程；数据保留供核验，不执行批量删除。WebView2 调试参数及隔离的 `WEBVIEW2_USER_DATA_FOLDER` 也仅传给测试子进程。日常启动无需调试端口。

## 已知边界

Discogs 已开始接入，见 [Discogs 开发记录](DISCOGS-DEVELOPMENT.md)。网易云、模型、光驱、播放、助手和自更新尚未接入。没有区域播放能力。没有对外发布安装包，也没有上传或清理安装文件。

缩放快捷键为 Ctrl + 加号／减号，Ctrl + 0 回到 100%，范围 75%–200%。Tab／Shift+Tab 在弹窗内循环，关闭后返回触发控件；下拉框支持方向键、Home／End、Enter、Escape；收藏支持左右方向键和 Enter；斜杠打开搜索。输入框仍无焦点边框高亮，按钮保留键盘焦点反馈。减少动态模式关闭动画。

短内容与轻微溢出隐藏滚动条，保留滚轮、触摸板和键盘滚动。当前内部判定：溢出长度大于容器自身可视长度且超过 320 CSS px，才显示细滚动条；内容、窗口尺寸和缩放变化后重新计算。该阈值属于展示策略，不改变数据或裁掉可访问内容。

0.1.3 恢复／键盘／缩放验收见 `artifacts/recovery-access-1792490894461/results.json`：1440×960、960×680 两个原生窗口分别覆盖 100%、125%、150%、175%、200%，共 10 组。最小 CSS 视口 480×340，保存按钮通过键盘可达，弹窗 Tab 焦点循环、关闭后返回、短内容隐藏滚动条均通过。完整视口截图使用 CDP `Page.captureScreenshot`，避免原生 WebView 缩放影响截图裁剪。

随后快速缩放补测发现 `setZoom` 尚未返回时，下一次按键可能读取旧缩放值；现改为立即记录目标档位并串行应用。修复后 `artifacts/discogs-import-1792491263248/results.json` 验证导入表单在最小窗口连续放大到 200%，35 次 Tab 不逃出弹窗、保存按钮可达且无横向溢出。此前一次多窗口回归中 WebView 提前关闭，单独重跑通过；未将失败运行计入通过结果。

真实万级库、多显示器 DPI、屏幕阅读器及完整无障碍仍需后续验收。封面资产暂不回收；大量原尺寸图片会增加数据库和备份体积。

## 实现依据

命令与状态使用 [Tauri Rust IPC 文档](https://v2.tauri.app/develop/calling-rust/)，窗口与 CSP 参照 [Tauri 配置文档](https://v2.tauri.app/reference/config/)。桌面自动化使用 [Microsoft WebView2 调试说明](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/debug-visual-studio-code) 与 [Playwright WebView2 指南](https://github.com/microsoft/playwright/blob/main/docs/src/webview2.md)。SQLite 备份 API 以锁定的 rusqlite 0.40.2 本地源码为依据。
