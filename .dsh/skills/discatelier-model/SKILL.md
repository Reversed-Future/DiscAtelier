---
name: discatelier-model
description: Create or adapt a DiscAtelier-compatible .ateliermodel package. Use only when the user explicitly asks to create, adapt, rebuild, or package a DiscAtelier model. Ask the user for any needed photos, materials, dimensions, or ratios; iterate until the user is satisfied and the package imports and renders in the current DiscAtelier app. V2 is the portable path; V3 is only for profiles already registered in the running DiscAtelier build.
whenToUse: The user explicitly names DiscAtelier and asks to make, adapt, rebuild, or package a 3D/interactive model for it. Do not use for generic 3D modeling, image generation, or unrelated collections.
---

# DiscAtelier 适配模型制作

## 触发边界

只有用户**明确要求**为 DiscAtelier 创建、改造、重做或打包模型时，才执行本流程。

不要因为用户提到“模型”“3D”“拆盒”“专辑包装”就自行开始。普通建模、渲染、图片生成或 AtelierPublisher 网页需求不在本 Skill 范围内。

开始前先确认：

- 目标收藏／专辑／版本；
- 用户要新建模型，还是改已有 `.ateliermodel`；
- 交付目标是**当前安装的 DiscAtelier**，不是只做一个网页或静态渲染图。

## 别人怎么使用

当前技能位于项目级根目录：

```text
<DiscAtelier 仓库>/.dsh/skills/discatelier-model/SKILL.md
```

因此，仓库的使用者会直接发现它；离开这个仓库则不会自动出现。

需要分享给其他人时：

1. 把整个 `discatelier-model/` 目录复制给对方；
2. 放进对方的任一 Skill 根目录：
   - `<项目根>/.dsh/skills/`
   - 或 `~/.dsh/skills/`
3. 对方重新打开会话，确认 Skill 目录出现 `discatelier-model`；
4. 对方仍需具备本机的模型打包工具链和 Chromium/Playwright，路径按实际位置调整。

可移植性边界：

- **V2 模型流程可移植**，前提是对方的 DiscAtelier 支持 V2；
- **V3 不可跨构建移植**，因为 profile 和装配程序在播放器代码里，不在模型包里；
- 不要承诺“同一个 V3 包在别人的 DiscAtelier 也能用”，除非对方的安装版本明确包含同一 profile。

依赖说明：

- 本 Skill 只定义流程和验收，不附带 Three.js 建模器、打包器、浏览器或素材；
- 默认引用 AtelierPublisher 的通用工具链；对方没有该工具链时，先向用户确认其可用的导出器，不要假装已打包；
- 对方的 DiscAtelier 版本、V2 支持和图片预算也必须按实际版本核对。

## 第一原则：缺资料就问

**不要猜尺寸、比例、材质、颜色、层级或动作顺序。** 缺少必要资料时，先向用户要；可以一次列出清单，但不要用“合理默认值”冒充实物。

优先向用户索取：

### 外观与图片

- 正面、背面、书脊／侧边、顶部、底部；
- 完全打开、内托、夹层、附件、光盘／磁带／书页；
- 折角、铰链、卡扣、透明外套、腰封、贴纸、压纹、烫金等局部特写；
- 有比例尺的照片，或已知物体的实拍参照；
- 封面图（用于收藏架）和模型内使用的文字／Logo 原图。

### 尺寸与比例

- 外盒长、宽、厚（mm 或 cm，注明单位）；
- 内托、书、册子、光盘、磁带、卡片等分别尺寸；
- 纸张／纸板厚度、间隙、铰链轴位置；
- 用户希望的整体缩放比例；若实物测量不完整，明确问清楚哪些尺寸可以近似。

### 材质

- 纸、纸板、塑料、布料、金属、箔纸、透明膜等；
- 哑光／亮面、透明度、粗糙度、金属度、压纹、烫金、反光；
- 是否有内页图案、正反方向、特殊叠色、半透明层。

### 结构与动作

- 哪些部件可以独立移动；
- 铰链／抽屉／翻页／抽拉的真实轴心和方向；
- 操作先后、避让路径、最终摆放位置；
- 初始状态、打开状态、单件查看、放回、全部收纳；
- 是否有可点击的分支或解密卡／歌词本等特殊步骤。

### 作品信息

- 模型 `id`、标题、作者、版本；
- 封面来源和授权；
- 是否允许使用用户提供的照片、扫描件和材质图。

如果用户无法提供某项资料，记录为“用户确认可近似”，并明确近似依据。未确认前不要继续做最终包。

## 选择格式

### V2：通用场景格式

默认选择 V2，适用于翻盖盒、抽屉盒、天地盖、书型盒、多配件包装、普通纸品和大多数自定义结构。

V2 包包含：

- Three.js 场景节点、父子层级和变换；
- 几何、PBR 材质、内嵌 PNG/WebP 贴图；
- 状态、点击规则和动作时间轴；
- 内嵌封面。

V2 可以表达任意三角网格和固定拓扑形变，但不能执行脚本、GLSL、骨骼蒙皮、布料／软体物理或外部贴图。

### V3：运行时私有的固定装配格式，不是通用制作格式

V3 的 `profile` 是 DiscAtelier 播放器内置的固定装配程序编号，不是可自由填写的模板名。**别人不能仅凭一个 profile 名字制作 V3 模型。**

只有同时满足以下条件才可使用 V3：

1. 用户本人正在维护这个 DiscAtelier 运行时，并明确要扩展或复用其中已注册的结构；
2. 当前安装的 DiscAtelier 代码里确实存在该 profile 和对应装配程序；
3. 实物结构与这个 profile 的契约完全匹配；
4. 当前安装版本已经验证可以加载该 V3 包。

不满足时**一律使用 V2**。

特别注意：

- 不要把某个旧模型、旧专辑名或个人作品名当作通用 profile；
- 不要从旧示例复制 profile 字符串；
- 不要因为包能生成就宣称 V3 兼容；
- 新增 V3 结构必须先改播放器固定 runtime 并发布新版本，不能只改模型包。

因此，对其他用户或另一个 DiscAtelier 构建，V3 通常应视为**不可用**；V2 才是可移植的制作格式。

## 制作流程

### 1. 建立工作目录

在当前工作区建立独立目录，例如：

```text
models/<model-id>/
  scene.json
  interaction.json
  cover.png
  build/
  validation/
```

保留源文件，不覆盖用户已确认的版本。每次修改生成新的构建产物。

### 2. 建模与层级

- 统一单位，推荐 cm 或 mm，并在源文件中记录；
- Z 轴向上；
- 根节点使用 Group；
- 每个可独立移动的部件使用独立节点；
- 节点 id 唯一、稳定、区分大小写；
- 铰链／折痕原点放在真实轴心；
- 纸板要有厚度、背面和封边，凹槽要有几何深度；
- 父子关系保持固定；需要取出的物品使用共同父级或预烘焙局部轨迹；
- 不要用大量细分代替贴图；
- 移除灯光和相机，由 DiscAtelier 统一提供照明。

### 3. 材质与贴图

- 优先使用用户提供的原始照片／扫描件；
- 照片先做透视校正，保留真实比例；
- 展开 UV，检查正反方向和文字方向；
- 使用 PBR 材质，贴图必须内嵌为 data URI，不能引用原文件路径、远程 URL 或外链；
- PNG/WebP 单张编码不超过 16 MiB，边长不超过 8192；
- 封面和贴图合计不超过 192 × 1024² 像素；
- 整个 `.ateliermodel` 不超过 50 MiB；
- 不复制无授权的商业图像；用户提供的素材需确认可用。

### 4. 状态与动作

- 先完全退出开口，再抬起、移开、落下；
- 收回沿原轨迹倒放，开和关使用同一几何路径；
- 动作时间为毫秒，首帧 0，末帧等于 `duration`，时间严格递增；
- 每个动作的首帧必须与开始姿态完全一致；
- `position`、`quaternion`、`scale`、`weights` 使用支持的通道；
- 四元数顺序为 `[x,y,z,w]` 并归一化；
- 每个状态每个点击目标只有一个动作；
- 为每个关键状态定义 `focus`、`clicks`、`returns`、`reset`；
- 最终拆开位置要预留空间，不能与其他部件重叠。

### 5. 打包

优先使用现有 AtelierPublisher 通用工具链，不修改 AtelierPublisher 的只读参考源：

```powershell
node scripts/package-interactive-model.mjs `
  --scene model-authoring/packages/example-drawer.scene.json `
  --interaction model-authoring/packages/example-drawer.interaction.json `
  --cover model-authoring/packages/example-drawer.png `
  --out <workdir>/build/<model-id>.ateliermodel `
  --browser 'C:/Users/<user>/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'
```

路径按本机实际位置替换。若浏览器不可用，先向用户确认可用的 Chromium／Playwright 路径；不要用伪造扩展名或直接改 `.glb`/`.obj` 的方式绕过打包。

### 6. 验证

至少完成以下层级：

1. **包结构**：JSON/UTF-8、`format`、`version`、节点／几何／材质／贴图引用、动作时间轴、状态可达性；
2. **限制**：50 MiB、图片尺寸／像素预算、无脚本、无远程 URL；
3. **上游只读验证**：运行 AtelierPublisher 对应的 V2/V3 测试和导出验证脚本；
4. **当前 DiscAtelier 导入**：
   - 打开已安装的当前 DiscAtelier；
   - 进入收藏“编辑版本 → 上传模型”；
   - 选择 `.ateliermodel`，确认标题并保存；
   - 进入详情，点击部件执行动作；
   - 检查单件查看、放回、全部收起、返回收藏架再打开；
   - 检查封面淡切、重置视角、关闭再打开；
   - 观察控制台／播放器错误，确认没有校验失败或渲染回退。
5. **用户验收**：把实际截图或短视频交给用户，逐项确认比例、材质、动作和视角。

只有用户明确表示满意，且当前安装的 DiscAtelier 能正常导入、保存、重新打开和操作，才算完成。

### 7. 迭代

用户提出比例、材质、动作或视角修改时：

- 保留上一版源文件和包；
- 只改明确要求的部分；
- 重新打包和全量导入验证；
- 不把“看起来差不多”当成已验收；
- 不擅自删除用户已确认的版本。

## 交付内容

- 最终 `.ateliermodel`；
- 源 `scene.json`、`interaction.json`、封面和必要的材质图；
- 一次成功导入当前 DiscAtelier 的记录；
- 验证结果和已知限制；
- 用户确认记录。

如果用户只要模型文件，也要保留源文件路径和可复现的打包命令。

## 禁止事项

- 不猜实物尺寸、材质和结构；
- 不把未经确认的近似值说成实测值；
- 不把 OBJ／FBX／STL／GLB 直接改名为 `.ateliermodel`；
- 不在包内放 JavaScript、模块地址、外部贴图或任意 URL；
- 不执行模型包内代码；
- 不修改 AtelierPublisher 的只读参考源、用户收藏库或原始照片；
- 不声称“已导入”而没有在当前 DiscAtelier 中实际验证；
- 不在用户未明确要求时替换已安装应用或发布发行版。
