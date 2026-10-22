# 数据结构与扩展架构

## 分层与依赖

前端只调用应用用例；应用用例依赖领域与端口；适配器实现端口；Tauri 负责组装和受控 IPC。领域层不引用 Tauri、SQL、HTTP、Discogs、播放器或 UI。

```text
React UI → Tauri commands → application → domain
                                ↓ ports
                    storage / providers / devices / player / models / ai
```

目标目录如下。当前已经实现 `apps/desktop` 与 `domain`、`application`、`contracts`、`storage-sqlite`、`provider-discogs` 五个 crate；其他适配器为后续规划。Discogs 当前提供在线搜索、发行预览与用户确认后的本地版本入库：

```text
apps/desktop/                  React、路由和功能视图
apps/desktop/src-tauri/        Tauri 配置、命令边界、依赖组装
crates/domain/                实体、值类型、领域规则
crates/application/           用例、事务边界、权限检查
crates/contracts/             DTO、事件、错误、能力版本
crates/storage-sqlite/        表、迁移、仓储、备份
crates/provider-discogs/      Discogs 映射与缓存策略
crates/provider-netease/      已确认自有 API 契约适配
crates/optical-windows/       设备事件和介质探测
crates/disc-identification/   指纹和人工绑定
crates/player-vlc/            第一个验证中的播放后端
crates/agent-runtime/         工具、策略、会话和评估
packages/model-runtime/      从现有模型运行库整理的独立包
packages/category-contracts/ 品类描述与 UI 扩展契约
```

先使用模块化单体与编译期注册，避免一开始承担任意原生动态插件的 ABI 和崩溃风险。外部扩展采用版本化 JSON-RPC 子进程，超时、取消、权限、资源限额和心跳都由宿主管理。子进程本身不是安全沙箱；未加入 OS 隔离前只运行可信插件。WASM 可用于纯映射等受限任务，不强迫所有播放器和光驱逻辑进入 WASM。

前端扩展首版随应用打包并静态注册；第三方运行时 UI 必须另设沙箱边界，不能把任意插件 JavaScript 注入主 WebView。

## 领域模型

以下是本项目设计定义，后续迁移文件以此审查，不代表外部服务的字段。

| 实体 | 关键字段及约束 |
| --- | --- |
| Work | id、categoryId、title、creators；作品聚合，不承担购买信息 |
| Edition | id、workId、title、editionLabel、releaseDate、country、packaging；发行资料 |
| EditionIdentifier | editionId、namespace、value、sourceId；精确保存原值与来源，不转大小写 |
| Medium | id、editionId、position、carrierId、label；一版多载体 |
| ContentUnit | id、mediumId、parentId、position、title、durationMs；曲目或视频内容树 |
| Copy | id、editionId、status、addedAt、acquiredAt、receivedAt、condition、storageLocation、revision |
| CopyMedium | id、copyId、mediumId、present、note；实物缺盘和替换记录 |
| Purchase | id、copyId、orderId、paidAt、amountMinor、currency、seller、purchaseUrl |
| PurchaseAdjustment | purchaseId、kind、amountMinor、currency；税费、邮费、折扣与退款 |
| Tag / CopyTag | 自定义标签及多对多关联；不替代系统状态机 |
| SourceLink | entityType、entityId、providerId、externalId、sourceUrl、fetchedAt |
| FieldOverride | entityId、fieldPath、value、updatedAt；只接受版本化契约内的精确路径 |
| Asset | id、sha256、mediaType、byteLength、relativePath、source；资产不可变去重 |
| Presentation | copyId 或 editionId、modelAssetId、coverAssetId、spineAssetId、displayPose、dimensions |
| DiscFingerprint | id、scheme、version、digest、evidence；方案与版本一起保存 |
| DiscBinding | fingerprintId、copyMediumId、confirmedAt；允许多个副本并提示区分 |
| VideoAssignment | fingerprintId、titleKey、contentUnitId、role、evidenceVersion |
| PlaybackSession | id、copyMediumId、contentUnitId、sourceKind、startedAt、endedAt、endReason |
| PlaybackCheckpoint | sessionId、positionMs、playedMs、backendStateVersion |
| AgentRun / ToolExecution | 运行、检查点、幂等键、授权范围、输入摘要与执行状态 |

外部 ID 与内部主键分离。不要把 Discogs release ID 当整库主键，也不要把光驱盘符作为盘片 ID。条码和品番可以一版多值、跨版本重复，均不设全局唯一约束。

分类、载体和可播放能力用注册表组合，不用一个只有 cd / bluray 的固定枚举覆盖一切。系统状态固定管理迁移；自定义业务标签独立扩展。日期精度区分年、月、日，未知不自动补成 1 月 1 日。

## 核心端口

| 端口 | 用例 | 边界 |
| --- | --- | --- |
| MetadataProvider | 当前 search、release；曲目包含于发行响应 | 只读资料，分页、来源和精确版本 |
| CategoryModule | schema、editor、filters、presentation | 扩展品类字段，不替换数据库访问层 |
| ArtworkProvider | fetchArtwork | 图片许可、缓存和大小检查 |
| MusicContentProvider | searchTracks、getMetadata、resolvePlayback | 数字内容与实体发行分离 |
| OpticalDeviceProvider | enumerate、watch、inspect、eject | 设备权限，不直接写库 |
| DiscIdentifier | fingerprint、resolveBindings | 返回证据和多个匹配，不猜版本 |
| DiscStructureReader | listTitles、listStreams、listChapters | 各盘种实现，原始标识带后端版本 |
| PlaybackBackend | capabilities、open、play、pause、seek、stop、events | UI 不依赖具体播放器句柄 |

蓝光播放的默认解密适配器是随包 libaacs/libbdplus，MPV 的 libbluray 直接读取 `bd://` 播放列表；KEYDB.cfg 位于 libaacs 标准 `%APPDATA%\aacs` 目录。只有明确分类为 AACS／BD+／密钥能力不足且用户开启兜底时，播放工作线程才在终止前一 MPV Job 后，用 `libmmbd64.dll` 作为兼容 AES/BD+ 提供者重启会话；读盘错误、停止、区域和 BD-J 不进入兜底。AACS/BD+/BD-J 只报告结构检测，区域保持未确认。
| ModelRenderer | validate、preview、mount、dispose | 数据包受检，不执行包内代码 |
| PriceProvider | inspectUrl | 未来扩展，不接受任意网络代理任务 |
| AssistantModelProvider | streamTurn、cancel | 厂商协议在适配器内处理 |
| UpdateProvider | check、download、verify、install | 签名不可选，下载和安装分开 |

外部插件的目标接口请求包含 schemaVersion、requestId、截止时间与取消语义；写用例包含幂等键及实体预期 revision。当前随应用发布的本地 IPC 和 MetadataProvider 尚未实现完整的外部插件协议协商及取消契约，精确字段见开发记录。返回统一的成功数据或错误，禁止用空数组伪装认证失效。

每个插件声明稳定 id、协议版本、所需宿主版本、提供能力、域名／文件／设备权限。启用时校验兼容范围。插件只能获得宿主授予的资源句柄；不得直接打开数据库。可信内置适配器也走相同契约，便于替换。

## 事件和一致性

事务提交后才发布领域事件，事件包含 eventId、实体 ID、revision、occurredAt、payloadVersion。关键异步副作用使用事务 outbox；消费者按 eventId 去重。前端收到新版本后重取资料，不能用到达顺序覆盖较新的状态。

设备事件是瞬态输入，库事件是持久事实。拔盘时取消当前识别、停止或报告播放结束，但不删除收藏。插入新盘时旧请求结果必须凭设备会话 ID 被拒绝，避免误绑定上一张盘。

同一指纹可对应多个同版副本；无法区分时询问选择，或记录版级播放再由用户关联副本。不得将一次扫描的结果静默绑定全部副本。

## 数据持久化与迁移

当前实现采用有界封面 BLOB 资产：PNG／JPEG／WebP 最多 15 MiB，以 SHA-256 去重，和发行引用在同一 SQLite 事务中提交；数据库在线备份因此包含封面。移除封面只解除引用，不回收原资产。删除收藏按副本 revision 在事务内执行：同版本仍有其他副本时只删除该副本及购入记录；最后一套时清理版本级资料、来源和不再被引用的封面／模型资产，保留播放历史。schema 2 增加封面，schema 3 增加来源及多标识符，schema 14 重建封面资产表，把表级上限从 8 MiB 同步为 15 MiB；升级前保存一致性备份，再事务迁移。恢复先校验隔离快照，确认后备份当前库，再整体恢复。以下文件资产、FTS、导入导出等仍是目标架构，尚未全部落地；大型模型资产未来使用独立文件适配器。

当前来源导入分为 provider 映射、受时限约束的内存预检、应用校验和 SQLite 事务；网络适配器不直接写库。`edition_sources` 以 provider_id + external_id 唯一关联本地发行，`imported_identifiers` 保存用户确认导入时的全部标识符及厂牌品番。前端只能提交预检 token 与本地编辑数据，不能构造可信来源载荷。同版新增副本校验发行 revision，不覆盖人工修订；首次导入的并发冲突要求重新选择。

SQLite 开启外键；写入在应用层显式事务内完成；FTS5 保存标题、作者和人工文本索引，精确标识检索走普通索引。整数金额、日期精度、状态迁移和来源约束在领域层与数据库层同时验证。

迁移按递增版本执行并记录 checksum。升级先检查磁盘空间并创建一致性备份；失败回滚事务并保留诊断。资产复制先临时写、校验哈希、原子提交，再提交引用；失败资产作为待清理记录，不能在失败路径递归删整个目录。

数据导出包含结构化 JSON 或 CSV 与资产清单；CSV 不是完整备份，不能保存全部关系和模型。导入先预检与预览冲突，提交后可撤销导入批次。含外部来源数据的导出需遵循对应来源许可。

## Agent harness 执行协议

工具只暴露高层能力，例如 searchLibrary、getCopy、searchEditions、prepareCopyChange、commitCopyChange、resolvePlayback。以上是项目拟定工具名；未来真实 schema 在工具注册时生成，不从提示词自由解析参数。

一次运行：接收用户意图 → 建立授权范围与预算 → 装配最小上下文 → 模型请求工具 → 校验 schema 和策略 → 执行用例 → 持久化结果 → 回给模型 → 继续或结束。模型不拥有权限裁决权。

读操作可并行；依赖写操作按事务顺序。工具超时、网络重试、模型超时分别处理。用户取消后不再发起新写操作；已提交操作保留结果和撤销路径，不能假称回滚。

检查点包括消息摘要、已完成工具调用、授权范围和待执行步骤。恢复必须重新校验数据 revision 和授权有效期。长会话摘要不得丢掉用户限制，也不得将网页中的恶意要求提升为系统指令。

评估集包括自然语言检索正确率、相同标题版本选择、重复调用不重复写、过期 revision 冲突、提示注入、无权限导出、供应商错误、取消恢复。测试使用隔离库，不能操作真实收藏。
