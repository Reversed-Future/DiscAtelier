---
title: 让 AI 帮你制作
description: 完整 Skill、制作工具与可直接复制的任务提示词。
---

# 让 AI 帮你制作

把素材、尺寸与操作要求交给 AI，让它按真实格式制作、导出和验证。这里同时提供完整 Skill 和普通提示词；只有文字聊天能力的 AI 可以协助规划，但不能据此宣称已生成模型或完成渲染验收。

## 下载与选择 {#download}

- [下载完整 AI Skill](downloads/discatelier-model-author-skill.zip)：包含 `SKILL.md`、参考文档、创建脚本、完整制作工作区及许可证。
- <a href="ai/discatelier-model-author/SKILL.md" target="_blank" rel="noopener">查看 Skill 正文</a>：先了解它会做什么。
- <a href="downloads/AI-PROMPTS.md" download>下载通用提示词</a>：适合粘贴给不支持 Skill 的 AI。
- [单独下载制作入门包](downloads/discatelier-model-starter.zip)：手动制作或给已有工具的 AI 使用。

Skill 名称为 **`discatelier-model-author`**，适用于 DiscAtelier 0.3.1 的模型制作、修正和检查。

## 在支持 Skill 的客户端使用 {#use-skill}

解压完整 ZIP，将其中的 `discatelier-model-author` 文件夹交给客户端的 Skill 安装入口，或放入该客户端实际配置的 skills 目录。保留 `scripts`、`references` 与 `assets`；只复制 SKILL.md 无法获得随附的导出环境。不同客户端的安装入口不同，以实际设置为准。

在 Codex 中可显式调用 `$discatelier-model-author`，然后附上素材和任务要求。其他客户端请使用其实际支持的技能调用方式；也可让 AI 直接读取 Skill 文件及所引用的资料。

::: tip 原图与目标版本要一起提供
素材至少说明正反面、尺寸单位、包装结构及期望动作。没有尺寸时写“未知”，指定哪些部位允许估计。提供实际软件版本，避免 AI 把 V3 当成任意新模型都能用的通用升级格式。
:::

## 如何填写任务 {#prepare}

1. 把下面方括号中的内容替换成真实信息，不保留示例路径。
2. 附照片、已有制作源或最终包；无法读取的附件应让 AI 明确说明。
3. 指定新输出目录与允许的测试环境。用户自己的收藏不默认作为测试库。
4. AI 有足够资料后应继续制作；缺关键结构时具体提问，不重复征求已经给过的授权。

{{PROMPTS}}

## 看 AI 的交付是否合格 {#review}

应拿到实际 `.ateliermodel`、制作源、可运行预览、最终哈希和检查记录。报告要分清文件校验、真实渲染、桌面上传保存重开与实物认可。只给效果截图、说“JSON 没问题”、或把版本号改为 V3，都不足以证明可导入。

收到模型后，按[验证与导入](validation.html)检查导出文件与实际操作。有问题时将具体步骤、截图或报错交给 AI，使用上面的“修正已有模型”提示词继续调整。

本次 Skill 已包含完整曲边校正、白边保留、分切页、真实表面点击、最终包哈希与交付副本核验。V4 使用独立控制器，旧版不会自动获得支持；请同时阅读 [V4 独立控制器](v4.html)。
