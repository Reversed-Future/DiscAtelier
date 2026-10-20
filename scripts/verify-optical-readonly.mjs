import { desktopHarness } from './desktop-harness.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// This is a hardware-specific acceptance check for the user's inserted BD.
// It reads only the index metadata from F:, never writes to the disc.
const index = 'F:/BDMV/index.bdmv';
const hash = async () => createHash('sha256').update(await readFile(index)).digest('hex');
const before = await hash();
const h = await desktopHarness('optical-readonly', process.argv[2]);
const checks = [];
try {
  const page = await h.start();
  const invoke = (command, args) => page.evaluate(({ command, args }) =>
    window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const drives = await invoke('optical_list');
  const drive = drives.find(value => value.mountPoint === 'F:');
  assert.equal(drive?.status, 'ready');
  assert.equal(drive.medium.kind, 'bluray');
  assert.equal(drive.medium.label, 'BDROM');
  assert.equal(drive.medium.playlists.length, 23);
  checks.push('真实光驱 F: 与 BD 的 23 个播放列表可读取');

  const rejectedProbe = args => page.evaluate(async args => {
    try { return { value: await window.__TAURI_INTERNALS__.invoke('optical_probe', args) }; }
    catch (error) { return { error }; }
  }, args);
  assert.equal((await rejectedProbe({ mountPoint: 'F:', token: 'invalid-test-token', playlist: '00000.mpls' })).error?.code, 'mediaChanged');
  assert.equal((await rejectedProbe({ mountPoint: index, token: drive.medium.token, playlist: '00000.mpls' })).error?.code, 'mediaChanged');
  assert.equal((await rejectedProbe({ mountPoint: 'F:', token: drive.medium.token, playlist: '../index.bdmv' })).error?.code, 'mediaChanged');
  checks.push('过期介质标记和非枚举光驱路径在启动诊断前被拒绝');

  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '光驱', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '光驱', exact: true });
  await h.expect(panel.getByText(drive.name, { exact: true })).toBeVisible();
  await h.expect(panel.getByText('未确认', { exact: true })).toBeVisible();
  const start = performance.now();
  await panel.getByRole('button', { name: '检查播放', exact: true }).click();
  await h.expect(panel.getByRole('status')).toHaveText('检测到 AACS 加密，缺少 libaacs，当前无法打开这张 BD。', { timeout: 30000 });
  const probeMs = performance.now() - start;
  checks.push('真实 MPV 报错显示为缺少 libaacs；不显示可播放或全区成功');
  await panel.getByRole('button', { name: '诊断记录', exact: true }).click();
  await h.expect(panel.locator('.optical-log')).toHaveCSS('opacity', '1');
  const log = await panel.locator('pre').innerText();
  assert.ok(log.includes('AACS encryption detected but cannot find libaacs.'));
  await page.screenshot({ path: `${h.directory}/diagnostic.png` });
  await panel.getByRole('button', { name: '诊断记录', exact: true }).click();
  await h.expect(panel.locator('.optical-log')).toHaveCSS('opacity', '0');
  await page.keyboard.press('Escape');
  await h.expect(panel).toHaveCount(0);
  checks.push('诊断记录展开／收起及 Escape 关闭完成');

  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '播放设置' });
  await h.expect(settings.getByLabel('MPV', { exact: true })).toBeEnabled();
  await settings.getByLabel('MPV', { exact: true }).fill('C:\\Program Files\\MPV Player\\mpv.exe');
  await settings.getByLabel('MakeMKV', { exact: true }).fill('D:\\Program Files\\MakeMKV\\libmmbd64.dll');
  await settings.getByRole('button', { name: '保存', exact: true }).click();
  await h.expect(settings.getByRole('button', { name: '已保存', exact: true })).toBeVisible();
  const configured = await invoke('playback_settings_get');
  assert.equal(configured.makeMkvLibrary, 'D:\\Program Files\\MakeMKV\\libmmbd64.dll');
  await page.keyboard.press('Escape');
  await h.expect(settings).toHaveCount(0);
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '光驱', exact: true }).click();
  await h.expect(panel.getByRole('combobox', { name: '播放列表' })).toHaveText('00000.mpls');
  const decodeStart = performance.now();
  await panel.getByRole('button', { name: '检查播放', exact: true }).click();
  await h.expect(panel.getByRole('status')).toHaveText('首帧解码通过；完整播放与菜单尚未验证。', { timeout: 55000 });
  const decodeMs = performance.now() - decodeStart;
  await panel.getByRole('button', { name: '诊断记录', exact: true }).click();
  await h.expect(panel.locator('.optical-log')).toHaveCSS('opacity', '1');
  const decodedLog = await panel.locator('pre').innerText();
  assert.ok(decodedLog.includes('VO: [null] 1920x1080'));
  await page.screenshot({ path: `${h.directory}/makemkv-decoded.png` });
  checks.push('从设置保存本机 MakeMKV 库后，应用内 00000.mpls 首帧解码通过');
  await h.stop();
  const restarted = await h.start();
  const persisted = await restarted.evaluate(() => window.__TAURI_INTERNALS__.invoke('playback_settings_get'));
  assert.deepEqual(persisted, configured);
  checks.push('播放设置经原生进程重启保留，使用隔离测试目录');
  const after = await hash();
  assert.equal(after, before);
  checks.push('读盘前后 index.bdmv 哈希一致（仅此文件，不声称全盘校验）');
  assert.deepEqual(h.errors, []);
  await writeFile(`${h.directory}/results.json`, JSON.stringify({ checks, drive, probeMs, log, decodeMs, decodedLog, indexHash: before, errors: h.errors }, null, 2));
  console.log(JSON.stringify({ directory: h.directory, checks, probeMs, decodeMs }, null, 2));
} finally {
  await h.stop();
}
