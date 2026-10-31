# 模型开发手册

在线阅读：https://docs.reversed-future.com/disc-atelier/models/

手册使用 VitePress，包含模型格式参考、制作流程、AI Skill 和入门包。模型契约适用于 DiscAtelier 0.3.1（V2/V3/V4；V4 自 0.2.3 起）。

## 本地预览

需要 Node.js 22 和 Python 3。在仓库根目录运行：

```sh
npm ci --prefix docs/model-dev
npm run dev --prefix docs/model-dev
```

## 构建与发布

```sh
npm run build --prefix docs/model-dev
npm run preview --prefix docs/model-dev
```

正文在 `guide/`，导航在 `pages.json`，主题在 `.vitepress/`。AI 章节由 `ai/page.md` 和 `ai/prompts.json` 生成；Skill 源文件在 `ai/discatelier-model-author/`，入门工具在 `toolkit/`。

构建命令将当前模型运行库与工具打包为下载资源，附带许可证和 SHA-256 清单，输出至 `artifacts/model-docs-vitepress/`。部署子路径由 `MODEL_DOCS_BASE` 指定，需带首尾斜杠。

推送到 `main` 后，GitHub Actions 自动构建、检查 Skill、发布到 GitHub Pages 的 `/disc-atelier/models/`。域名由仓库 Pages 设置管理，Cloudflare DNS 指向 `reversed-future.github.io`。
