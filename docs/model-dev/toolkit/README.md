# DiscAtelier 模型制作入门包

面向 DiscAtelier 0.3.0；无需 npm 安装。通用翻盖／抽屉盒仅作教学，不是任何唱片的实物模型。

1. Python 3 运行 `python serve.py`，打开打印的本机网址。
2. 点击“构建制作源”，尝试盒盖、取出件、放回与全部收起。
3. 编辑 `author.mjs` 及自己的几何、材质和动作模块；依赖模块变更后刷新浏览器。
4. “导出当前包”，然后重新“载入模型包”测试最终文件。
5. Node.js 22+ 执行 `node scripts/validate-package.mjs example-hinge.ateliermodel`。
6. 安装 Pillow 后执行 `python scripts/validate-images.py example-hinge.ateliermodel`。
7. 在目标应用的测试收藏中上传、保存、重开，记录结果。

校验不会读取收藏库。浏览器通过不等于原生导入、实物验收或用户认可。

## 来源与许可证

`runtime-manifest.json` 记录适用版本与运行文件的 SHA-256，可用于检查文件完整性。

使用或分发制作工具时，请遵守随包 GPL-3.0-or-later 和 Three.js MIT 许可证。来源记录见 `provenance.json` 及运行库附带的许可文件。
