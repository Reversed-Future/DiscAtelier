"""Check the distributed Skill in an isolated directory; preserve all evidence."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
archive = ROOT / 'docs/model-dev/guide/public/downloads/discatelier-model-author-skill.zip'
evidence = Path(tempfile.mkdtemp(prefix='model-skill-', dir=ROOT / 'artifacts'))
with ZipFile(archive) as package:
    assert package.testzip() is None
    for name in package.namelist():
        assert (evidence / name).resolve().is_relative_to(evidence.resolve())
    package.extractall(evidence)
skill = evidence / 'discatelier-model-author'
for markdown in [skill / 'SKILL.md', *sorted((skill / 'references').glob('*.md'))]:
    for target in re.findall(r'\]\(([^)]+)\)', markdown.read_text(encoding='utf-8')):
        assert (markdown.parent / target).is_file(), target
script = skill / 'scripts/create-workspace.py'
workspace = evidence / 'workspace'
def run(destination):
    return subprocess.run([sys.executable, '-X', 'utf8', str(script), '--out', str(destination)], capture_output=True, text=True, encoding='utf-8')
created = run(workspace)
assert created.returncode == 0, created.stderr
manifest = json.loads((workspace / 'runtime-manifest.json').read_text(encoding='utf-8'))
for relative, digest in manifest['files'].items():
    assert hashlib.sha256((workspace / relative).read_bytes()).hexdigest() == digest
sentinel = workspace / 'keep.txt'
sentinel.write_text('preserve existing work', encoding='utf-8')
duplicate = run(workspace)
assert duplicate.returncode != 0 and sentinel.read_text(encoding='utf-8') == 'preserve existing work'
# Corrupt only the extracted test copy, never the distributed or source runtime.
(skill / 'assets/workspace/runtime/index.js').write_text('// altered test input', encoding='utf-8')
rejected = run(evidence / 'must-not-be-created')
assert rejected.returncode != 0 and 'hash mismatch' in rejected.stderr
assert not (evidence / 'must-not-be-created').exists()
result = {'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'runtimeFiles': len(manifest['files']),
          'creationPassed': True, 'existingDirectoryPreserved': True, 'corruptRuntimeRejected': True,
          'evidence': str(evidence), 'independentAIBehaviorTested': False}
(ROOT / 'artifacts/model-skill-verification.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
