"""Stage the public product site alongside the model manual."""
from pathlib import Path
import argparse
import shutil

ROOT = Path(__file__).resolve().parents[2]
source = ROOT / 'artifacts/model-docs-vitepress'
parser = argparse.ArgumentParser()
parser.add_argument('--output', default='artifacts/model-docs-pages')
args = parser.parse_args()
destination = (ROOT / args.output).resolve()
if not destination.is_relative_to(ROOT / 'artifacts'):
    raise SystemExit('Pages output must stay inside the project artifacts directory.')
if destination.exists():
    raise SystemExit('Pages staging directory already exists; choose a fresh build workspace.')
if not (source / 'index.html').is_file():
    raise SystemExit('Build the VitePress manual first.')
site = ROOT / 'docs/site'
if not (site / 'index.html').is_file():
    raise SystemExit('Product website is missing.')
shutil.copytree(site, destination / 'disc-atelier')
shutil.copytree(source, destination / 'disc-atelier/models')
(destination / 'index.html').write_text(
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
    '<meta http-equiv="refresh" content="0;url=/disc-atelier/models/">'
    '<title>DiscAtelier 文档</title>'
    '<a href="/disc-atelier/models/">DiscAtelier 模型开发手册</a></html>', encoding='utf-8')
(destination / '.nojekyll').touch()
print(destination)
