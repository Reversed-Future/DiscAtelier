import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const dir = await mkdtemp(join(tmpdir(), 'discatelier-overflow-'));
const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const executable = process.argv[3] || fileURLToPath(new URL('../target/debug/discatelier-desktop.exe', import.meta.url));
const app = spawn(executable, [], { windowsHide: true, env: { ...process.env, DISCATELIER_TEST_DATA_DIR: dir, WEBVIEW2_USER_DATA_FOLDER: join(dir, 'webview'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` }, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }); break; } catch { await delay(250); }
  }
  if (!browser) throw Error('WebView2 unavailable');
  const page = browser.contexts()[0].pages()[0];
  await page.getByRole('button', { name: '音乐', exact: true }).waitFor();
  const result = await page.evaluate(async () => {
    const frames = [];
    for (let cycle = 0; cycle < 4; cycle++) {
      const button = [...document.querySelectorAll('.categories button')].find(node => node.textContent === (cycle % 2 ? '音乐' : '影像'));
      button.click();
      const start = performance.now();
      while (performance.now() - start < 250) {
        await new Promise(requestAnimationFrame);
        const scene = document.querySelector('#scene');
        frames.push({ documentOverflow: document.documentElement.scrollHeight - innerHeight, sceneOverflow: scene.scrollHeight - scene.clientHeight, width: document.documentElement.scrollWidth - innerWidth });
      }
    }
    return { maxDocumentOverflow: Math.max(...frames.map(frame => frame.documentOverflow)), maxSceneOverflow: Math.max(...frames.map(frame => frame.sceneOverflow)), maxWidthOverflow: Math.max(...frames.map(frame => frame.width)), frames: frames.length };
  });
  await writeFile(join(dir, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, directory: dir }));
  if (process.env.DISCATELIER_ASSERT_NO_OVERFLOW === '1' && (result.maxDocumentOverflow > 0 || result.maxSceneOverflow > 0 || result.maxWidthOverflow > 0)) throw Error('Transient scrollbar regression');
} finally {
  await browser?.close();
  if (app.exitCode === null) { const done = new Promise(resolve => app.once('exit', resolve)); app.kill(); await done; }
}
