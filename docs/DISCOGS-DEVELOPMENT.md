# Discogs 接入记录

2026 年 10 月 20 日，开发版 0.1.3。已接通条码／品番搜索后的版本选择和收藏入库；真实认证搜索、复杂曲目与版本比较仍是 0.2 后续范围。

## 已实现

- 音乐分区的右上角“添加”和空库“添加收藏”直接打开 Discogs，按条码、品番、关键词检索具体发行；分页每页 20 条，最多浏览前 100 页。更多菜单中的重复搜索入口已移除。
- 搜索面板保留“手动录入”，未配置 Token 时也可手动添加。影像分区保持手动录入；已有版本“再收一套”仍直接进入购入表单。
- 直接输入发行 ID 获取具体资料；无 Token 时可访问允许匿名读取的发行。
- 展示原始发行日期、国家、厂牌品番、多组格式的 name／qty／descriptions／text、多个标识符和顶层曲目列表。部分日期如 `1987-07-00` 保留原值，不自动补成某一天。
- Token 在“更多 → 设置 → Discogs”中通过密码框输入后保存到 Windows 凭据管理器；搜索页的“设置”可直接打开同一配置。前端只能查询“是否已保存”，没有读取 Token 的 IPC。替换／移除均由用户操作。收藏数据库、备份、前端存储均不包含 Token；凭据保存不表示已通过在线认证。
- Rust 单独处理网络请求，和收藏数据库使用不同状态锁。元数据 HTTP 仅请求固定的 `https://api.discogs.com`，封面下载仅接受 `https://i.discogs.com`，都不跟随重定向；Token 只放元数据请求的 Authorization 头。连接超时 8 秒、总超时 20 秒，元数据响应上限 4 MiB、图片上限 8 MiB。
- 正常连续请求在 Rust 工作线程按 3 秒间隔排队；读取 `X-Discogs-Ratelimit-Remaining`，耗尽或 429 后按 Retry-After／60 秒退避，不自动重试。401／403、404、429、服务错误、网络失败、超时、结构变化分别返回错误。
- 搜索结果与发行预览只在内存中暂存，六小时后停止展示；Rust 保留最后一次发行响应和最多 16 个导入预检，超过六小时不得用于确认，退出进程后丢弃。市场信息、用户资料不进入展示 DTO 或收藏数据库；搜索图片地址仅用于在线展示，不导入收藏。
- 搜索面板锁定高度并适配小窗口，列表隐藏滚动条，保留滚轮与键盘滚动，翻页固定在底部。版本行显示缩略封面；缺失或失败显示黑白占位。
- 版本详情保留 Discogs 来源链接，通过系统浏览器打开固定的发行地址；按用户要求，搜索列表移除每行重复的来源文字。网络接口不直接改收藏，用户确认后由应用用例写入。
- 搜索结果点选版本，返回搜索保留查询及页码。版本页只保留返回、来源链接和“选择此版本”，随后复用版本／购入表单，未确认不入库。
- 首次选择具体发行后自动下载封面并带入版本表单，确认入库时作为资产与收藏同事务保存；不要求手动上传，可自行更换或移除。封面随重启、离线读取及备份恢复保留。无图片的发行使用默认外观；下载失败或图片损坏时提示重试，尚未写入收藏。再选同一发行进入“再收一套”，不再下载图片，继承本地资料及封面，各套状态、价格、购买位置与链接独立。不同 release ID 不合并；本轮不批量补填历史收藏的空封面。
- `qty` 展开为逐张载体；精确映射 CD／CDr、DVD、Blu-ray、Vinyl、Cassette；Box Set／All Media 仅作为版本描述，不增加盘片。未知格式留下待选载体，不默认填 CD；非法数量或超过 99 张明确拒绝。
- 首条 Barcode 与首个厂牌品番作为可编辑主显示值；全部 identifiers 与 labels.catno 原文进入关联索引，可按其他条码、品番检索。前导零、空格与大小写不改写。顶层曲目仍只在在线预览中显示，尚未持久化为内容树。
- schema 3 增加来源和多标识符表；版本、来源、封面、副本、购买记录及写入回执同事务提交。重复请求返回原副本；来源已存在但当前表单未确认复用时拒绝；同版副本检查发行 revision，避免使用过期预览。

## 精确契约与来源

| IPC | 参数 | 返回 |
| --- | --- | --- |
| discogs_configured | 无 | boolean |
| discogs_save_token | token | 空 |
| discogs_forget_token | 无 | 空 |
| discogs_search | request: mode、query、page | results、pagination |
| discogs_release | id | MetadataRelease |
| discogs_open_release | id | 空；打开该发行的 Discogs 页面 |
| discogs_prepare_import | id、categoryId | token、edition、source、existing、cover |
| discogs_import | request | 新副本 id；同一 requestId 重试返回同一副本 |

新增本地请求定义：`ImportCopyRequest` 包含 requestId、token、edition、copy、cover、existingEditionId、expectedRevision；已有发行必须同时传已有 id 与 revision，新发行两者为 null。`EditionSource` 包含 providerId、externalId、fetchedAt。可信来源及全部标识符只由 Rust 根据预检 token 取出，前端不能提交来源载荷。token 的有效期以实际获取发行资料的时间起算，不因重复打开表单延长。

存储索引 `ImportedIdentifier` 的 namespace 为本项目定义的 `identifier` 或 `catalog`；前者 kind 来自 API 的 identifiers.type，后者 kind 来自 labels.name；value 分别来自 identifiers.value 与 labels.catno。这些是本地导入契约，不声称外部 API 存在 namespace 字段。

内部 mode 定义为 barcode／catalog／keyword，分别发送 barcode／catno／q；type 固定 release。条码和品番原文不归一化。外部键名依据已有集成记录、[Discogs 官方客户端及测试数据](https://github.com/discogs/discogs_client)和当前公开 API 响应核实；官方客户端已停止维护，仅用于核对既有契约，不作为运行依赖。

公开响应验证入口为 [发行 249504](https://api.discogs.com/releases/249504)。接口返回的 formats、identifiers、labels、tracklist 实际结构用于核对 DTO。公开发行验证不等于认证检索验证。离线 HTTP 测试使用明确的人工样本，保持已核实的字段类型，不声称是真实多载体发行抓包。

搜索图片字段 `thumb`、`cover_image` 及 `https://i.discogs.com` 地址依据 [go-discogs 客户端搜索响应测试数据](https://github.com/stmcallister/go-discogs/blob/main/database_test.go)核对。缺省地址按空字符串解析，优先 thumb，失败后尝试 cover_image；只允许该 HTTPS 图片域名。搜索缩略图由 WebView 直接加载，不带 API Token，禁用 Referer。

收藏封面来自具体发行 `images`，2026-10-20 实际读取发行 249504 核实 `type`、`uri`、`uri150`。优先 `type = primary` 的图片；没有主图时取第一张有地址的图片，uri 为空时才用 uri150。Rust 下载并校验 PNG／JPEG／WebP 的实际内容、最多 8 MiB、8192 × 8192、128 MiB 解码内存；不向图片服务器发送 Token。新增本地预览字段 `cover` 是图片 data URL 或 null，沿用现有封面写入契约与 SHA-256 资产去重，不新增数据库迁移。模型资产仍未接入；后续模型展示优先，保留该封面作为降级外观。

凭据库使用 [keyring 3.6.3](https://docs.rs/keyring/3.6.3/keyring/)，显式开启 windows-native；网络使用锁定的 reqwest 0.13.5 与系统 TLS。测试进程使用独立的 Windows 凭据条目，不读取日常 Token。

真实服务验收证据：`artifacts/discogs-1792490784513/results.json` 与 `release-preview.png`。通过真实 Rust HTTP 读取发行 249504，验证预览不写库，再通过界面确认入库、重启后按条码找回并保留来源。使用不会发往 Discogs 的测试值验证 Windows 凭据保存、重启保留和移除。真实认证搜索尚未执行，须在应用内配置个人 Token 后联调。

隔离桌面验收使用 `scripts/verify-discogs-import.mjs`：本地 HTTP 测试服务提供明确的人工发行样本，真实运行 Rust 适配器、IPC、表单和 SQLite。验证条码／品番参数与认证头、分页返回、版本选择、CD+CD+BD、未知载体手选、两套独立购买、不同版本、人工修订保留、全部标识符检索、想购入链接及备份恢复。仅 debug 且同时设置 `DISCATELIER_TEST_DATA_DIR` 时才识别 `DISCATELIER_TEST_DISCOGS_PORT`，地址固定为 127.0.0.1；发行构建不包含该入口。不得将人工样本验收描述为真实认证搜索。

最新隔离验收记录：`artifacts/discogs-import-1792491519089/results.json`，包含 11 组检查与实际 HTTP 路径／参数（无 Token 内容），截图 `versions.png`、`purchase.png`、`collection.png`；另验证最小窗口 200% 缩放下的导入表单。搜索结果与发行预览分别计时，打开版本不延长保留结果的有效期；只有一页时隐藏翻页控件。

Rust 当前通过 18 项存储测试及 6 项数据源测试；包括 schema 2 升级前备份、恢复旧库后再次导入、损坏来源拒绝、同版并发与版本冲突、非法载体及封面回滚。

搜索布局及入口增量验收：`scripts/verify-discogs-search-layout.mjs`，结果位于 `artifacts/discogs-search-layout-1792492753670/results.json`。测试使用人工搜索结果和拦截返回的本地图标，验证图片展示及失败回退，不宣称是真实在线封面验收；搜索前后、20 条与 1 条翻页保持面板高度，最小窗口 200% 仍可查看结果并翻页。新“添加”入口的完整入库回归记录为 `artifacts/discogs-import-1792492765170/results.json`。

自动封面增量验收：`artifacts/discogs-1792493659698/results.json` 已通过真实发行 249504 主图的下载、入库及重启显示；资产 SHA-256 为 `57444df42e6abbf9f842f0c09398a9b6e9af3622b9d165f63c0b75c116503731`。`artifacts/discogs-import-1792493598421/results.json` 为 14 组隔离人工样本检查，包含主图优先、图片请求无 Token、503／损坏图片拒绝后重试、同版保留、缺图默认、封面备份恢复。设置归类、弹窗焦点和搜索状态保留见 `artifacts/discogs-search-layout-1792493632830/results.json`；新设置入口的键盘备份恢复和 10 组缩放见 `artifacts/recovery-access-1792493669357/results.json`。前端／原生构建与 Clippy 通过，非桌面 crate 共 25 项测试通过；真实认证搜索仍未执行。

## 来源与本地编辑

在线资料和用户确认的本地收藏记录分开。预览及待确认快照六小时有效，不把整个响应、Marketplace 或用户资料写入数据库。按照用户的自动封面要求，确认时保存当前收藏所需的封面图片、书目信息、全部标识符、来源 ID 和获取时间；之后的本地修改属于收藏资料，重新查询或再次收藏不覆盖它。现阶段没有自动刷新本地版本，也没有来源差异合并按钮。最新 Discogs 资料通过重新搜索／发行 ID 读取。

该实现按个人收藏存档需要保存所确认的 CC0 书目字段，不把本地档案宣称为最新 Discogs API 结果。面向公开网站同步或分发的来源资料刷新与授权边界仍需单独落实，不自动向网站或 AI 服务发送来源数据。

## 后续工作

1. 在应用内配置个人 Token，验证真实条码／品番／关键词检索与分页。
2. 实现来源更新差异预览、明确选择字段的合并，以及持久化的来源覆盖层。
3. 完成真实多盘／混合载体映射样本，未知格式交由用户选择；补充复杂曲目结构、版本比较、批量扫描。
4. 后续来源更新需区分自动导入与用户替换封面，避免刷新覆盖；曲目建立独立内容模型。公开导出、网站同步的图片来源及授权边界另行处理。

## 来源声明

本应用使用 Discogs API，与 Discogs 无隶属、赞助或背书关系。Discogs 是 Zink Media, LLC 的商标。

“This application uses Discogs’ API but is not affiliated with, sponsored or endorsed by Discogs. ‘Discogs’ is a trademark of Zink Media, LLC.”

来源数据的展示与使用依据 [Discogs API Terms of Use](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use)，2026-10-20 重新读取原文核对，页面标注最近更新为 2025-05-27。载体名称与包装规则依据 [Format 指南](https://support.discogs.com/hc/en-us/articles/360005006654-Database-Guidelines-6-Format)及 [Artist 指南中的视频载体列表](https://support.discogs.com/hc/en-us/articles/360005054753-Database-Guidelines-2-Artist)。
