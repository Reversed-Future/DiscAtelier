# 自定义资料编辑器布局修复

2026-10-26，开发预览，未发行。

Credits 曲目选择改为独立的 `TrackMultiSelect`：收起时显示一行摘要，展开为可多选下拉；全部曲目与单独选择互斥。弹层使用原生 Popover 顶层，避免被表格或编辑区域裁切，支持方向键、Esc、外部点击和窗口缩放。滚动时更新位置，避免打开瞬间被延迟滚动事件关闭。选择与保存仍沿用原 `tracks` 字段。

新增 `ContentEditorTable`，集中声明曲目、Credits、公司、资料条目、图片、人物、章节七种表格的列宽。固定布局、独立操作列及输入框允许收缩，使空行和新增行使用同样的列位置；窄窗口按表格区域水平滚动。空行与普通行使用相同内边距，并取消合并边框，虚线占位框保留完整四边。没有改动收藏保存逻辑。

## 验证

独立本地测试页直接加载实际 `ContentEditor` 和样式，使用合成资料与模拟存储接口，不连接个人收藏或外部服务。

- 1200px / 800px 两种窗口宽度，七种表格共 14 次添加前后列坐标与宽度比较，全部一致。
- 检查空行虚线上边框为 1px dashed，并与单元格上边缘保留间距；截图核对公司占位框四边完整。
- 曲目选项默认折叠；展开后可多选、切换全部曲目；下拉在视口内；Esc 关闭下拉后编辑窗口仍保留。
- TypeScript / Vite 构建通过。Playwright 页面没有运行时错误。

本地测量结果：`artifacts/editor-layout-verification.json`。截图：`artifacts/editor-company-empty.png`、`artifacts/editor-company-added.png`、`artifacts/editor-track-dropdown.png`。

## 预览

Release 预览已构建，沿用 `target/release/DiscAtelier-menu-recognition-preview.exe`，包含此前菜单识别和 BD 分盘修复。大小 80,538,112 bytes，SHA-256 `55DC1FF9BFD5704843A04547E545F647EA11A3590BDB8710EBF7DA99F3039F6C`。5,603 个运行资源校验通过，用户此前设置的 Medium 标签保留；已安装正式程序哈希仍为 `962EACC21EE8A54D56AC32926109B7F737C42F8E936F1E0F4E3B191E60ED4E2E`。本轮没有启动桌面程序或操作个人收藏；可打开该预览在编辑版本 → 资料页复测。
