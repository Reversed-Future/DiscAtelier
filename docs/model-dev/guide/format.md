---
title: V2 格式参考
description: 包头、场景、状态、轨道与导出接口。
---

# V2 格式参考

<p class="lead">.ateliermodel 是 UTF-8 JSON 数据文件，不是 ZIP，也不是执行脚本。</p>

## 顶层字段 {#header}

<table><thead><tr><th>字段</th><th>要求</th></tr></thead><tbody><tr><td><code>format</code></td><td>精确为 <code>"atelier-interactive-model"</code></td></tr><tr><td><code>version</code></td><td>数字 <code>2</code></td></tr><tr><td><code>id / title / creator</code></td><td>非空字符串；上限分别 100／300／600。标识符大小写保持一致。</td></tr><tr><td><code>cover</code></td><td>内置 PNG／WebP data URI</td></tr><tr><td><code>scene</code></td><td>up、nodes、geometries、materials、textures</td></tr><tr><td><code>initialState</code></td><td>states 中的精确 ID</td></tr><tr><td><code>states / actions</code></td><td>有唯一 id 的数组</td></tr><tr><td><code>navigation</code></td><td>可选；只包含布尔型 preserveOverview／stateReset／followActions</td></tr></tbody></table>

## scene 与节点 {#scene}


`scene.up = "Z"`。其余四张表均为数组，表内 id 唯一，节点、几何、材质和贴图通过 ID 关联。

<table><thead><tr><th>节点字段</th><th>内容</th></tr></thead><tbody><tr><td><code>id / parent</code></td><td>稳定节点 ID；顶层 parent 为 null，否则指向已存在节点；禁止层级循环。</td></tr><tr><td><code>position / quaternion / scale</code></td><td>3／4／3 个有限数值；四元数单位长度，缩放不能为零。</td></tr><tr><td><code>visible / pickable / pickThrough</code></td><td>导出工具写入的可见与选取属性。</td></tr><tr><td><code>castShadow / receiveShadow</code></td><td>阴影属性。</td></tr><tr><td><code>mesh</code></td><td>可选；含 geometry 引用与 materials 引用数组。</td></tr><tr><td><code>weights</code></td><td>可选；形变初始权重。</td></tr></tbody></table>

几何 attributes 必须有 position，可有 normal、uv、uv1、color，itemSize 分别为 3／3／2／2／3。可选 index 为三角形索引；groups 的材质索引不能越界。形变只支持 position／normal，固定顶点数与基础几何一致。


## 状态与动作字段 {#actions}


状态必需 `id, focus, clicks`，可选 `view, inspect, returns, reset`。focus／view／inspect 都是节点 ID 数组。返回与点击的具体写法见 [动作与状态](interaction.html)。


动作必需 `id, from, to, duration` 以及 `tracks` 或 `tracksFrom`。可选 `part, label, view, focus, keepFocus, refitFocus`。轨道包含 `node, property, times, values`，property 仅支持 position／quaternion／scale／weights。


`tracksFrom` 是同 duration 的另一个动作 ID；不能与 tracks 同时存在，引用不可成环。让导出器用 `shareTracks: true` 进行复用，避免手动维护重复轨迹。


## 数值缓冲 {#numbers}


几何数组和轨道 values 可为数字数组，或 `{encoding: "base64", count, data}`。二进制按小端 32 位编码；索引用 Uint32Array，其余用 Float32Array。times 仍是普通数组。使用 `packNumbers` 而不是把 JSON 字符串误当成二进制编码。


## V2 导出接口 {#exporter}


```javascript
makeModelPackage({
  root, id, title, creator, cover,
  initialState, states, actions,
  navigation, shareTracks: true
})
```


来自入门包 `runtime/model-authoring/export-package.js`，不是桌面应用公共 API。root 为 Three 场景容器；返回经结构校验的对象。`downloadModel(model, filename)` 在浏览器生成下载；`serializeScene(root)` 单独导出场景；`packNumbers(numbers, type)` 生成数值缓冲。


## 权威源码 {#source}

<ul><li><a href="https://github.com/Reversed-Future/DiscAtelier/blob/v0.2.3/packages/atelier-model-runtime/index.js">公开适配入口：parseModel、mountModel</a></li><li><a href="https://github.com/Reversed-Future/DiscAtelier/blob/v0.2.3/packages/atelier-model-runtime/shared/model-v2.js">V2 精确校验规则</a></li><li><a href="https://github.com/Reversed-Future/DiscAtelier/blob/v0.2.3/crates/storage-sqlite/src/models/validation.rs">原生存储与图片校验</a></li></ul>

入门包同时含本地源码。摘要无法代替完整校验；尤其 JS 长度按 UTF-16 计数，Rust 文本检查另有字符与空字符约束，应同时通过两层检查。
