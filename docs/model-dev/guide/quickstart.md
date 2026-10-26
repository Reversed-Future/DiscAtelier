---
title: 制作第一个模型
description: 下载入门包，运行教学模型，导出并验证。
---

# 制作第一个模型

<p class="lead">先完整跑通一次：制作源 → 模型包 → 重新载入 → 校验。</p>

## 1. 准备环境 {#environment}


需要 Python 3、本机浏览器（支持 WebGL），以及用于结构预检的 Node.js 22 或更高版本。图片解码检查另需 Pillow。制作预览与导出不需要安装 npm 依赖，也不需要联网。


<a class="primary" href="downloads/discatelier-model-starter.zip" download>下载模型制作入门包 ↓</a>


解压到新目录，保留完整目录结构。包中是原创形状组成的通用教学盒，不含唱片照片或用户收藏。网页实验室也可直接 [打开教学模型](playground/index.html)；通过本机 HTTP 访问手册时可用。


## 2. 启动本机预览 {#start}


在解压目录打开终端：


```text
python serve.py
```


打开终端打印的 `http://127.0.0.1:端口/index.html`。端口由系统分配，不要写死。点击“构建制作源”，再点击盒盖、盒内取出件，测试“放回”和“全部收起”。Windows 也可以双击包中的“打开预览.cmd”。


## 3. 从制作入口开始 {#source}


`author.mjs` 是你自己的入口，`buildModel()` 返回模型数据。初始内容：


```javascript
import {buildExample} from './runtime/model-authoring/examples.js';
export async function buildModel() {
  return buildExample('hinge');
}
```


把 `'hinge'` 改为 `'drawer'` 可查看第二个教学结构。保存后重新点击“构建制作源”。浏览器会重新读取入口；修改其依赖模块后应刷新页面，避免复用旧模块。


实际制作时，将测量、几何、材料、动作分别写成模块，由入口组装；不需要把一切堆进 `author.mjs`。[下一步：建立自己的场景](scene.html)。


## 4. 导出并重新打开 {#export}


点击“导出当前包”，保存生成的 `.ateliermodel`。刷新页面，通过“载入模型包”选择刚导出的文件，重新检查全部动作。这一步验证的是交付文件，不只是制作代码。


## 5. 执行文件预检 {#check}


在入门包目录运行；示例文件名对应未改名的翻盖教学盒：


```text
node scripts/validate-package.mjs example-hinge.ateliermodel
python -m pip install Pillow
python scripts/validate-images.py example-hinge.ateliermodel
```


已有 Pillow 时跳过安装行。第一条输出包大小、SHA-256 和结构校验结果；最后一条真正解码图片并核对预算。两者都不会读取收藏库。通过后继续 [应用内导入验收](validation.html)。


## 入门包目录 {#files}


```text
author.mjs                  制作入口
index.html / preview.mjs     浏览器预览与导出
serve.py                    仅绑定本机地址的服务
runtime/                    当前应用运行库
  model-authoring/           V2 导出、示例与动作辅助工具
scripts/                    结构与图片预检
README.md                   环境、使用方法与边界
runtime-manifest.json        当前运行文件的 SHA-256
provenance.json              技能工具来源记录
DISCATELIER-LICENSE.txt      GPL 许可证
runtime/src/discs/interactive/vendor/THREE-LICENSE.txt
```
