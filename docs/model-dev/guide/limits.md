---
title: 限额与兼容性
description: 图片、几何、状态图和动画预算。
---

# 限额与兼容性

<p class="lead">限额是拒绝超限数据的边界，不是建议把每项都用满。</p>

## 文件与图片 {#images}

<table><thead><tr><th>项目</th><th>当前边界</th></tr></thead><tbody><tr><td>完整 UTF-8 JSON</td><td>≤ 50 × 1024² 字节（50 MiB）</td></tr><tr><td>每个图片 data URI</td><td>≤ 16 × 1024² 字符，包含前缀和 Base64</td></tr><tr><td>实际图片宽／高</td><td>各 ≤ 8192</td></tr><tr><td>原生单次图片解码分配</td><td>128 MiB 预算</td></tr><tr><td>封面与图片合计</td><td>≤ 192 × 1024² 像素</td></tr><tr><td>格式</td><td>内置 PNG／WebP，真实解码必须通过</td></tr></tbody></table>

V2/V4 按 cover 加 scene.textures 每项计数；V3 按 cover 加 images 计数，贴图别名不重复计数。入门包的 Pillow 预检还按 RGBA 做保守估算；它不是原生分配器的逐字节模拟。


## V2 场景与动画 {#v2}

<table><thead><tr><th>项目</th><th>上限</th></tr></thead><tbody><tr><td>节点／几何</td><td>各 3000</td></tr><tr><td>材质／贴图</td><td>500／300</td></tr><tr><td>基础顶点总数</td><td>1,500,000</td></tr><tr><td>状态／动作</td><td>768／4000</td></tr><tr><td>每几何、每类形变目标</td><td>256</td></tr><tr><td>每动作轨道数</td><td>9000</td></tr><tr><td>每轨道时间采样</td><td>2～10000；从 0 到 duration</td></tr><tr><td>动作 duration</td><td>1～120000 毫秒</td></tr><tr><td>累计动画数值</td><td>6,000,000（不是帧数）</td></tr><tr><td>每状态 returns／每条返回路径 steps</td><td>100／32</td></tr></tbody></table>

## 优化顺序 {#optimize}

<ol><li>去掉没有使用的节点、重复图片与无意义的采样；保留制作源与原图。</li><li>复用材质、几何和完全一致的轨道；注意预算按校验器实际遍历方式计算，复用不一定降低所有计数。</li><li>对完整画幅尝试 WebP 压缩，逐页比较小字和边缘。</li><li>降低不可见细节的几何密度，不破坏轮廓、铰链与可见厚度。</li><li>仍无法符合预算时明确说明取舍，不关闭校验、不截掉重要内容。</li></ol>

## 兼容边界 {#compatibility}


DiscAtelier 0.3.1 支持 V2、已注册结构的 V3 和独立控制器 V4，不支持 V1。GLB／OBJ／FBX 可[直接导入](source-models.md)，资源和渲染限制见该页；不会自动生成拆装交互。模型包只包含数据与内置资源；导入前请确认所用软件版本支持对应的格式和结构。

## V4 状态预算

控制器最多 8 个，每个最多 2048 状态、10000 动作；与整套装配合计最多 8192 状态、24000 动作。场景及整套装配沿用 V2 限额。详情见 [V4 独立控制器](v4.md)，运行实际校验器核对引用、归属和收回路径。
