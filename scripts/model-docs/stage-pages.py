"""Stage only the built public manual at its documented deployment path."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]
source = ROOT / 'artifacts/model-docs-vitepress'
destination = ROOT / 'artifacts/model-docs-pages'
if destination.exists():
    raise SystemExit('Pages staging directory already exists; choose a fresh build workspace.')
if not (source / 'index.html').is_file():
    raise SystemExit('Build the VitePress manual first.')
shutil.copytree(source, destination / 'disc-atelier/models')
(destination / 'index.html').write_text(
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
    '<meta http-equiv="refresh" content="0;url=/disc-atelier/models/">'
    '<title>DiscAtelier 文档</title>'
    '<a href="/disc-atelier/models/">DiscAtelier 模型开发手册</a></html>', encoding='utf-8')
(destination / '.nojekyll').touch()
print(destination)
