// Run against a VitePress production preview; never accesses a collection database.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
if (process.argv.length !== 5) throw Error('Usage: node verify-vitepress.mjs <base URL> <playwright module> <browser executable>');
const base = process.argv[2].replace(/\/$/, '');
const {chromium} = await import(pathToFileURL(resolve(process.argv[3])).href);
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(root, 'artifacts/vitepress-verification');
await mkdir(output, {recursive: true});
const pages = JSON.parse(await readFile(resolve(root, 'docs/model-dev/pages.json'), 'utf8'));
const browser = await chromium.launch({executablePath: resolve(process.argv[4]), headless: true});
const result = {framework: 'VitePress 1.6.4', pages: 0, localLinks: 0, search: false, mobile: false, promptCopy: false};
try {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const links = new Set();
  for (const entry of pages) {
    await page.goto(`${base}/${entry.id === 'index' ? '' : entry.id + '.html'}`);
    await page.waitForSelector('.VPDoc');
    assert((await page.locator('h1').textContent()).includes(entry.title));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const href of await page.locator('a[href]').evaluateAll(nodes => nodes.map(a => a.href))) {
      if (href.startsWith(base)) links.add(href.split('#')[0]);
    }
    result.pages++;
  }
  for (const link of links) {
    const response = await context.request.get(link);
    assert(response.ok(), `Broken link ${link}: ${response.status()}`);
    result.localLinks++;
  }
  await page.goto(`${base}/ai-authoring.html`);
  await page.screenshot({path: resolve(output, 'ai-authoring-desktop.png'), fullPage: true});
  const copy = page.locator('.vp-doc div[class*="language-"] button.copy').first();
  await copy.click();
  assert((await page.evaluate(() => navigator.clipboard.readText())).includes('$discatelier-model-author'));
  result.promptCopy = true;
  await page.getByRole('button', {name: '搜索文档', exact: true}).click();
  await page.locator('#localsearch-input').fill('stateReset');
  await page.locator('.VPLocalSearchBox .result').first().waitFor();
  await page.locator('.VPLocalSearchBox .result').first().click();
  await page.locator('.VPLocalSearchBox').waitFor({state: 'hidden'});
  result.search = true;
  await page.goto(`${base}/quickstart.html`);
  const [playground] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', {name: '打开教学模型', exact: true}).click()
  ]);
  playground.on('pageerror', error => errors.push(error.message));
  await playground.waitForLoadState();
  await playground.getByRole('button', {name: '构建制作源', exact: true}).click();
  await playground.waitForFunction(() => !!window.authoringPreview?.runtime);
  assert.equal(await playground.locator('#viewport canvas').count(), 1);
  assert(await playground.getByRole('button', {name: '导出当前包', exact: true}).isEnabled());
  result.playground = true;
  await playground.close();
  await page.goto(base + '/');
  const palette = await page.evaluate(() => {
    const theme = getComputedStyle(document.documentElement);
    const keys = ['--vp-c-brand-1', '--vp-c-brand-2', '--vp-c-brand-3', '--vp-c-bg', '--vp-c-bg-alt', '--vp-c-bg-soft'];
    return Object.fromEntries(keys.map(key => [key, theme.getPropertyValue(key).trim()]));
  });
  for (const [key, color] of Object.entries(palette)) {
    assert.match(color, /^#[0-9a-f]{6}$/i, key);
    assert(color.slice(1, 3) === color.slice(3, 5) && color.slice(3, 5) === color.slice(5, 7), key);
  }
  result.monochrome = true;
  await page.screenshot({path: resolve(output, 'manual-desktop.png'), fullPage: true});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto(`${base}/ai-authoring.html`);
  await page.locator('.VPLocalNav button.menu').click();
  await page.locator('.VPSidebar').getByRole('link', {name: 'V2 格式参考', exact: true}).click();
  await page.waitForURL('**/format.html');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({path: resolve(output, 'manual-mobile.png'), fullPage: true});
  result.mobile = true;
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
