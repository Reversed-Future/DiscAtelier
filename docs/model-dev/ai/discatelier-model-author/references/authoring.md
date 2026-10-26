# 制作契约 · DiscAtelier 0.2.0

路径相对创建后的工作区；使用时先读真实文件，不推断字段。`runtime/index.js` 的 `parseModel` 是应用公开校验入口，拒绝 V1。`runtime/shared/model-v2.js`、`model-v3.js` 是精确结构规则；`runtime/shared/assembly-profiles.js` 是 V3 固定结构及资源槽。`runtime-manifest.json` 记录逐文件哈希，`provenance.json` 记录制作辅助工具来源。

## 制作源与导出

- `author.mjs` 导出异步 `buildModel()`，返回包数据。完整通用翻盖／抽屉教学定义见 `runtime/model-authoring/examples.js`。
- 使用 `runtime/src/discs/interactive/vendor/three.module.js`；不要混入其他 Three.js 版本。
- `runtime/model-authoring/export-package.js` 提供 `makeModelPackage({root,id,title,creator,cover,initialState,states,actions,navigation,shareTracks})`。root 自身不导出，保持默认变换，实物放在其子节点。导出前恢复初始收纳姿态，并等待图像加载完成。
- 节点引用使用唯一 `userData.modelId`，可点击部件用 `userData.item`，需要穿透选取的透明层用 `userData.pickThrough`。
- 支持 Group／Object3D／Mesh、standard／physical／basic 材质、固定拓扑形变。材质白名单读 model-v2.js；任意 shader、骨骼、运行时换父级不能自动导出。内置 effect 仅有 `radial-diffraction`。
- `scene.up` 为 `Z`；统一测量单位。节点运动相对固定父节点，不能用动态换父级代替数据轨道。`record-scene.js` 可辅助烘焙真实运动，使用前读其具体接口。

## 状态与交互

- states 每项有 `id,focus,clicks`；clicks 为 `{target,action}`，动作 from 与所在状态一致。
- actions 有 `id,from,to,duration,tracks`；轨道为 `{node,property,times,values}`。property 支持 position／quaternion／scale／weights。时间单位毫秒，首帧 0、末帧 duration，严格递增；四元数归一化。
- navigation 支持 preserveOverview／followActions／stateReset。普通拆装启用前两项，动作填写 part／label／view。
- `returns:[{target,label,steps:[{action,reverse}]}]` 描述同一 part 的放回路径。stateReset 开启时，非初始状态的 reset 必须无环地回到 initialState。
- 翻页动作 `keepFocus:true`，不设 `refitFocus:true`；进入阅读的一次取景与连续翻页分开。检验用户旋转、缩放后翻页不重置相机。
- `part-interaction.js` 的 `partInteraction(model,specs)` 辅助生成已明确部件的返回路径；它不会识别实物或推断依赖。

## 图片与限额

UTF-8 JSON `.ateliermodel`，format 为 `atelier-interactive-model`。V2 包 version 为数字 2。封面和贴图仅内置 PNG／WebP data URI，不用远程 URL 或绝对路径。

文件 ≤50 MiB；每图片 URI ≤16 Mi 字符；宽高各 ≤8192；总像素含封面 ≤192×1024²；原生单次解码预算128 MiB。V2 节点／几何各3000，材质500、贴图300、基础顶点150万、状态768、动作4000、动画数值总量600万。运行实际校验器，不凭摘要放行。

## V3 边界

V3 的 rig 为 `album-assembly-v1`，runtimeVersion 为数字1。当前 profile 仅 `research-bai`、`nafelibeta2`、`ups-and-downs-firdhaus`、`yomei10-rad`、`thunder-radio-luoyan`、`qingluo-decoy`。资源槽以 assembly-profiles.js 为准，不能根据名字相似推测结构。新包装优先 V2，不为导出陌生作品而修改应用白名单。
