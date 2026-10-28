"""Prepare VitePress downloads and the portable AI Skill; no network or cleanup."""
import hashlib
import json
from pathlib import Path
import shutil
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'docs/model-dev'
PUBLIC = SOURCE / 'guide/public'


def copy_tree(source, destination):
    for file in sorted(source.rglob('*')):
        if file.is_file() and '__pycache__' not in file.parts and file.suffix != '.pyc':
            target = destination / file.relative_to(source)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file, target)


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')


def zip_directory(source, target, prefix=''):
    target.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
        for file in sorted(source.rglob('*')):
            if file.is_file() and '__pycache__' not in file.parts and file.suffix != '.pyc':
                archive.write(file, prefix + file.relative_to(source).as_posix())
    return hashlib.sha256(target.read_bytes()).hexdigest()


def prepare():
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    if version not in ('0.2.3',):
        raise ValueError('Review the manual and Skill compatibility baseline before updating the application version.')
    playground = PUBLIC / 'playground'
    copy_tree(ROOT / 'packages/atelier-model-runtime', playground / 'runtime')
    copy_tree(SOURCE / 'toolkit', playground)
    shutil.copy2(ROOT / 'LICENSE', playground / 'DISCATELIER-LICENSE.txt')
    manifest = {file.relative_to(playground).as_posix(): hashlib.sha256(file.read_bytes()).hexdigest()
                for file in sorted((playground / 'runtime').rglob('*')) if file.is_file()}
    write(playground / 'runtime-manifest.json', json.dumps({'applicationVersion': version, 'files': manifest}, indent=2))
    skill = PUBLIC / 'ai/discatelier-model-author'
    copy_tree(SOURCE / 'ai/discatelier-model-author', skill)
    copy_tree(playground, skill / 'assets/workspace')
    prompts = json.loads((SOURCE / 'ai/prompts.json').read_text(encoding='utf-8'))
    sections = '\n\n'.join(f"## {p['title']} {{#{p['id']}}}\n\n```text\n{p['text']}\n```" for p in prompts)
    page = (SOURCE / 'ai/page.md').read_text(encoding='utf-8').replace('{{PROMPTS}}', sections)
    write(SOURCE / 'guide/ai-authoring.md', page)
    prompt_text = '# DiscAtelier AI 模型制作提示词\n\n替换方括号后使用。Skill 基线为 0.2.3，V4 需要 0.2.3 或更新的兼容播放器。\n\n' + sections + '\n'
    write(PUBLIC / 'downloads/AI-PROMPTS.md', prompt_text)
    hashes = {}
    for name, folder, prefix in [('discatelier-model-starter.zip', playground, ''),
                                 ('discatelier-model-author-skill.zip', skill, 'discatelier-model-author/')]:
        hashes[name] = zip_directory(folder, PUBLIC / 'downloads' / name, prefix)
    write(PUBLIC / 'downloads/SHA256SUMS.txt', ''.join(f'{digest}  {name}\n' for name, digest in hashes.items()))
    write(PUBLIC / 'downloads/build-report.json', json.dumps({'applicationVersion': version, 'sha256': hashes,
          'runtimeFiles': len(manifest), 'skillIncludesWorkspace': True}, indent=2))
    print(json.dumps({'downloads': list(hashes), 'runtimeFiles': len(manifest)}, ensure_ascii=False))


if __name__ == '__main__':
    prepare()
