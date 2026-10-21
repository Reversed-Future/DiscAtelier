import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

// Stream authenticated assets to a hash; do not leave extra installer copies.
const [responsePath, installerPath] = process.argv.slice(2);
if (!responsePath || !installerPath) throw new Error('Usage: verify-assets.mjs <release-response.json> <installer.exe>');
const release = JSON.parse(readFileSync(responsePath, 'utf8').replace(/^\uFEFF/, ''));
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
if (release.tag_name !== `v${version}` || release.prerelease) throw new Error('Unexpected release');
const directory = `artifacts/release/${version}`;
const files = [installerPath, `${installerPath}.sig`, ...['latest.json', 'release-manifest.json', 'SHA256SUMS.txt'].map(name => join(directory, name))];
if (release.assets.length !== files.length) throw new Error('Unexpected asset count');
const results = [];
for (const path of files) {
  const name = basename(path), local = readFileSync(path);
  const digest = createHash('sha256').update(local).digest('hex');
  const matches = release.assets.filter(asset => asset.name === name);
  if (matches.length !== 1) throw new Error(`Missing or duplicated asset: ${name}`);
  const asset = matches[0];
  if (!/^https:\/\/api\.github\.com\/repos\/Reversed-Future\/DiscAtelier\/releases\/assets\/[0-9]+$/.test(asset.url)
    || asset.state !== 'uploaded' || asset.size !== local.length || asset.digest !== `sha256:${digest}`) throw new Error(`Metadata mismatch: ${name}`);
  const remote = await new Promise((resolve, reject) => {
    const hash = createHash('sha256'); let size = 0;
    const child = spawn('gh', ['api', asset.url, '-H', 'Accept: application/octet-stream'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', bytes => { size += bytes.length; hash.update(bytes); });
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve({ size, sha256: hash.digest('hex') }) : reject(new Error(`Asset read failed: ${name}`)));
  });
  if (remote.size !== local.length || remote.sha256 !== digest) throw new Error(`Downloaded asset mismatch: ${name}`);
  results.push({ name, id: asset.id, ...remote });
  console.log(`Verified ${name}: ${remote.size} bytes`);
}
writeFileSync(join(dirname(responsePath), 'remote-verification.json'), JSON.stringify({ releaseId: release.id, tag: release.tag_name, draft: release.draft, assets: results }, null, 2) + '\n');
