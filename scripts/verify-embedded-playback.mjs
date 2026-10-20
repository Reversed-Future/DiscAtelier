import { desktopHarness } from './desktop-harness.mjs';
import { copyFile, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Synthetic local media only. This test never invokes optical_list or optical_probe.
const h = await desktopHarness('embedded-playback', process.argv[2]);
await copyFile(process.argv[3], `${h.directory}/playback-fixture.mkv`);
const python = process.argv[4];
const checks = [], evidence = {};
let page, keepOpen = false;
const invoke = (command, args) => page.evaluate(({ command, args }) =>
  window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
const snapshot = () => invoke('playback_snapshot');
const startArgs = { mountPoint: 'test-video', token: 'local-fixture-v1', playlist: '00000.mpls', resumeSeconds: 0 };
async function waitState(predicate, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const state = await snapshot();
    if (predicate(state)) return state;
    if (state?.phase === 'failed') throw Error(JSON.stringify(state));
    await delay(100);
  }
  throw Error(`State timeout: ${JSON.stringify(await snapshot())}`);
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
const inspect = async (pid, host) => JSON.parse((await promisify(execFile)(python,
  [fileURLToPath(new URL('./inspect-video-window.py', import.meta.url)), String(pid), String(host)], { windowsHide: true })).stdout);
async function geometry(pid, host) {
  const native = await inspect(pid, host);
  const dom = await page.locator('.player-picture').evaluate(el => {
    const r = el.getBoundingClientRect(), d = devicePixelRatio;
    return { x: Math.round(r.x*d), y: Math.round(r.y*d), width: Math.round(r.width*d), height: Math.round(r.height*d) };
  });
  await writeFile(`${h.directory}/latest-geometry.json`,JSON.stringify({native,dom},null,2));
  assert.equal(native.host.className, 'DiscAtelierVideoSurface');
  assert.equal(native.host.visible, true);
  assert.equal(native.owner.pid, h.pid);
  assert.equal(native.topLevel.filter(w => w.visible).length, 0);
  assert.ok(native.video.some(w => w.visible && w.parent === host));
  for (const field of ['x', 'y', 'width', 'height']) {
    const expected = dom[field] + (field === 'x' || field === 'y' ? native.owner.client[field] : 0);
    assert.ok(Math.abs(native.host.rect[field] - expected) <= 1, `${field}: ${native.host.rect[field]} != ${expected}`);
  }
  return { native, dom };
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function gone(pid) {
  for (let i=0; i<60 && alive(pid); i++) await delay(100);
  assert.equal(alive(pid), false);
}
try {
  page = await h.start();
  await writeFile(`${h.directory}/session.json`, JSON.stringify({ directory: h.directory, port: h.port, pid: h.pid }));
  await invoke('playback_settings_save', { settings: { mpvExecutable: 'C:\\Program Files\\MPV Player\\mpv.exe', makeMkvLibrary: '' } });
  const started = performance.now();
  await invoke('playback_start', startArgs);
  await page.getByRole('button', { name: '打开播放器', exact: true }).click();
  const playing = await waitState(s => s?.phase === 'playing' && s.positionSeconds >= 1 && s.audioTracks.length === 2);
  evidence.openMs = performance.now()-started;
  const pid = await ipc(playing.sessionId, ['get_property', 'pid']);
  const host = Number(await ipc(playing.sessionId, ['get_property', 'options/wid']));
  assert.ok(host > 0);
  evidence.outputs = { video: await ipc(playing.sessionId, ['get_property', 'current-vo']), audio: await ipc(playing.sessionId, ['get_property', 'current-ao']) };
  assert.equal(evidence.outputs.video, 'gpu-next');
  assert.equal(evidence.outputs.audio, 'wasapi');
  await ipc(playing.sessionId, ['set_property', 'mute', true]);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const paused = await waitState(s => s?.phase === 'paused');
  await delay(1100);
  assert.ok(Math.abs((await snapshot()).positionSeconds-paused.positionSeconds)<0.1);
  evidence.normal = await geometry(pid, host);
  checks.push('本地合成视频通过 gpu-next / wasapi 输出；MPV 仅为应用内子窗口；暂停位置稳定');
  console.log(checks.at(-1));
  if (process.argv.includes('--preview')) {
    keepOpen = true;
    await writeFile(`${h.directory}/preview.json`, JSON.stringify({ pid: h.pid, port: h.port, host, playerPid: pid, evidence }, null, 2));
    console.log(JSON.stringify({ directory: h.directory, pid: h.pid, port: h.port }));
    await new Promise(() => {});
  }
  const slider = page.getByRole('slider', { name: '播放进度' });
  await h.expect(slider).toBeEnabled();
  const bounds = await slider.boundingBox();
  await page.mouse.move(bounds.x+5,bounds.y+bounds.height/2);
  await page.mouse.down();
  await page.mouse.move(bounds.x+bounds.width*.42,bounds.y+bounds.height/2,{steps:5});
  const target = Number(await slider.inputValue());
  evidence.dragInput = { bounds, target };
  await page.mouse.up();
  const sought = await waitState(s => !s.seeking && Math.abs(s.positionSeconds-target)<0.2);
  assert.ok(sought.positionSeconds>30 && sought.watchedSeconds<5);
  evidence.seek = { target, actual: sought.positionSeconds };
  await page.getByRole('combobox', { name: '音轨' }).click();
  const option = page.getByRole('option', { name: '2 · 音轨二', exact: true });
  await h.expect(option).toBeVisible();
  const menu = await page.locator('[role=listbox]:popover-open').boundingBox();
  const picture = await page.locator('.player-picture').boundingBox();
  assert.ok(menu.y>=picture.y+picture.height || menu.y+menu.height<=picture.y);
  await option.click();
  await waitState(s => s?.selectedAudio===2);
  assert.equal(await ipc(playing.sessionId,['get_property','aid']),2);
  checks.push('真实鼠标拖动后解码位置一致；音轨 1→2 回读正确，菜单不覆盖原生画面');
  console.log(checks.at(-1));
  await page.getByRole('button', { name: '全屏', exact: true }).click();
  await h.expect(page.getByRole('button',{name:'退出全屏',exact:true})).toBeVisible();
  await delay(500);
  evidence.fullscreen = await geometry(pid, host);
  assert.ok(evidence.fullscreen.dom.width>evidence.normal.dom.width);
  assert.equal(evidence.fullscreen.dom.x,0);
  assert.equal(evidence.fullscreen.dom.y,0);
  assert.equal(evidence.fullscreen.dom.width,evidence.fullscreen.native.owner.client.width);
  assert.equal(evidence.fullscreen.dom.height,evidence.fullscreen.native.owner.client.height);
  const view = page.locator('.player-view');
  await page.mouse.move(400,300);
  await h.expect(view).toHaveAttribute('data-controls','false',{timeout:5000});
  await delay(300);
  evidence.fullscreenHidden = await geometry(pid,host);
  assert.deepEqual(evidence.fullscreenHidden.dom,evidence.fullscreen.dom);
  assert.deepEqual(evidence.fullscreenHidden.native.clip,{x:0,y:0,width:evidence.fullscreen.dom.width,height:evidence.fullscreen.dom.height});
  await page.mouse.move(430,330);
  await h.expect(view).toHaveAttribute('data-controls','true');
  await delay(300);
  assert.deepEqual((await geometry(pid,host)).dom,evidence.fullscreen.dom);
  await page.keyboard.press('Escape');
  await h.expect(page.getByRole('button',{name:'全屏',exact:true})).toBeVisible();
  await delay(400);
  evidence.restored = await geometry(pid, host);
  assert.deepEqual(evidence.restored.dom,evidence.normal.dom);
  checks.push('全屏视频覆盖整个客户区；静止后标题与控制条收起，移动后重现且视频尺寸不变；Esc 还原尺寸');
  console.log(checks.at(-1));
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await waitState(s=>s?.phase==='playing' && s.positionSeconds>sought.positionSeconds+1);
  await page.getByRole('button',{name:'返回',exact:true}).click();
  await h.expect(page.locator('.player-view')).toHaveCount(0);
  await h.expect(page.getByRole('button',{name:'音乐',exact:true})).toBeVisible();
  const hidden = await waitState(s=>s?.phase==='paused');
  assert.equal((await inspect(pid,host)).host.visible,false);
  for(let i=0;i<3;i++) {
    await page.getByRole('button',{name:'打开播放器',exact:true}).click();
    await h.expect(page.getByRole('button',{name:'继续',exact:true})).toBeVisible();
    await delay(150);
    await geometry(pid,host);
    assert.equal((await snapshot()).sessionId,playing.sessionId);
    assert.ok(Math.abs((await snapshot()).positionSeconds-hidden.positionSeconds)<0.1);
    await page.keyboard.press('Escape');
    await h.expect(page.locator('.player-view')).toHaveCount(0);
    assert.equal((await inspect(pid,host)).host.visible,false);
  }
  checks.push('返回收藏自动暂停并隐藏视频；连续三次重新打开/返回不丢位置、不残留画面');
  console.log(checks.at(-1));
  await page.getByRole('button',{name:'打开播放器',exact:true}).click();
  await page.getByRole('button',{name:'停止',exact:true}).click();
  const stopped = await waitState(s=>s?.phase==='stopped');
  await gone(pid);
  await h.expect(page.locator('.player-picture')).toHaveText('已停止');
  assert.equal((await inspect(pid,host)).host.visible,false);
  const history = await invoke('playback_history');
  assert.equal(history.length,1);
  assert.equal(history[0].selectedAudio,2);
  assert.equal(history[0].completed,false);
  evidence.history = history;
  await h.stop();
  page = await h.start();
  assert.deepEqual(await invoke('playback_history'),history);
  await invoke('playback_start',{...startArgs,resumeSeconds:stopped.positionSeconds});
  const resumed = await waitState(s=>s?.phase==='playing' && s.positionSeconds>=stopped.positionSeconds);
  const resumePid = await ipc(resumed.sessionId,['get_property','pid']);
  await ipc(resumed.sessionId,['set_property','mute',true]);
  await h.stop();
  await gone(resumePid);
  page = await h.start();
  assert.equal((await invoke('playback_history')).find(r=>r.sessionId===resumed.sessionId).phase,'interrupted');
  checks.push('停止保存音轨与位置；重启保留历史并续播；应用退出后自己的 MPV 结束');
  console.log(checks.at(-1));
  assert.deepEqual(h.errors,[]);
  await writeFile(`${h.directory}/results.json`,JSON.stringify({checks,evidence,media:'synthetic local file; no optical access'},null,2));
  console.log(JSON.stringify({directory:h.directory,checks},null,2));
} catch(error) {
  await writeFile(`${h.directory}/failure.json`,JSON.stringify({error:String(error),checks,evidence,snapshot:await snapshot().catch(()=>null),errors:h.errors},null,2));
  await page?.screenshot({path:`${h.directory}/failure.png`}).catch(()=>{});
  throw error;
} finally { if(!keepOpen) await h.stop(); }
