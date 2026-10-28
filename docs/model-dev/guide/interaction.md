---
title: 动作与状态
description: 点击取放、单件返回、整体收起和翻页取景。
---

# 动作与状态

<p class="lead">每次点击是一条合法的状态转换，收回也要走明确的路径。</p>

## 状态与动作 {#graph}


教学翻盖盒有三个状态：`closed → opened → separated`，分别代表收纳、开盖和取出件已移出。点击盒盖执行 `open`，点击取出件执行 `take`；反向收起先还原 take，再还原 open。完整可运行定义在入门包 `runtime/model-authoring/examples.js`。


```javascript
// 教学示例中的单条轨道；节点 ID 来自同一示例的 scene。
{
  id: 'take', from: 'opened', to: 'separated', duration: 1200,
  part: 'keepsake', label: '取出纪念物', view: ['keepsake'],
  tracks: [{
    node: 'keepsake', property: 'position',
    times: [0, 400, 800, 1200],
    values: [0,0,0,  0,0,1.6,  2.7,0,1.6,  2.7,0,0]
  }]
}
```


时长与时间戳单位都是**毫秒**。首帧为 0，末帧等于 duration，中间严格递增。position／scale 每帧三个数，quaternion 四个数并归一化，weights 数量与形变目标相同。


## 点击与可达性 {#clicks}


状态必须有 `id, focus, clicks`；clicks 的条目为 `{target, action}`，动作 from 必须等于当前状态。target 引用真实节点，也可为 null。所有状态应通过点击或单件返回路径从 initialState 可达，不能留下只在作者代码里能进入的孤立状态。


## 单件放回与全部收起 {#returns}


```javascript
// separated 状态的一部分；take 是上面的同一动作。
returns: [{
  target: 'keepsake', label: '放回纪念物',
  steps: [{action: 'take', reverse: true}]
}],
reset: {action: 'take', reverse: true}
```


returns 负责一个部件的归位，每一步动作的 part 必须与 target 相同。多步可以先折好书页或海报，再移动回容器；不能顺手带走无关物件。reset 负责整个状态图的收纳路径，开启 `navigation.stateReset` 后，每个非初始状态都要能无环地回到初始状态。


入门包 `partInteraction(model, specs)` 辅助填写 part／label／view 和 returns，并开启 preserveOverview 与 followActions。它不自动推断装配关系；每个动作仍要由作者明确指派给部件。


## 跟随与翻页 {#camera}


普通取放启用 `navigation: {preserveOverview: true, followActions: true, stateReset: true}`。动作填写 part、label 和 view，让镜头关注当前部件，保留周围物件与用户观察方向。


**连续翻页应保持镜头。**进入阅读时一次留足完整跨页；翻页动作设 `keepFocus: true`，不要设 `refitFocus: true`。用户旋转、缩放后连续前后翻页，相机位置、角度、缩放和可见性应保持，不能每一页重新切回全景。


## 正常速度验收 {#continuity}


轨迹首末姿态要与相邻状态连续。对复杂机构录制中间姿态，验证铰链不漂移、物件不穿透；“减少动态”模式适合遍历状态，但无法证明运动中途正确。导出之前把场景恢复到 initialState 对应的收纳姿态。

## 可见表面的点击归属


建立“装配状态 → 可见命中节点 → 预期动作 → 后续状态”的表。检查实际射线命中的网格及最近可点击祖先；可点击子节点会截走父部件的点击，父节点存在动作不代表点击子节点会自动执行它。

例如书尚在纸盒内时，封面页和露出的页边应进入取出整本书的流程；书取出后才由阅读状态处理翻页。根据真实节点表设置这些绑定或当前运行库支持的显式路由，不凭名称前缀猜归属，也不把所有状态的子节点永久转发给父节点。拆装和局部阅读不能同时接管同一点击。

透明薄膜、盒盖、标签和实际开口会影响命中。只有实物及流程允许穿透点击时才用 `pickThrough`；不能为方便操作让封闭包装中的物品直接取出。未配置动作时是否进入查看也要明确，用户要求“点哪里操作哪里”时不能把放大当成拆装成功。


上下独立分切页等组合较多时，参见 [V4 独立控制器](v4.md)。
