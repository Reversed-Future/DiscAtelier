import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--locked', '--offline', '--format-version', '1',
  '--filter-platform', 'x86_64-pc-windows-msvc'], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
// Exact names enumerated from the installed, locked dependency source trees.
const licenseNames = new Set(['COPYING', 'COPYRIGHT', 'LICENCE', 'LICENSE', 'LICENSE-0BSD', 'LICENSE-APACHE',
  'LICENSE-APACHE-2.0', 'LICENSE-APACHE.md', 'LICENSE-APACHE.txt', 'LICENSE-Apache', 'LICENSE-BOOST', 'LICENSE-LIBM-MIT',
  'LICENSE-MIT', 'LICENSE-MIT.md', 'LICENSE-MIT.txt', 'LICENSE-THIRD-PARTY', 'LICENSE-UNICODE', 'LICENSE-ZLIB',
  'LICENSE-ZLIB.md', 'LICENSE.BSD-3-Clause', 'LICENSE.MIT', 'LICENSE.md', 'LICENSE.spdx', 'LICENSE.txt',
  'LICENSE_APACHE-2.0', 'LICENSE_MIT', 'UNLICENSE', 'license-apache-2.0', 'license-mit']);
const sections = ['DiscAtelier third-party notices\n\nThis file includes dependency licenses, including build dependencies.\n'
  + 'MiSans licensing is supplied separately in MiSans-LICENSE.pdf and MiSans-NOTICE.txt.\n'
  + 'MPV, VLC, Temurin JRE and the NetEase runtime are bundled with their accompanying license files. MakeMKV is not redistributed.'];
const missing = [];
const supplemental = {
  'alloc-stdlib': 'alloc-stdlib.txt',
  selectors: 'MPL-2.0.txt',
  'tauri-plugin': 'tauri-plugin.txt',
  'webview2-com': 'webview2-com.txt',
  'webview2-com-macros': 'webview2-com-macros.txt',
  'webview2-com-sys': 'webview2-com.txt',
};
function append(name, directory, licenseFile, extraFile) {
  const files = new Set(readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && licenseNames.has(entry.name)).map(entry => join(directory, entry.name)));
  if (licenseFile) files.add(resolve(directory, licenseFile));
  if (extraFile) files.add(join(root, 'scripts/release/licenses', extraFile));
  if (!files.size) missing.push(name);
  sections.push(`\n${'='.repeat(72)}\n${name}\n${[...files].map(file => readFileSync(file, 'utf8')).join('\n\n')}`);
}
const frontendPackages = ['react', 'react-dom', 'scheduler', '@tauri-apps/api', 'opencc-js', '@zxing/browser', '@zxing/library', '@zxing/text-encoding', 'ts-custom-error', 'motion', 'framer-motion', 'motion-dom', 'motion-utils', 'tslib'];
for (const name of frontendPackages) {
  const directory = join(root, ...(['@zxing/browser', '@zxing/library'].includes(name) ? ['apps', 'desktop', 'node_modules'] : ['node_modules']), name);
  const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  append(`${name} ${pkg.version} — ${pkg.license}`, directory);
}
sections.push('\nOpenCC dictionary notices\n' + readFileSync(join(root, 'node_modules/opencc-js/THIRD_PARTY_LICENSES.md'), 'utf8'));
sections.push('\nThree.js\n' + readFileSync(join(root, 'packages/atelier-model-runtime/src/discs/interactive/vendor/THREE-LICENSE.txt'), 'utf8'));
for (const pkg of metadata.packages.filter(pkg => pkg.source).sort((a, b) => a.name.localeCompare(b.name))) {
  const directory = dirname(pkg.manifest_path);
  let source = pkg.repository || '';
  const provenance = join(directory, '.cargo_vcs_info.json');
  if (source && existsSync(provenance)) {
    const vcs = JSON.parse(readFileSync(provenance, 'utf8'));
    if (vcs.git?.sha1) source += `/tree/${vcs.git.sha1}/${vcs.path_in_vcs || ''}`;
  }
  append(`${pkg.name} ${pkg.version} — ${pkg.license || 'see supplied license'}\nSource: ${source}`,
    directory, pkg.license_file, supplemental[pkg.name]);
}
writeFileSync(join(root, 'apps/desktop/public/legal/THIRD-PARTY-NOTICES.txt'), sections.join('\n'), 'utf8');
console.log(JSON.stringify({ packages: metadata.packages.filter(pkg => pkg.source).length + frontendPackages.length + 1, missingLicenseFiles: missing }));
if (missing.length) process.exitCode = 1;
