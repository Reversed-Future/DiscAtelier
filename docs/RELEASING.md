# Windows 发布

当前版本：0.1.4。仓库固定为私有的 `Reversed-Future/DiscAtelier`。0.1.4 起使用 `scripts/release/build-signed.ps1` 构建，安装包与签名、私有更新清单一起发布。完整步骤及签名身份说明见 [应用内更新](UPDATES.md)。下方 0.1.3 记录作为首次发行历史保留。

## 0.1.4 发布记录

- [v0.1.4 Release](https://github.com/Reversed-Future/DiscAtelier/releases/tag/v0.1.4)，Release ID `418765867`，源码提交 `263639fe91b0979e5cc5c47242d7088b3d32d931`。仓库复核为私有。
- 安装包 `DiscAtelier_0.1.4_x64-setup.exe`，15,359,884 字节，SHA-256 `1a5ec8392a1350df0a5a207ad2e55b4cab0977caf4cd231a0d011929a1d5b749`。
- 同时发布安装包 `.sig`、`latest.json`、`release-manifest.json`、`SHA256SUMS.txt`。五项资产完整回读后的大小、SHA-256 与本地一致。
- `verify_local_release_package` 通过；`verify_published_private_release` 使用实际 Rust GitHub 客户端成功下载私有安装资产，Tauri 验证签名和版本通过；损坏副本被拒绝。没有执行安装器。
- 20 项前端测试、60 项 Rust 测试、严格 Clippy、TypeScript／Vite、签名 NSIS 构建通过。两个显式发行验证测试分别运行通过。
- 更新签名已启用；Authenticode 仍为 `NotSigned`。未修改收藏目录或数据库 schema，未访问真实收藏内容或光盘。
- 发布后再次核对资产，已单独删除 `D:\DiscAtelierBuilds\target\release\bundle\nsis\DiscAtelier_0.1.4_x64-setup.exe`。远端核验记录在 `artifacts/release/0.1.4/`。
- 实际窗口、Token 配置交互、覆盖安装／重启以及下一更高版本的端到端更新仍待用户手动验收。

## 0.1.3 构建基线

需要 Windows x64、Rust MSVC、Visual Studio C++ 工具、Node.js 22.19+。使用锁文件安装依赖：

```powershell
npm ci
cargo fetch --locked
npm run release:notices
npm run release:check
npm test
cargo test --workspace --locked
npm run release:build
```

`tauri.release.conf.json` 在普通配置之上启用 NSIS 安装包，按当前用户安装，支持简体中文、繁体中文、英文，缺少 WebView2 时下载引导程序。源码中没有附带播放器和 MakeMKV，也没有个人库或凭据。

发行前端输出到独立的 `apps/desktop/dist-release/0.1.3`，不使用累计旧文件的开发 `dist`。下一次版本变更需同步根目录和桌面 `package.json`、锁文件、Cargo workspace 版本、Tauri 版本、发行输出路径以及设置中的版本文字。若重新构建同一版本且需清理旧产物，不执行批量删除；改用新输出目录或请用户处理。

本次 `CARGO_TARGET_DIR` 为 `D:\DiscAtelierBuilds\target`，安装器由 Tauri 输出到 `release/bundle/nsis/DiscAtelier_0.1.3_x64-setup.exe`。

## 0.1.3 检查

- 20 项前端逻辑测试、53 项 Rust 测试通过。
- TypeScript／Vite 与 NSIS Release 构建通过，生成安装器大小 15,146,907 字节。
- 安装器 SHA-256：`6b3be4c86ee7136c78b58be0e265ddce816233fa3de9aa4135411acb266648ee`。
- Authenticode 状态实测 `NotSigned`；没有配置或宣称 Windows 代码签名。
- 应用内 updater 未接入，没有可用更新签名／更新清单；不生成虚假的 `latest.json`，不关闭签名验证。
- NSIS 生成脚本包含应用及 MiSans／第三方许可文件。未运行安装器、未触碰用户桌面，安装／升级／卸载由用户手动验收。
- 用户卸载时，删除用户数据选项与卸载程序本身分开；保留收藏时不要选择删除用户数据。
- 许可证文本从锁定依赖的本地源码和对应上游提交获取；聚合通知包含对应源码链接。
- 上传前检查 Git 文件列表；排除数据库、模型包、令牌、构建结果和个人原型封面。

## 发布与核验

1. 使用 `gh` 确认目标仓库是私有仓库；推送源码和版本标签。
2. 创建草稿 Release，上传安装包、`SHA256SUMS.txt` 与 `release-manifest.json`。
3. 检查远端资产的名称、大小、摘要，并通过已认证的 GitHub API 回读安装包流、重新计算 SHA-256。
4. 验证成功后公开该私有仓库中的 Release；只有有仓库权限的用户能访问。
5. 再次确认已发布且资产完整，只用一个明确绝对路径删除本次本地安装包。没有发布成功则保留安装包，不做批量清理。

## 已发布记录

- [v0.1.3](https://github.com/Reversed-Future/DiscAtelier/releases/tag/v0.1.3) 已发布，仓库隐私状态复核为 `PRIVATE`。
- 源码标签对应提交 `ed07991450740e5779f1b3b1e885baf53f02a8fd`；Release ID 为 `418741582`。
- 安装包、`SHA256SUMS.txt`、`release-manifest.json` 均已通过 GitHub API 回读完整字节，大小与 SHA-256 与本地逐项一致。发布后再次核对远端三项资产与摘要。
- 本次本地安装包 `D:\DiscAtelierBuilds\target\release\bundle\nsis\DiscAtelier_0.1.3_x64-setup.exe` 已在核验成功后单独删除，并确认路径不存在。
- 本地核验记录保留在 `artifacts/release/remote-verification.json` 和 `artifacts/release/published-release.json`；源码、开发版与构建日志保留。

`release-manifest.json` 是发行溯源记录，不是 Tauri 自动更新清单。安装及实盘手动验收仍未完成。
