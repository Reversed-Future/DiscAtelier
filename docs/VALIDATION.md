# UI 原型验证

日期：2026 年 10 月 20 日。此记录只验证浏览器原型，不代表桌面软件、真实模型、光驱、联网资料或播放器已实现。

## 当前收藏浏览原型

用户选择中心封面与连续翻阅布局，要求整洁、减少按钮和文字，只使用黑白与少量米白。页面名称为 DiscAtelier，所有文字使用 MiSans。当前入口仍为 `/directions/index.html`；此前的双布局说明与八组检查是历史记录。

当前主界面保留五个顶部按钮，移除二级工具栏、状态栏、布局选择器、缩略图条和圆形翻页按钮。界面底色为 `#121212`，文字为白色／米白，封面不改色。详情不再逐条展示未填写资料。

本次浏览器验证通过：相邻唱片选择、搜索展开与 Escape 收起、菜单筛选、整理视图、购入修改与统计、光驱未连接状态、手动添加、方向键翻阅、980 px 布局及减少动态模式。页面脚本异常为零。结果在 `artifacts/minimal-results.json`，1440 × 960 截图在 `artifacts/store-minimal.png`。

本次控件更新执行 `scripts/verify-directions.mjs`：14 项检查通过，脚本异常为零。验证 MiSans 两个字体文件实际加载；搜索、价格和名称输入框聚焦前后边框颜色相同，outline 为 none，box-shadow 为 none。验证自定义下拉的鼠标选择、方向键、Home、Enter、嵌套 Escape、表单重置值同步，以及原有搜索、筛选、购入统计、整理、添加、键盘浏览、980 px 和减少动态行为。结果位于 `artifacts/directions-results.json`；自定义下拉截图位于 `artifacts/custom-controls.png`。原型没有原生可见 select 或浏览器 title 提示；表单禁用原生验证弹层，错误由页面呈现。

## 布局原型

入口：启动预览服务后访问 `/directions/index.html`。支持 `?layout=room` 与 `?layout=store`，页面底部即时切换。

- 收藏室：取消侧栏，以实体架、背脊及正面外观展示，静态阴影，悬停显示作品信息。
- 唱片店：中心唱片、左右连续翻阅、缩略图直达、方向键浏览。
- 公共流程：音乐／影像、搜索、状态筛选、整理表格、详情取出与归位、侧面外观、购买信息编辑、手动添加。

详情使用 CSS 盒体和现有模型包封面，不是完整 `.ateliermodel` 三维拆装。初始数据中的状态仅为展示设定，没有导入真实购入记录；价格和日期保持未填写。数据只存内存，刷新复原。

## 已执行检查

使用现有 AtelierPublisher 的 Playwright 1.63.0 与其测试文件记录的 Chromium 可执行路径，未添加运行依赖。

```powershell
node scripts/verify-directions.mjs 'E:\ToolsForMyself\AtelierPublisher\node_modules\@playwright\test\index.mjs' 'C:\Users\junya\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe'
```

八组检查通过，页面脚本异常数为零：

1. 收藏室的八个封面／背脊均可显示。
2. 取出、侧面查看、修改购入价格、返回及金额更新。
3. 纯背脊排列与独立整理表格。
4. 影像空状态、手动添加与零价记录。
5. 唱片店上下一张、缩略图直达和键盘左右切换。
6. 搜索、想购入状态变更、过滤与 Escape 返回。
7. 两种布局在 980 × 800 下无页面横向溢出。
8. 减少动态模式，以及光驱未连接状态的准确呈现。

1440 × 960 截图已人工检查。收藏室层板、接触阴影和物体落点已修正；外观信息不会遮挡主体。截图及机器结果保存在本地 `artifacts/`，不属于正式发布产物。

未验收：真实 WebGL 模型、逐帧性能基准、全部屏幕尺寸、屏幕阅读器、真实触屏拖动、Tauri 原生窗口和任何外部 API。
