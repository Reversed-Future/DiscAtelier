# 制作契约 · DiscAtelier 0.3.1

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

## 实物连接与路径

厚度、开口与安装面按测量建模。插舌与底片、围挡与底部有真实共同边及铰链，不能漂浮分离。纸折痕要有合理的折转半径，双面纸与透明片不闪烁、不反字。固定底图不可取出；卡片、绑带、回形针是否联动按用户确认。

取出按开口方向先退出约束，再抬起、移动、旋转；光碟不能穿透信封／托盘。收回先合拢歌词本或折好海报，再沿合法路径归位。单件放回不带走无关部件。对于多物件同时摊开等交互，按用户说明实现，并保持无重叠且适度紧凑的布局。

外高、内深、板厚、装配坐标和内部堆叠高度分开记录，检查闭合剖面；“内外盒等高”不能被一个任意 z 偏移代替。腰封按实际折线和盒体外廓计算，不通过缩小整张印刷图补救超长。改变盒盖铰轴后，同时核对连接臂、卡扣、随盖移动的歌词本和收回轨迹。

平铺布局按物件最大展开占地预留，包括跨页画册、海报及底纸折边；对全部合法同时取出件检查平面重叠，再调到适度紧凑。终点不重叠不证明取出途中无相交，转轴和开口附近需单独检查动作中段。

## 可见表面的点击归属

建立“装配状态 → 可见命中节点 → 预期动作 → 后续状态”的表。检查实际射线命中的网格及最近可点击祖先；可点击子节点会截走父部件的点击，父节点存在动作不代表点击子节点会自动执行它。

例如书尚在纸盒内时，封面页和露出的页边应进入取出整本书的流程；书取出后才由阅读状态处理翻页。根据真实节点表设置这些绑定或当前运行库支持的显式路由，不凭名称前缀猜归属，也不把所有状态的子节点永久转发给父节点。拆装和局部阅读不能同时接管同一点击。

透明薄膜、盒盖、标签和实际开口会影响命中。只有实物及流程允许穿透点击时才用 `pickThrough`；不能为方便操作让封闭包装中的物品直接取出。未配置动作时是否进入查看也要明确，用户要求“点哪里操作哪里”时不能把放大当成拆装成功。


## V4 独立控制器（0.2.3 起）

V4 保留 V2 的 scene、states、actions，增加 controllers。先读 `runtime/shared/model-v4.js` 及 `runtime/src/discs/interactive/model/independent-controls.js`。每个控制器有 id、part、enabledIn、initialState、navigation、states、actions；enabledIn 引用整套装配状态，局部轨迹只能操作 part 子树。控制器不能在整套初始收纳状态启用，子树不能重叠。

最多 8 个控制器；每个最多 2048 状态、10000 动作；包含整套装配的累计状态不超过 8192、动作不超过 24000。整套装配仍受 V2 的 768 状态、4000 动作限制。各局部状态有合法无环 reset；动作不能隐藏其他部件或接管空白点击。完整限制以校验器为准，不能只按摘要放行。

可先用 makeModelPackage 导出有效 V2 基础场景，再组合 version:4 与 controllers，并对最终对象运行 parseModel。导出器不会自动产生局部状态图。退出 enabledIn、单件收回或全部收起前，播放器先合拢局部状态，再移动容器。收纳时封面／页边的取出点击仍需配置，不能只定义局部翻页。

40 张上下独立纸有 41×41=1681 种组合，适合把阅读状态与装配状态分开。普通书册仍可用 V2，V3 仍限已注册结构。0.2.2 及更早版不支持 V4，必须让用户明确目标版本；不删页、强制同步上下页或改版本号绕过限制。

页面曲边、白边与分切处理见 [页面边界与书册](paper-pages.md)，普通透明盒见 [常规透明碟盒](jewel-cases.md)。
