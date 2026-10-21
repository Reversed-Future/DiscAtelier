import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = join(root, 'packages/netease-sidecar');
const out = join(root, 'artifacts/netease-runtime');
const lock = readFileSync(join(pkg, 'package-lock.json'));
const fingerprint = createHash('sha256').update(lock).digest('hex');
const manifestPath = join(out, 'manifest.json');
if (existsSync(manifestPath) && JSON.parse(readFileSync(manifestPath)).lockSha256 !== fingerprint) {
  throw new Error('Runtime dependencies changed. Use a fresh resource directory; do not overwrite an old dependency tree.');
}
const version = JSON.parse(readFileSync(join(pkg, 'node_modules/@neteasecloudmusicapienhanced/api/package.json'))).version;
if (version !== '4.41.1') throw new Error('Unexpected api-enhanced version');
if (!existsSync(join(out, 'node_modules'))) cpSync(join(pkg, 'node_modules'), join(out, 'node_modules'), { recursive: true, filter: source => !source.split(/[\\/]/).includes('.bin') });
cpSync(join(pkg, 'runner.cjs'), join(out, 'runner.cjs'));
cpSync(join(pkg, 'playback.cjs'), join(out, 'playback.cjs'));
cpSync(join(pkg, 'public-key.cjs'), join(out, 'public-key.cjs'));
cpSync(join(pkg, 'auth.cjs'), join(out, 'auth.cjs'));
writeFileSync(manifestPath, JSON.stringify({ node: '22.23.3', api: version, lockSha256: fingerprint }, null, 2));
console.log('Prepared NetEase runtime: Node 22.23.3 / API 4.41.1');
