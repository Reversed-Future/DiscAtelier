---
title: 材质与贴图
description: 纸张、透明盒、光碟与内置图片。
---

# 材质与贴图

<p class="lead">印刷内容属于贴图；随角度变化的光泽属于材质。</p>

## 材质类型与参数 {#types}


V2 支持 `standard`、`physical`、`basic`。常规纸张使用标准 PBR；透明盒可用物理材质的透射与厚度。不要把提高透明度当成真实玻璃或塑料体积效果。

<table><thead><tr><th>字段组</th><th>精确白名单</th></tr></thead><tbody><tr><td>数值</td><td><code>roughness, metalness, opacity, transmission, thickness, ior, clearcoat, clearcoatRoughness, envMapIntensity, bumpScale, iridescence, iridescenceIOR, alphaTest, side</code></td></tr><tr><td>二维向量</td><td><code>normalScale</code></td></tr><tr><td>RGB 三分量</td><td><code>color, emissive, attenuationColor</code></td></tr><tr><td>布尔值</td><td><code>transparent, depthWrite, depthTest, flatShading</code></td></tr><tr><td>贴图引用</td><td><code>map, normalMap, bumpMap, roughnessMap, metalnessMap, alphaMap, emissiveMap</code></td></tr></tbody></table>

包内材质 `values` 与 `maps` 只接收上述已支持字段。可用的内置 `effect` 仅有 `radial-diffraction`；不要给自定义 `onBeforeCompile` 改个名字就宣称兼容。


## 图片必须内置 {#embedding}


封面与贴图使用 PNG 或 WebP 的 Base64 data URI。原始 JPG 可以作为制作素材，但需要转换后嵌入。包里不接受远程贴图地址、作者磁盘路径或需要后台服务的资源。


先等待贴图加载完成，再调用导出器。`serializeScene` 会读取图像并打包，空图像或尚未加载的图片不是可靠的导出输入。封面 `cover` 也计入图片预算。


## 贴图属性 {#uv}


每个 V2 贴图条目包含 `id, image, repeat, offset, center, rotation, flipY, wrapS, wrapT, colorSpace`。其中三个二维数组为 repeat／offset／center，rotation 为数值，flipY 为布尔值。wrapS／wrapT 只接受 `1000, 1001, 1002`；colorSpace 为 `""`、`"srgb"` 或 `"srgb-linear"`。优先让随包导出工具填写这些值。


## 检查材质而不只检查正面 {#review}

<ul><li>旋转后高光是否随视角变化，文字是否仍可读。</li><li>透明片是否遮挡后面的点击；确需穿透选取时设置 <code>userData.pickThrough</code>。</li><li>双面纸和盒盖是否出现闪烁、反字、边缘漂浮。</li><li>纸、金属、透明塑料是否有真实厚度，而非一层印刷截图。</li><li>压缩贴图后重新查看标签四边、小字与跨页，不以截掉内容换取体积。</li></ul>
