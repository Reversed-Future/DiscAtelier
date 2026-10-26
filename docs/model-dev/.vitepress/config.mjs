import {defineConfig} from 'vitepress';
import {readFileSync} from 'node:fs';
const pages = JSON.parse(readFileSync(new URL('../pages.json', import.meta.url), 'utf8'));
const sidebar = [];
for (const page of pages) {
  let group = sidebar.find(item => item.text === page.group);
  if (!group) sidebar.push(group = {text: page.group, items: []});
  group.items.push({text: page.title, link: page.id === 'index' ? '/' : `/${page.id}`});
}
export default defineConfig({
  lang: 'zh-CN', title: 'DiscAtelier', description: '实体模型开发手册 · 制作、交互、格式与 AI 辅助',
  srcDir: 'guide', srcExclude: ['README.md', 'public/**'],
  outDir: '../../artifacts/model-docs-vitepress',
  base: process.env.MODEL_DOCS_BASE || '/',
  appearance: 'dark', cleanUrls: false,
  vite: {build: {emptyOutDir: false}},
  themeConfig: {
    siteTitle: 'DiscAtelier 模型开发', sidebar,
    nav: [{text: '开发指南', link: '/'}, {text: 'AI 制作', link: '/ai-authoring'},
      {text: '0.2.1', link: '/limits'}],
    outline: {level: [2, 3], label: '本页内容'},
    docFooter: {prev: '上一页', next: '下一页'},
    sidebarMenuLabel: '目录', returnToTopLabel: '返回顶部', darkModeSwitchLabel: '主题',
    search: {provider: 'local', options: {locales: {root: {translations: {
      button: {buttonText: '搜索文档', buttonAriaLabel: '搜索文档'},
      modal: {displayDetails: '显示详情', resetButtonTitle: '清空搜索', backButtonTitle: '关闭搜索',
        noResultsText: '没有相关结果', footer: {selectText: '选择', navigateText: '切换', closeText: '关闭'}}
    }}}}},
    footer: {message: '模型制作工具遵循随包许可证', copyright: '适用于 DiscAtelier 0.2.0–0.2.1'}
  }
});
