import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Inputs are an exact GitHub Release response and the installer just built.
const [responsePath, installerPath] = process.argv.slice(2);
if (!responsePath || !installerPath) throw new Error('Usage: prepare-update.mjs <release-response.json> <installer.exe>');
const release = JSON.parse(readFileSync(responsePath, 'utf8').replace(/^\uFEFF/, ''));
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
if (release.tag_name !== `v${version}` || !release.draft) throw new Error('Expected matching draft release');
const installerName = `DiscAtelier_${version}_x64-setup.exe`;
if (basename(installerPath) !== installerName) throw new Error('Unexpected installer filename');
const matches = release.assets.filter(asset => asset.name === installerName);
if (matches.length !== 1) throw new Error('Upload exactly one installer first');
const remote = matches[0];
if (!/^https:\/\/api\.github\.com\/repos\/Reversed-Future\/DiscAtelier\/releases\/assets\/[0-9]+$/.test(remote.url)
    || remote.state !== 'uploaded') throw new Error('Unexpected asset endpoint or state');
const installer = readFileSync(installerPath);
const sha256 = createHash('sha256').update(installer).digest('hex');
if (remote.digest !== `sha256:${sha256}` || remote.size !== installer.length) throw new Error('Uploaded installer differs');
const signaturePath = `${installerPath}.sig`;
const signature = readFileSync(signaturePath, 'utf8').trim();
if (!signature) throw new Error('Missing signature');
const directory = resolve('artifacts/release', version);
mkdirSync(directory, { recursive: true });
const latest = {
  version,
  notes: release.body || '',
  platforms: { 'windows-x86_64': { url: remote.url, signature } },
};
writeFileSync(`${directory}/latest.json`, JSON.stringify(latest, null, 2) + '\n');
const receipt = {
  version, platform: 'windows-x86_64',
  sourceCommit: execFileSync('git', ['rev-parse', `v${version}^{commit}`], { encoding: 'utf8' }).trim(),
  installer: { name: installerName, size: installer.length, sha256 },
  updater: { enabled: true, requireSignedVersion: true },
  validation: { installerExecuted: false, hardwareTestedThisRelease: false },
};
writeFileSync(`${directory}/release-manifest.json`, JSON.stringify(receipt, null, 2) + '\n');
const files = [installerPath, signaturePath, `${directory}/latest.json`, `${directory}/release-manifest.json`];
writeFileSync(`${directory}/SHA256SUMS.txt`, files.map(file =>
  `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${basename(file)}`
).join('\n') + '\n');
console.log(JSON.stringify({ directory, version, installerName, size: installer.length, sha256 }));
