import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { mkdir, appendFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export async function desktopHarness(name, playwrightPath, environment = {}, executable = process.env.DISCATELIER_TEST_EXECUTABLE || new URL('../target/debug/discatelier-desktop.exe', import.meta.url)) {
  const { chromium, expect } = await import(pathToFileURL(playwrightPath).href);
  const directory = process.env.DISCATELIER_ARTIFACT_ROOT
    ? join(process.env.DISCATELIER_ARTIFACT_ROOT, `${name}-${Date.now()}`)
    : fileURLToPath(new URL(`../artifacts/${name}-${Date.now()}/`, import.meta.url));
  await mkdir(directory, { recursive: true });
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  let processHandle, browser, page;
  const errors = [];
  async function start() {
    processHandle = spawn(executable instanceof URL ? fileURLToPath(executable) : executable, [], {
      windowsHide: true,
      env: { ...process.env, ...environment, DISCATELIER_TEST_DATA_DIR: directory, DISCATELIER_PROFILE_LOG: `${directory}/timings.ndjson`, WEBVIEW2_USER_DATA_FOLDER: `${directory}/webview`, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    processHandle.stderr.on('data', value => { logs += value; });
    processHandle.stdout.on('data', value => { logs += value; });
    processHandle.once('exit', (code, signal) => {
      void appendFile(`${directory}/process.log`, `exit=${code} signal=${signal}\n${logs}\n`).catch(() => {});
    });
    for (let attempt = 0; attempt < 60; attempt++) {
      try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }); break; }
      catch { if (processHandle.exitCode !== null) throw Error(logs); await delay(250); }
    }
    if (!browser) throw Error(`WebView2 unavailable: ${logs}`);
    page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].waitForEvent('page');
    page.on('pageerror', error => errors.push(error.message));
    try { await expect(page.getByRole('button', { name: '音乐', exact: true })).toBeVisible({ timeout: 15000 }); }
    catch (error) {
      await writeFile(`${directory}/startup.json`, JSON.stringify({ url: page.url(), errors, html: await page.content() }, null, 2));
      await page.screenshot({ path: `${directory}/startup.png` }).catch(() => {});
      throw error;
    }
    return page;
  }
  async function stop() {
    await browser?.close();
    browser = undefined;
    if (processHandle && processHandle.exitCode === null) {
      const exited = new Promise(resolve => processHandle.once('exit', resolve));
      processHandle.kill(); await exited;
      processHandle = undefined;
    }
  }
  return { start, stop, directory, errors, expect, port, get pid() { return processHandle?.pid; } };
}
