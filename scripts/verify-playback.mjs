import { desktopHarness } from './desktop-harness.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createConnection } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

// Hardware acceptance on the inserted disc. Only index metadata and playback reads.
const index = 'F:/BDMV/index.bdmv';
const hash = async () => createHash('sha256').update(await readFile(index)).digest('hex');
const before = await hash();
const h = await desktopHarness('playback', process.argv[2]);
const checks = [], evidence = {};
const powershell = script => promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
let page;
const invoke = (command, args) => page.evaluate(({ command, args }) =>
  window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
const snapshot = () => invoke('playback_snapshot');
async function waitState(predicate, timeout = 65000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const value = await snapshot();
    if (predicate(value)) return value;
    if (value?.phase === 'failed') throw Error(JSON.stringify(value));
    await delay(150);
  }
  throw Error(`State timeout: ${JSON.stringify(await snapshot())}`);
}
async function rejected(command, args, code) {
  const result = await page.evaluate(async ({ command, args }) => {
    try { return { value: await window.__TAURI_INTERNALS__.invoke(command, args) }; }
    catch (error) { return { error }; }
  }, { command, args });
  assert.equal(result.error?.code, code, JSON.stringify(result));
}
async function ipc(sessionId, command) {
  const socket = createConnection(`\\\\.\\pipe\\discatelier-${sessionId}`);
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => { socket.destroy(); reject(Error('Inspector timeout')); }, 5000);
    socket.once('error', error => { clearTimeout(timer); reject(error); });
    socket.once('connect', () => socket.write(JSON.stringify({ command, request_id: 901, async: true }) + '\n'));
    socket.on('data', bytes => {
      buffer += bytes;
      for (;;) {
        const end = buffer.indexOf('\n'); if (end < 0) break;
        const value = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
        if (value.request_id === 901) {
          clearTimeout(timer); socket.destroy();
          value.error === 'success' ? resolve(value.data) : reject(Error(JSON.stringify(value)));
        }
      }
    });
  });
}
async function openPanel() {
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '光驱', exact: true }).click();
  await h.expect(page.getByRole('combobox', { name: '播放列表' })).toBeEnabled({ timeout: 15000 });
}
const control = (session, value) => invoke('playback_control', { sessionId: session.sessionId, control: value });
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function gone(pid) { for (let i = 0; i < 60 && alive(pid); i++) await delay(100); assert.equal(alive(pid), false); }
try {
  page = await h.start();
  await invoke('playback_settings_save', { settings: {
    mpvExecutable: 'C:\\Program Files\\MPV Player\\mpv.exe',
    makeMkvLibrary: 'D:\\Program Files\\MakeMKV\\libmmbd64.dll',
  } });
  const drive = (await invoke('optical_list')).find(d => d.mountPoint === 'F:');
  assert.equal(drive?.medium?.kind, 'bluray');
  assert.ok(drive.medium.playlists.includes('00000.mpls'));
  const startArgs = { mountPoint: drive.mountPoint, token: drive.medium.token, playlist: '00000.mpls', resumeSeconds: 0 };
  await openPanel();
  const start = performance.now();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  const playing = await waitState(s => s?.phase === 'playing' && s.positionSeconds >= 2 && s.audioTracks.length === 3);
  evidence.openMs = performance.now() - start;
  evidence.playing = playing;
  const playerPid = await ipc(playing.sessionId, ['get_property', 'pid']);
  assert.ok(alive(playerPid));
  evidence.outputs = {
    video: await ipc(playing.sessionId, ['get_property', 'current-vo']),
    audio: await ipc(playing.sessionId, ['get_property', 'current-ao']),
  };
  assert.ok(evidence.outputs.video && evidence.outputs.video !== 'null');
  assert.ok(evidence.outputs.audio && evidence.outputs.audio !== 'null');
  // Silence only this test session after actual audio output has opened.
  await ipc(playing.sessionId, ['set_property', 'mute', true]);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const paused = await waitState(s => s?.phase === 'paused');
  await delay(1600);
  const held = await snapshot();
  assert.ok(Math.abs(held.positionSeconds - paused.positionSeconds) < 0.1);
  assert.ok(Math.abs(held.watchedSeconds - paused.watchedSeconds) < 0.1);
  evidence.paused = held;
  checks.push('真实 BD 打开视频与音频输出；暂停后位置和观看时长停止增长');
  console.log(checks.at(-1));

  const slider = page.getByRole('slider', { name: '播放进度' });
  await h.expect(slider).toBeEnabled();
  const bounds = await slider.boundingBox();
  // Real pointer drag through the custom-styled range; assert the decoded position afterwards.
  await page.mouse.move(bounds.x + 5, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.08, bounds.y + bounds.height / 2, { steps: 6 });
  const dragged = Number(await slider.inputValue());
  evidence.dragTarget = dragged;
  console.log(JSON.stringify({ dragged, bounds }));
  await page.mouse.up();
  const committed = dragged;
  const sought = await waitState(s => s?.phase === 'paused' && !s.seeking && Math.abs(s.positionSeconds - committed) < 1);
  assert.ok(sought.positionSeconds > 100);
  assert.ok(sought.watchedSeconds - paused.watchedSeconds < 0.5);
  evidence.drag = { target: committed, actual: sought.positionSeconds, watched: sought.watchedSeconds };
  await page.getByRole('combobox', { name: '音轨' }).click();
  await page.getByRole('option', { name: '2 · jpn', exact: true }).click();
  const audio = await waitState(s => s?.selectedAudio === 2);
  assert.equal(await ipc(audio.sessionId, ['get_property', 'aid']), 2);
  evidence.audio = audio.audioTracks;
  checks.push('鼠标拖动后实际播放位置一致，跳过的内容不计入观看时长；音轨 1→2 经 MPV 回读确认');
  console.log(checks.at(-1));
  await page.screenshot({ path: `${h.directory}/controls.png` });

  await rejected('playback_start', startArgs, 'player');
  await rejected('optical_probe', { mountPoint: drive.mountPoint, token: drive.medium.token, playlist: startArgs.playlist }, 'player');
  await rejected('library_restore', { token: 'test-invalid-restore' }, 'player');
  await rejected('playback_control', { sessionId: 'test-stale-session', control: { action: 'stop' } }, 'session');
  await rejected('playback_control', { sessionId: audio.sessionId, control: { action: 'seek', seconds: -1 } }, 'validation');
  await rejected('playback_control', { sessionId: audio.sessionId, control: { action: 'audio', id: 99999 } }, 'validation');
  await page.keyboard.press('Escape');
  await h.expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.playback-return').click();
  await h.expect(page.getByRole('button', { name: '继续', exact: true })).toBeVisible();
  assert.equal((await snapshot()).sessionId, audio.sessionId);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await waitState(s => s?.phase === 'playing' && s.positionSeconds >= sought.positionSeconds + 3);
  await page.getByRole('button', { name: '停止', exact: true }).click();
  const stopped = await waitState(s => s?.phase === 'stopped');
  await gone(playerPid);
  const history = await invoke('playback_history');
  assert.equal(history.length, 1);
  assert.equal(history[0].sessionId, stopped.sessionId);
  assert.equal(history[0].phase, 'stopped');
  assert.equal(history[0].completed, false);
  assert.equal(history[0].selectedAudio, 2);
  assert.ok(history[0].watchedSeconds < 30 && history[0].watchedSeconds > 1);
  evidence.history = history;
  await page.getByRole('button', { name: '播放历史', exact: true }).click();
  await h.expect(page.getByRole('button', { name: '继续播放', exact: true })).toBeVisible();
  await page.screenshot({ path: `${h.directory}/history.png` });
  checks.push('收起控制面板不打断播放；并发播放、播放中恢复与非法控制被拒绝；停止保存一条历史并结束 MPV');
  console.log(checks.at(-1));

  await h.stop();
  page = await h.start();
  assert.deepEqual(await invoke('playback_history'), history);
  await openPanel();
  await page.getByRole('button', { name: '播放历史', exact: true }).click();
  await page.getByRole('button', { name: '继续播放', exact: true }).click();
  const resumed = await waitState(s => s?.phase === 'playing' && s.positionSeconds >= stopped.positionSeconds && s.positionSeconds < stopped.positionSeconds + 8);
  await ipc(resumed.sessionId, ['set_property', 'mute', true]);
  const resumedPid = await ipc(resumed.sessionId, ['get_property', 'pid']);
  await waitState(s => s?.watchedSeconds >= 6);
  evidence.resumed = await snapshot();
  await h.stop(); // Simulate application crash, not a graceful Stop.
  await gone(resumedPid);
  page = await h.start();
  const recovered = (await invoke('playback_history')).find(r => r.sessionId === resumed.sessionId);
  assert.equal(recovered.phase, 'interrupted');
  assert.ok(recovered.positionSeconds >= stopped.positionSeconds);
  assert.ok(recovered.watchedSeconds > 0);
  evidence.recovered = recovered;
  checks.push('重启后历史保留并从停止位置续播；应用异常退出后 MPV 随 Job 结束，历史恢复为中断');
  console.log(checks.at(-1));

  const loading = await invoke('playback_start', startArgs);
  const cancelTime = performance.now();
  await control(loading, { action: 'stop' });
  await waitState(s => s?.phase === 'stopped', 7000);
  evidence.cancelMs = performance.now() - cancelTime;
  checks.push('读取阶段可停止，不需要等到 BD 打开完成');
  console.log(checks.at(-1));

  const closing = await invoke('playback_start', startArgs);
  await waitState(s => s?.phase === 'playing');
  await ipc(closing.sessionId, ['set_property', 'mute', true]);
  const closingPid = await ipc(closing.sessionId, ['get_property', 'pid']);
  assert.ok(Number.isInteger(closingPid));
  const nativeClose = await powershell(`$playbackWindow = Get-Process -Id ${closingPid}; if ($playbackWindow.Path -ne 'C:\\Program Files\\MPV Player\\mpv.exe') { throw 'Unexpected player' }; $playbackWindow.CloseMainWindow()`);
  assert.equal(nativeClose.stdout.trim(), 'True');
  await waitState(s => s?.phase === 'stopped');
  await gone(closingPid);
  checks.push('直接关闭 MPV 原生窗口后，会话结束并保存历史');
  console.log(checks.at(-1));

  const exiting = await invoke('playback_start', startArgs);
  await waitState(s => s?.phase === 'playing' && s.positionSeconds > 1);
  await ipc(exiting.sessionId, ['set_property', 'mute', true]);
  const exitPid = await ipc(exiting.sessionId, ['get_property', 'pid']);
  assert.ok(Number.isInteger(exitPid));
  const application = JSON.parse((await powershell(`Get-CimInstance Win32_Process -Filter 'ProcessId = ${exitPid}' | Select-Object ParentProcessId | ConvertTo-Json -Compress`)).stdout);
  assert.ok(Number.isInteger(application.ParentProcessId));
  const expectedExecutable = process.env.DISCATELIER_TEST_EXECUTABLE.replace(/'/g, "''");
  const closeApp = await powershell(`$playbackOwner = Get-Process -Id ${application.ParentProcessId}; if ($playbackOwner.Path -ne '${expectedExecutable}') { throw 'Unexpected application' }; $playbackOwner.CloseMainWindow()`);
  assert.equal(closeApp.stdout.trim(), 'True');
  await gone(exitPid);
  await h.stop();
  page = await h.start();
  const graceful = (await invoke('playback_history')).find(row => row.sessionId === exiting.sessionId);
  assert.equal(graceful.phase, 'stopped');
  evidence.graceful = graceful;
  checks.push('关闭 DiscAtelier 原生窗口会停止自己的播放器；重新打开时历史为已停止');
  console.log(checks.at(-1));

  const ending = await invoke('playback_start', { ...startArgs, resumeSeconds: playing.durationSeconds - 3 });
  await waitState(s => s?.phase === 'ended', 65000);
  const ended = await snapshot();
  assert.equal(ended.completed, false);
  // MPV refines the estimated Blu-ray duration after decoding the final packets.
  assert.ok(Math.abs(ended.durationSeconds - playing.durationSeconds) < 1);
  assert.ok(ended.positionSeconds >= playing.durationSeconds - 4);
  evidence.ended = ended;
  checks.push('直接跳至结尾会记录自然结束，但不误标为看完；保留终点与总时长');
  assert.equal(await hash(), before);
  assert.deepEqual(h.errors, []);
  checks.push('index.bdmv 前后哈希一致；隔离测试库；无 WebView 脚本错误');
  await writeFile(`${h.directory}/results.json`, JSON.stringify({ checks, evidence, indexHash: before }, null, 2));
  console.log(JSON.stringify({ directory: h.directory, checks, openMs: evidence.openMs, cancelMs: evidence.cancelMs }, null, 2));
} catch (error) {
  await writeFile(`${h.directory}/failure.json`, JSON.stringify({ error: String(error), checks, evidence, snapshot: await snapshot().catch(() => null), errors: h.errors }, null, 2));
  await page?.screenshot({ path: `${h.directory}/failure.png` }).catch(() => {});
  throw error;
} finally { await h.stop(); }
