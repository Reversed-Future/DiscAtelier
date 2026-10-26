"""Create a portable model workspace without overwriting existing files."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil


def create(destination):
    source = Path(__file__).resolve().parents[1] / 'assets/workspace'
    if not source.is_dir():
        raise ValueError('Bundled assets/workspace is missing. Use the complete Skill download.')
    if destination.exists():
        raise FileExistsError('Output already exists. Choose a new directory; nothing was overwritten.')
    manifest = json.loads((source / 'runtime-manifest.json').read_text(encoding='utf-8'))
    for relative, expected in manifest['files'].items():
        file = (source / relative).resolve()
        if not file.is_relative_to(source.resolve()) or not file.is_file():
            raise ValueError(f'Invalid bundled runtime path: {relative}')
        if hashlib.sha256(file.read_bytes()).hexdigest() != expected:
            raise ValueError(f'Bundled runtime hash mismatch: {relative}')
    shutil.copytree(source, destination)
    return {'workspace': str(destination), 'applicationVersion': manifest['applicationVersion'],
            'start': 'python serve.py', 'teachingExampleOnly': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(create(args.out.resolve()), ensure_ascii=False, indent=2))
    except (ValueError, FileExistsError) as error:
        parser.error(str(error))
