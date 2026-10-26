---
title: 场景与几何
description: 坐标系、层级、铰链和可点击部件。
---

# 场景与几何

<p class="lead">V2 导出固定层级的场景，再用数据轨道驱动节点。</p>

## 坐标系与层级 {#coordinates}


`scene.up` 固定为 `"Z"`。导出容器 `root` 自身不被序列化，应保持默认变换；所有实物放在其子节点中。节点的位移、旋转和缩放均相对固定父节点，运行时不切换父子关系。


需要从容器取出的物件，可放在公共父节点下，用完整轨迹表示它与容器的相对运动。制作时的换父级、物理模拟或自定义逻辑必须烘焙成格式支持的数据，不能指望它们随 JSON 自动执行。


## 定义可以交互的部件 {#ids}


下面的 `case-body` 是本教程新定义的节点 ID，不是应用预留的名称：


```javascript
import * as THREE from './runtime/src/discs/interactive/vendor/three.module.js';
const root = new THREE.Group();
const body = new THREE.Group();
body.userData.modelId = 'case-body';
body.userData.item = 'case-body';
root.add(body);
const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(14, 12, 0.2),
  new THREE.MeshStandardMaterial({color: '#777777', roughness: 0.65})
);
body.add(mesh);
```


这是场景片段，不是完整模型包。对动作、状态或查看范围引用到的节点都设置稳定、唯一的 `userData.modelId`。`userData.item` 将节点标为可点击部件；导出后对应 `pickable`。同一部件内无需分别点击的网格可作为子节点。


## 铰链与取出路径 {#hinge}


把旋转组原点放在铰链轴上，再把盒盖网格放到相对位置。绕这个组旋转，避免盒盖围绕自身中心漂移。纸张折页同理：连接边应保持相接，折痕需要合理厚度和半径。


先沿开口方向退出约束，再抬升或移动；光碟不能穿过托盘，卡片不能穿过信封侧面。结束姿态看起来正确，不能证明中间路径正确。


## 可导出的对象 {#supported}


当前导出工具接受 `Group`、`Object3D`、`Mesh`；灯光与相机由查看器提供。支持三角形几何、固定拓扑的 position／normal 形变和形变权重动画。骨骼蒙皮、任意 shader、运行时新增节点与自动布料模拟不属于通用 V2 功能。


使用入门包自带的同一份 Three.js。混用另一版本的材质、类或着色器扩展，可能导致只在制作页面生效而导出丢失。
