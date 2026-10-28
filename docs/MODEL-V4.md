# V4 独立部件交互

DiscAtelier 0.2.3 新增无脚本独立部件控制器。V4 复用 V2 场景、材质、轨迹和整套装配状态图，增加 `controllers`，用于上下分切页等局部组合。V2 与已注册 V3 保持兼容；旧版明确拒绝 V4，避免静默丢失交互。

每项含 `id`、`part`、`enabledIn`、`initialState`、`navigation:{stateReset:true}`、`states`、`actions`。控制器只能操作所属子树，子树不能重叠；不能嵌套或在整套初始收纳状态启用。离开启用状态、收回所属部件或全部收起前，先沿 reset 路径合拢，再移动外部容器。无关部件的操作保留局部阅读位置。

顶层仍限 768 状态、4000 动作；最多 8 个控制器，每个最多 2048 状态、10000 动作；总计最多 8192 状态、24000 动作。文件、图片与场景预算保持。40 张上下独立分切纸的 41×41 组合无需与整套装配状态相乘。

连续翻页保持观察角度、位置、缩放和其他部件可见性。收纳中的可见封面／页边仍需绑定整本书的取出动作，不能只定义独立翻页而遗漏实际点击入口。

实现位于 `packages/atelier-model-runtime/shared/model-v4.js`、`src/discs/interactive/model/independent-controls.js`（运行库内）及 `crates/storage-sqlite/src/models/validation_v4.rs`。测试为 `tests/model-v4.test.mjs` 与 `scripts/verify-independent-model-controls.mjs`；真实模型的图片、操作和用户素材不随源码公开。

公共制作说明、Skill 与下载工具见 [模型开发手册](https://docs.reversed-future.com/disc-atelier/models/v4.html)。
