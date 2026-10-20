import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))];
const issues = [];
const rules = [
  ['GitHub credential', /(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['Credential literal', /(?:token|password|secret)\s*[:=]\s*['"][A-Za-z0-9+/=_-]{32,}['"]/],
];
for (const file of files) {
  if (/^(?:artifacts|private|target)\//.test(file) || /(?:^|\/)\.env(?:\.|$)/.test(file)
    || /\.(?:db|sqlite3|ateliermodel|pfx|p12|key|pem|exe|msi)$/.test(file)
    || file === 'prototype/collection.json' || /^prototype\/assets\/cover-\d+\.webp$/.test(file)) {
    issues.push({ file, rule: 'Excluded private or generated file' });
    continue;
  }
  if (statSync(join(root, file)).size > 90 * 1024 * 1024) issues.push({ file, rule: 'File exceeds source size limit' });
  const bytes = readFileSync(join(root, file));
  if (bytes.includes(0)) continue;
  const content = bytes.toString('utf8');
  for (const [rule, expression] of rules) if (expression.test(content)) issues.push({ file, rule });
}
const readJson = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const version = readJson('package.json').version;
for (const path of ['package-lock.json', 'apps/desktop/package.json', 'apps/desktop/src-tauri/tauri.conf.json']) {
  if (readJson(path).version !== version) issues.push({ file: path, rule: 'Release version mismatch' });
}
const release = readJson('apps/desktop/src-tauri/tauri.release.conf.json');
if (release.build.frontendDist !== `../dist-release/${version}`) issues.push({ file: 'tauri.release.conf.json', rule: 'Frontend version mismatch' });
console.log(JSON.stringify({ sourceFilesChecked: files.length, version, issues }, null, 2));
if (issues.length) process.exitCode = 1;
