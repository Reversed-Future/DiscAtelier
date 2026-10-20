import { desktopHarness } from './desktop-harness.mjs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const harness = await desktopHarness('recovery-access', process.argv[2]);
const { expect, directory, errors } = harness;
let page;
async function tabTo(locator) {
  for (let step = 0; step < 60; step++) {
    if (await locator.evaluate(node => node === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw Error(`Not reachable by Tab: ${await locator.textContent()}`);
}
async function keyboardActivate(locator) { await tabTo(locator); await page.keyboard.press('Enter'); }
async function menuAction(name) {
  await keyboardActivate(page.getByRole('button', { name: '更多', exact: true }));
  if (name === '备份收藏' || name === '恢复收藏') await keyboardActivate(page.getByRole('button', { name: '设置', exact: true }));
  await keyboardActivate(page.getByRole('button', { name, exact: true }));
}
async function noHorizontalOverflow(scope) {
  assert.equal(await scope.evaluate(node => node.scrollWidth > node.clientWidth + 1), false);
}
async function screenshot(name) {
  const session = await page.context().newCDPSession(page);
  // WebView2's native zoom isn't included in Playwright's default viewport clip.
  const result = await session.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`${directory}/${name}.png`, Buffer.from(result.data, 'base64'));
  await session.detach();
}
try {
  page = await harness.start();
  let initialWidth = await page.evaluate(() => innerWidth);
  await keyboardActivate(page.locator('.topbar').getByRole('button', { name: '添加收藏', exact: true }));
  await keyboardActivate(page.getByRole('button', { name: '手动录入', exact: true }));
  let dialog = page.getByRole('dialog', { name: '添加收藏', exact: true });
  await tabTo(dialog.getByRole('textbox', { name: '名称', exact: true }));
  await page.keyboard.type('Keyboard collection');
  await dialog.getByLabel('封面文件', { exact: true }).setInputFiles(fileURLToPath(new URL('../apps/desktop/src-tauri/icons/32x32.png', import.meta.url)));
  await keyboardActivate(dialog.getByRole('button', { name: '下一步', exact: true }));
  const status = dialog.getByRole('combobox', { name: '状态', exact: true });
  await tabTo(status); await page.keyboard.press('ArrowDown'); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await expect(status).toContainText('在途');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible(); await expect(status).toBeFocused();
  await keyboardActivate(dialog.getByRole('button', { name: '加入收藏', exact: true }));
  await expect(dialog).not.toBeVisible();
  await menuAction('备份收藏');
  dialog = page.getByRole('dialog', { name: '备份已保存', exact: true });
  assert.equal(await dialog.evaluate(node => getComputedStyle(node).scrollbarWidth), 'none');
  const originalBackup = await dialog.locator('.backup-path').innerText();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: '更多', exact: true })).toBeFocused();
  // Add an independent copy after the backup so restoration must visibly replace data.
  await keyboardActivate(page.getByRole('button', { name: '取出 Keyboard collection', exact: true }));
  await keyboardActivate(page.getByRole('button', { name: '再收一套', exact: true }));
  await keyboardActivate(page.getByRole('button', { name: '加入收藏', exact: true }));
  await expect(page.locator('.record-counter')).toHaveText('01 / 02');
  await tabTo(page.getByRole('button', { name: '取出 Keyboard collection', exact: true }));
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.record-counter')).toHaveText('02 / 02');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '收藏详情', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await menuAction('恢复收藏');
  dialog = page.getByRole('dialog', { name: '恢复收藏', exact: true });
  await dialog.getByRole('textbox', { name: '备份文件路径', exact: true }).fill(originalBackup);
  await keyboardActivate(dialog.getByRole('button', { name: '检查备份', exact: true }));
  await expect(dialog).toContainText('1 套收藏');
  assert.equal(await dialog.evaluate(node => getComputedStyle(node).scrollbarWidth), 'none');
  await keyboardActivate(dialog.getByRole('button', { name: '确认恢复', exact: true }));
  await expect(page.getByRole('dialog', { name: '恢复完成', exact: true })).toBeVisible();
  const savedBeforeRestore = await page.getByRole('dialog', { name: '恢复完成', exact: true }).locator('.backup-path').innerText();
  assert.notEqual(savedBeforeRestore, originalBackup);
  await page.keyboard.press('Escape');
  await expect(page.locator('.record-counter')).toHaveText('01 / 01');
  await expect(page.locator('.record-sleeve img')).toBeVisible();
  const sizes = [];
  for (const windowSize of [{ width: 1440, height: 960 }, { width: 960, height: 680 }]) {
  await page.evaluate(value => window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: value } }), windowSize);
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(windowSize.width);
  initialWidth = windowSize.width;
  for (const zoom of [1, 1.25, 1.5, 1.75, 2]) {
    if (zoom !== 1) await page.keyboard.press('Control+=');
    await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThanOrEqual(Math.ceil(initialWidth / zoom) + 1);
    await noHorizontalOverflow(page.locator('html'));
    await keyboardActivate(page.locator('.topbar').getByRole('button', { name: '添加收藏', exact: true }));
    await keyboardActivate(page.getByRole('button', { name: '手动录入', exact: true }));
    dialog = page.getByRole('dialog', { name: '添加收藏', exact: true });
    await noHorizontalOverflow(dialog);
    await tabTo(dialog.getByRole('textbox', { name: '名称', exact: true }));
    await page.keyboard.type(`Zoom ${zoom}`);
    await keyboardActivate(dialog.getByRole('button', { name: '下一步', exact: true }));
    await noHorizontalOverflow(dialog);
    await tabTo(dialog.getByRole('button', { name: '加入收藏', exact: true }));
    await expect(dialog.getByRole('button', { name: '加入收藏', exact: true })).toBeInViewport();
    // Native dialog must trap focus; 35 Tab presses must stay inside it.
    for (let index = 0; index < 35; index++) {
      await page.keyboard.press('Tab');
      assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true);
    }
    if (zoom === 2) await screenshot(`form-${windowSize.width}-200`);
    await page.keyboard.press('Escape');
    await keyboardActivate(page.getByRole('button', { name: '取出 Keyboard collection', exact: true }));
    dialog = page.getByRole('dialog', { name: '收藏详情', exact: true });
    await noHorizontalOverflow(dialog);
    await keyboardActivate(dialog.getByRole('button', { name: '购入', exact: true }));
    await tabTo(dialog.getByRole('button', { name: '保存', exact: true }));
    await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeInViewport();
    sizes.push({ windowSize, zoom, ...await page.evaluate(() => ({ width: innerWidth, height: innerHeight })) });
    if (zoom === 2) await screenshot(`inspection-${windowSize.width}-200`);
    await page.keyboard.press('Escape');
  }
  await page.keyboard.press('Control+0');
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(initialWidth);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await keyboardActivate(page.getByRole('button', { name: '影像', exact: true }));
  assert.equal(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), 0);
  await page.keyboard.press('/');
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '搜索收藏', exact: true })).toBeFocused();
  await harness.stop(); page = await harness.start();
  await expect(page.locator('.record-counter')).toHaveText('01 / 01');
  await expect(page.locator('.record-sleeve img')).toBeVisible();
  assert.deepEqual(errors, []);
  const results = { passed: true, sizes, errors, savedBeforeRestore, directory, checks: ['keyboard-only create and duplicate', 'select arrows/End/Enter/Escape', 'gallery arrows/Enter/Escape', 'backup preview/confirm/restart with cover', 'native WebView zoom 100–200%', 'modal Tab containment and scroll reachability', 'reduced motion', 'search shortcut'] };
  await writeFile(`${directory}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} catch (error) {
  if (page) { await page.screenshot({ path: `${directory}/failure.png` }).catch(() => {}); console.error(await page.locator('body').innerText().catch(() => '')); }
  throw error;
} finally { await harness.stop(); }
