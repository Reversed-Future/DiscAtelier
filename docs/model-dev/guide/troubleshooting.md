---
title: 排错与交付清单
description: 从错误信息定位制作源，留下可复现的交付记录。
---

# 排错与交付清单

<p class="lead">保留原始错误，修复制作源，再重新导出。</p>

## 按错误定位 {#errors}

<table><thead><tr><th>现象／错误</th><th>检查位置</th></tr></thead><tbody><tr><td>浏览器直接打开实验室没反应</td><td>ES 模块预览需要 HTTP；运行 serve.py，打开终端打印的地址。VitePress 文档也应通过本机或静态站点 HTTP 服务访问。</td></tr><tr><td>模型包超过 50 MiB</td><td>检查最终 UTF-8 字节数、图片重复与轨道复用；不是只看源图片大小。</td></tr><tr><td>缺少内置 PNG/WebP 封面</td><td>检查 cover 和导出时图像是否加载完毕，不使用 JPG 或外链。</td></tr><tr><td>不支持的装配结构版本</td><td>核对 V3 的 profile、rig、runtimeVersion 和目标软件，不改名冒用已注册结构。</td></tr><tr><td>点击动作引用无效</td><td>target 是否真实存在、action.from 是否为当前状态、同状态是否重复 target。</td></tr><tr><td>存在无法通过点击到达的状态</td><td>从 initialState 沿 clicks 与 returns 检查可达性；不要靠作者页面的额外按钮进入状态。</td></tr><tr><td>收起流程无法返回初始状态</td><td>每个非初始状态的 reset 应合法、无环且最终返回初态。</td></tr><tr><td>动画时间轴无效</td><td>毫秒单位、首帧 0、末帧 duration、严格递增、values 数量匹配。</td></tr><tr><td>部件不能点击／点到后面的物件</td><td>userData.item、状态 clicks、透明层的 pickThrough 与真实几何遮挡。</td></tr><tr><td>翻页时镜头跳动</td><td>keepFocus、refitFocus、进入阅读的取景与连续翻页是否混在一起。</td></tr><tr><td>制作源正常，导出包缺效果</td><td>是否使用未支持的材质、shader、骨骼、换父级或未嵌入图片。</td></tr></tbody></table>

## 报告问题时提供 {#report}


软件版本、模型格式、完整错误、最终包 SHA-256、最短操作步骤，以及出错前后的截图。缺少结构依据时先检查实际文件和日志，不猜测 ID、资源槽或 JSON 字段。不要把账户凭据、收藏数据库和购入记录打进模型问题包。


## 交付目录 {#delivery}

<ul><li>最终 <code>.ateliermodel</code> 与 SHA-256。</li><li>制作源、处理后贴图、原图到贴图的映射和比例约定。</li><li>可独立启动的本机预览及相应许可证。</li><li>操作说明：打开、取出、翻页、单件放回与全部收起。</li><li>验收记录：实际检查、未检查项、已同意的估计、已知限制。</li></ul>

保留原照片与旧修订。开发手册和通用制作工具可以共享；实际封面、歌词页、照片及其他素材应按你拥有的授权处理。


## 应用升级后如何检查模型 {#maintenance}


核对指南与制作工具支持的软件版本，保留原模型和制作源。使用匹配版本的工具重新检查文件，并在应用中确认取出、翻页、收回和保存重开均正常。
