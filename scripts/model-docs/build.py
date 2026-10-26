"""Compatibility entry point: build the actual VitePress documentation site."""
from pathlib import Path
import os
import subprocess

if __name__ == '__main__':
    root = Path(__file__).resolve().parents[2]
    npm = 'npm.cmd' if os.name == 'nt' else 'npm'
    raise SystemExit(subprocess.call([npm, 'run', 'build', '--prefix', 'docs/model-dev'], cwd=root))
