# 私有仓库更新

从 0.1.4 起，“设置 → 更新”支持检查、下载、验签和安装 GitHub 私有发行版。0.1.3 没有更新客户端，需手动安装一次 0.1.4；此后通过应用内更新。

## 配置

在 GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens 创建个人令牌，仅选择 `Reversed-Future/DiscAtelier`，仓库权限 `Contents: Read-only`。把令牌填入“设置 → 更新 → 配置”。令牌存入 Windows 凭据管理器 `com.reversedfuture.discatelier` / `github-update-token`，前端不读取已保存的令牌，备份收藏也不包含令牌。过期后在同一位置替换。

此版本按用户点击检查，不在启动、播放时自动安装。下载完后显示“签名已验证”；点击“安装并重启”才开始安装。播放中禁止安装。自动备份失败则不会启动安装器。

## 数据

实际数据目录通过 Tauri 的 `app_local_data_dir()` 获取，界面“设置 → 数据”显示当前路径并提供打开目录按钮。这台电脑的日常目录是：

`C:\Users\junya\AppData\Local\com.reversedfuture.discatelier`

- `library.sqlite3`：收藏、副本、购入记录、封面、模型、播放历史。
- `backups`：SQLite 一致性备份，包含数据库中的封面和模型。
- `playback-settings.json`：播放器路径。
- `EBWebView`：WebView2 运行数据。
- `library.sqlite3-wal`、`library.sqlite3-shm`：运行中的 SQLite 日志和共享内存文件。

优先使用应用内“创建备份”。退出后再整体复制目录；不要在运行中只复制主数据库文件。安装目录与数据目录分开，本版本没有更改应用标识、目录规则或数据库 schema。

## 更新校验

Rust 从固定仓库的 GitHub API 读取最新正式版与 `latest.json`。下载使用 release asset API，处理私有仓库鉴权和重定向；跨域跳转由 reqwest 移除 Authorization。客户端只接受当前发行版中列出的同仓库安装资产，校验版本、大小和签名。拒绝草稿、预发行、重复资产、外部 URL 和缺失签名。

更新使用 Tauri 2.14 的 `restore_update` / `verify` / `install`，强制签名绑定版本，拒绝同版本和降级。下载内容保存在进程内存，下载失败不写收藏库；关闭应用后可重新下载。安装前再次验签，在光驱操作锁和收藏写入锁保护下创建备份，然后启动安装器。此流程不会读写光盘。

Tauri updater 签名已启用；Windows Authenticode 签名仍未配置，两者不等同。

## 发行维护

签名身份保存于当前 Windows 用户的 `%LOCALAPPDATA%\DiscAtelierSigning`，不在项目仓库或安装包内。目录 ACL 仅允许当前用户与 SYSTEM；`updater.key` 由随机密码加密，密码以 Windows DPAPI 保存在 `password.dpapi`。`updater.key.pub` 对应程序内置公钥。

后续必须沿用这份私钥。DPAPI 文件只适合原 Windows 身份恢复，不能作为跨机器恢复方案；跨机器密码备份／恢复演练尚未完成。不要生成替代密钥覆盖已有文件。

构建：

```powershell
$env:CARGO_TARGET_DIR = 'D:\DiscAtelierBuilds\target'
.\scripts\release\build-signed.ps1
```

先上传安装包和 `.sig` 到草稿 Release，再用实际 asset API URL 生成 `latest.json`，格式如下（字段由客户端协议定义）：

```json
{
  "version": "发行版本，不含 v",
  "notes": "简短更新说明",
  "platforms": {
    "windows-x86_64": {
      "url": "本次安装包的 GitHub release asset API URL",
      "signature": "完整 .sig 文件内容"
    }
  }
}
```

将草稿的 API JSON 响应保存为本地文件后，运行 `node scripts/release/prepare-update.mjs <响应文件> <安装包完整路径>`。脚本验证本地安装包与已上传资产的大小和摘要，输出 `latest.json`、发行溯源记录和 SHA-256 清单到 `artifacts/release/<版本>/`。

上传清单和 SHA-256 文件，回读全部资产；发布后运行显式的只读验证：

```powershell
cargo test -p discatelier-desktop verify_published_private_release -- --ignored --nocapture
```

该测试只在显式调用时使用已登录的 GitHub CLI 凭据，从真实私有 API 下载并验签，不存入应用凭据管理器，不运行安装器、不访问用户数据库。正常单元测试使用 Tauri MockRuntime，不创建原生窗口。

## 手动验收

1. 关闭旧版，手动安装 0.1.4；打开收藏，核对数量、封面、模型和购买信息。
2. “设置 → 数据”核对路径，创建备份；检查四个设置分类切换时外框保持固定。
3. “设置 → 更新”配置只读 Token，检查更新；同版本应显示“已是最新版本”。
4. 下次更高正式版发布后，检查、下载、安装并重启；核对收藏和备份。播放中“安装并重启”应禁用。
5. 检查菜单筛选、整理、光驱和设置入口，以及弹出／收起与设置页切换动效。

本轮不代用户执行安装／重启或窗口操作；跨版本真实安装验收待上述步骤完成。

参考：[Tauri 更新机制](https://v2.tauri.app/plugin/updater/)、[GitHub Release API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)、[私有资产下载权限](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)。
