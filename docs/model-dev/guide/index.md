---
title: 模型开发指南
description: 从实物、几何与贴图，到可以取出、翻页与收起的模型。
---

# 模型开发指南

<p class="lead">把手里的实体，做成可以拿起、打开、翻阅，再好好收回的模型。</p>

这份手册面向 DiscAtelier 模型作者。你会从一个能运行的教学盒开始，理解场景、贴图与状态图，再把自己的包装制作成可导入的 `.ateliermodel` 文件。

<div class="actions"><a class="primary" href="quickstart.html">制作第一个模型 →</a><a href="format.html">查阅格式</a></div>

## 你将交付什么 {#result}

<div class="cards"><a href="physical.html"><b>01 · 还原实物</b><span>记录尺寸、材质、包装层级和开合关系。</span></a><a href="interaction.html"><b>02 · 赋予动作</b><span>点击拆装，单件查看，沿原路径归位。</span></a><a href="validation.html"><b>03 · 验证导入</b><span>导出完整数据包，在目标应用保存并重开。</span></a></div>

## 模型与应用的分工 {#boundary}


模型包描述外观与交互，不携带可执行插件代码，不负责曲目匹配、歌词、播放或收藏资料。它也不会凭模型标题替你填写发行版本。收藏封面、购入记录与模型分别管理。


收藏架先显示封面；进入详情、取出检视后，应用才加载真实模型。拖动旋转、滚轮缩放、点击部件操作。返回时收纳并释放画布。模型作者负责实物拆装动作，应用负责收藏架取出与返回的界面过渡。


## 选择制作路线 {#choose}

<table><thead><tr><th>需求</th><th>路线</th></tr></thead><tbody><tr><td>新的单碟盒、多碟盒、纸套、书式包装</td><td><strong>优先 V2</strong>：通用几何、材质和数据轨道。</td></tr><tr><td>已有专用装配结构，资源槽与实物完全吻合</td><td><a href="v3.html">V3</a>：仅限当前应用注册的结构。</td></tr><tr><td>只有 OBJ、GLB、FBX</td><td>0.2.4 起支持<a href="source-models.html">直接导入查看</a>；要制作可拆装交互仍需整理资源与动作。</td></tr></tbody></table>

Blender 工程本身不支持直接导入，需先导出支持的格式。

## 适用版本 {#baseline}


本指南适用于 **DiscAtelier 0.2.4**。入门包包含模型制作工具、运行库、教学样例和校验脚本，可从零开始制作自己的实体模型。


首次制作可从[入门教程](quickstart.html)开始，也可以使用 [AI 制作 Skill 与提示词](ai-authoring.html)。已有制作经验时，可直接查阅[格式参考](format.html)和[导入检查](validation.html)。
