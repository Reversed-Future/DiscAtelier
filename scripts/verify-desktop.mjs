import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

if (!process.argv[2]) throw Error('Pass the absolute Playwright module path.');
const { chromium, expect } = await import(pathToFileURL(process.argv[2]).href);
const executable = fileURLToPath(new URL('../target/debug/discatelier-desktop.exe', import.meta.url));
const directory = fileURLToPath(new URL(`../artifacts/desktop-${Date.now()}/`, import.meta.url));
await mkdir(directory, { recursive: true });
const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
let processHandle, browser, page;
const errors = [];
async function checkSwitchOverflow() {
  const result = await page.evaluate(async () => {
    let maxDocument = 0, maxScene = 0, maxWidth = 0, frames = 0;
    for (let cycle = 0; cycle < 4; cycle++) {
      [...document.querySelectorAll('.categories button')].find(node => node.textContent === (cycle % 2 ? '音乐' : '影像')).click();
      const start = performance.now();
      while (performance.now() - start < 250) {
        await new Promise(requestAnimationFrame);
        const scene = document.querySelector('#scene');
        maxDocument = Math.max(maxDocument, document.documentElement.scrollHeight - innerHeight);
        maxScene = Math.max(maxScene, scene.scrollHeight - scene.clientHeight);
        maxWidth = Math.max(maxWidth, document.documentElement.scrollWidth - innerWidth);
        frames++;
      }
    }
    return { maxDocument, maxScene, maxWidth, frames };
  });
  assert.equal(result.maxDocument, 0);
  assert.equal(result.maxScene, 0);
  assert.equal(result.maxWidth, 0);
  return result;
}
async function start() {
  processHandle = spawn(executable, [], {
    windowsHide: true,
    env: { ...process.env, DISCATELIER_TEST_DATA_DIR: directory, WEBVIEW2_USER_DATA_FOLDER: `${directory}/webview`, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  processHandle.stderr.on('data', value => { logs += value; });
  processHandle.stdout.on('data', value => { logs += value; });
  for (let attempt = 0; attempt < 60; attempt++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }); break; }
    catch { if (processHandle.exitCode !== null) throw Error(`App exited: ${logs}`); await delay(250); }
  }
  if (!browser) throw Error(`WebView2 debug connection failed: ${logs}`);
  page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].waitForEvent('page');
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByRole('button', { name: '音乐', exact: true })).toBeVisible();
}
async function stop() {
  await browser?.close();
  browser = undefined;
  if (processHandle && processHandle.exitCode === null) {
    const exited = new Promise(resolve => processHandle.once('exit', resolve));
    processHandle.kill();
    await exited;
  }
}
async function choose(label, option, scope = page) {
  await scope.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function settle() {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))); });
}
try {
  await start();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.fonts.check('14px MiSans', '音乐收藏')), true);
  assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).fontFamily.includes('MiSans')), true);
  await expect(page.getByText('还没有音乐收藏', { exact: true })).toBeVisible();
  const emptySwitch = await checkSwitchOverflow();
  await page.locator('.topbar').getByRole('button', { name: '添加收藏', exact: true }).click();
  await page.getByRole('button', { name: '手动录入', exact: true }).click();
  const add = page.getByRole('dialog', { name: '添加收藏', exact: true });
  const title = add.getByRole('textbox', { name: '名称', exact: true });
  await title.fill('桌面持久化验证');
  assert.deepEqual(await title.evaluate(node => ({ outline: getComputedStyle(node).outlineStyle, shadow: getComputedStyle(node).boxShadow })), { outline: 'none', shadow: 'none' });
  await add.getByRole('textbox', { name: '作者', exact: true }).fill('测试作者');
  await add.getByRole('textbox', { name: '品番', exact: true }).fill('AbC-0001');
  await add.getByRole('textbox', { name: '条码', exact: true }).fill('0001234567890');
  await add.getByLabel('封面文件', { exact: true }).setInputFiles(fileURLToPath(new URL('../apps/desktop/src-tauri/icons/32x32.png', import.meta.url)));
  await add.getByRole('button', { name: '加一张', exact: true }).click();
  await choose('第 2 张载体', 'BD', add);
  await add.getByRole('button', { name: '下一步', exact: true }).click();
  await add.getByRole('textbox', { name: '价格', exact: true }).fill('99.90');
  await add.getByRole('textbox', { name: '购入日期', exact: true }).fill('2026-10-20');
  await add.getByRole('textbox', { name: '购入位置', exact: true }).fill('本地验证店铺');
  await add.getByRole('button', { name: '加入收藏', exact: true }).click();
  await expect(add).not.toBeVisible();
  await expect(page.locator('.record-caption h1')).toHaveText('桌面持久化验证');
  await expect(page.locator('.record-sleeve[data-current="true"] img')).toBeVisible();
  const populatedSwitch = await checkSwitchOverflow();
  await page.getByRole('button', { name: '取出 桌面持久化验证', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '收藏详情', exact: true });
  await expect(detail.locator('.metadata')).toContainText('CNY 99.90');
  await expect(detail.locator('.metadata')).toContainText('0001234567890');
  await detail.getByRole('button', { name: '购入', exact: true }).click();
  await detail.getByRole('textbox', { name: '价格', exact: true }).fill('128.50');
  await detail.getByRole('button', { name: '保存', exact: true }).click();
  await expect(detail.locator('.metadata')).toContainText('CNY 128.50');
  await detail.getByRole('button', { name: '再收一套', exact: true }).click();
  const duplicate = page.getByRole('dialog', { name: '再收一套', exact: true });
  await choose('状态', '想购入', duplicate);
  await duplicate.getByRole('textbox', { name: '价格', exact: true }).fill('500');
  await duplicate.getByRole('button', { name: '加入收藏', exact: true }).click();
  await expect(duplicate).not.toBeVisible();
  await expect(page.locator('.record-counter')).toHaveText('01 / 02');
  await page.getByRole('button', { name: '取出 桌面持久化验证', exact: true }).click();
  await detail.getByRole('button', { name: '编辑版本', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '编辑版本', exact: true });
  await expect(editor).toContainText('本版本共 2 套');
  await editor.getByRole('textbox', { name: '名称', exact: true }).fill('桌面版本编辑验证');
  await editor.getByRole('textbox', { name: '版本', exact: true }).fill('修订版本');
  await editor.getByLabel('封面文件', { exact: true }).setInputFiles(fileURLToPath(new URL('../apps/desktop/src-tauri/icons/64x64.png', import.meta.url)));
  await editor.getByRole('button', { name: '保存版本', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.locator('.record-caption h1')).toHaveText('桌面版本编辑验证');
  await expect(page.locator('.record-sleeve img')).toHaveCount(2);
  await page.getByRole('button', { name: '取出 桌面版本编辑验证', exact: true }).click();
  await expect(detail.locator('.metadata')).toContainText('修订版本');
  await settle();
  await page.screenshot({ path: `${directory}/edition-cover.png` });
  await detail.getByRole('button', { name: '放回', exact: true }).click();
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await expect(page.locator('.menu-totals')).toContainText('2 套 · 4 张');
  await expect(page.locator('.menu-totals')).toContainText('CNY 128.50');
  await choose('收藏范围', '已购入');
  await expect(page.locator('.record-counter')).toHaveText('01 / 01');
  await page.getByRole('button', { name: '搜索收藏', exact: true }).click();
  await page.getByRole('searchbox').fill('AbC-0001');
  await expect(page.locator('.record-counter')).toHaveText('01 / 01');
  await page.getByRole('searchbox').fill('abc-0001');
  await expect(page.getByText('没有匹配的收藏', { exact: true })).toBeVisible();
  await page.getByRole('searchbox').press('Escape');
  await expect(page.locator('.record-counter')).toHaveText('01 / 01');
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '备份收藏', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '备份已保存', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await settle();
  await page.screenshot({ path: `${directory}/desktop.png` });
  await stop();
  await start();
  await expect(page.locator('.record-counter')).toHaveText('01 / 02');
  await expect(page.locator('.record-caption h1')).toHaveText('桌面版本编辑验证');
  await expect(page.locator('.record-sleeve img')).toHaveCount(2);
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '整理', exact: true }).click();
  await expect(page.locator('.organizer tbody tr')).toHaveCount(2);
  await expect(page.locator('.organizer')).toContainText('CNY 128.50');
  await page.getByRole('button', { name: '影像', exact: true }).click();
  await expect(page.getByText('还没有影像收藏', { exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  const results = { passed: true, checks: ['native WebView2 / Rust IPC', 'MiSans and focus styling', 'multi-carrier edition', 'manual create', 'purchase update', 'independent same-edition copy', 'status filter and totals', 'exact catalog search', 'SQLite backup', 'process restart persistence', 'organizer and category isolation', 'empty and populated switch frame overflow', 'cover import and replacement', 'shared edition editing', 'cover and edition restart persistence'], emptySwitch, populatedSwitch, errors, directory };
  await writeFile(`${directory}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} catch (error) {
  if (page) { await page.screenshot({ path: `${directory}/failure.png` }).catch(() => {}); console.error(await page.locator('body').innerText().catch(() => '')); }
  throw error;
} finally { await stop(); }
