// Optional browser integration test: requires Playwright and its Chromium installation.
// All provider traffic and note content are fixtures; no personal browser profile is used.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const profile = await mkdtemp(path.join(tmpdir(), 'xhs-google-test-'));
const artifacts = process.env.BROWSER_ARTIFACTS;
if (artifacts) await mkdir(artifacts, { recursive: true });
let context;
let count = 0;
async function check(name, fn) { await fn(); console.log(`PASS ${++count}: ${name}`); }
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium',
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
    viewport: { width: 1100, height: 1000 },
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  let mode = 'success';
  let release;
  let started;
  const requests = [];
  const catalog = {
    models: [
      { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/embed-only', supportedGenerationMethods: ['embedContent'] },
    ], nextPageToken: 'page2',
  };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'chrome-extension:') return route.continue();
    if (url.host === 'www.xiaohongshu.com') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="UTF-8"><title>Local note fixture</title></head><body><h1 id="detail-title">模拟笔记</h1><div id="detail-desc">用于测试 Google 分析的虚构内容</div></body></html>' });
    if (url.host === 'generativelanguage.googleapis.com') {
      assert.equal(route.request().headers()['x-goog-api-key'], 'fake-google-key-for-tests');
      assert.ok(!url.searchParams.has('key'));
      requests.push({ pathname: url.pathname, method: route.request().method() });
      if (url.pathname.endsWith(':generateContent')) {
        if (mode === 'slow') { started(); await new Promise(resolve => { release = resolve; }); }
        if (/^error/.test(mode)) return route.fulfill({ status: Number(mode.slice(5)), json: { error: { message: 'Mock provider error' } } });
        if (mode === 'empty') return route.fulfill({ json: { candidates: [{ finishReason: 'SAFETY' }] } });
        return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: 'OK' }] } }] } });
      }
      if (mode === 'slow-list' && !url.searchParams.has('pageToken')) { started(); await new Promise(resolve => { release = resolve; }); }
      if (mode === 'list-error') return route.fulfill({ status: 403, json: { error: { message: 'Mock list denied' } } });
      return route.fulfill({ json: url.searchParams.has('pageToken') ? { models: [
        { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
      ] } : catalog });
    }
    if (url.host === 'openrouter.ai' || url.host === 'dashscope.aliyuncs.com') {
      if (url.pathname.endsWith('/models')) return route.fulfill({ json: { data: [{ id: 'fixture-model', name: 'Fixture model' }] } });
      assert.equal(route.request().headers().authorization, 'Bearer fake-google-key-for-tests');
      assert.equal(route.request().postDataJSON().model, 'fixture-model');
      return route.fulfill({ json: { choices: [{ message: { content: 'OK' } }] } });
    }
    return route.abort();
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  const openSettings = async () => {
    await page.goto(`chrome-extension://${id}/popup/settings.html`);
    await page.waitForFunction(() => document.querySelector('#apiModel').options.length > 0);
  };
  await openSettings();
  await check('fresh install preserves OpenRouter default', async () => {
    assert.equal(await page.inputValue('#apiProvider'), 'openrouter');
    assert.equal(await page.inputValue('#apiModel'), 'google/gemini-3.7-flash');
  });
  await check('Google refresh is available before connection testing and requires a key', async () => {
    await page.selectOption('#apiProvider', 'google');
    await page.locator('#btnRefreshModels').click();
    await page.waitForFunction(() => document.querySelector('#modelRefreshStatus').textContent.includes('请先填写'));
    assert.equal(requests.length, 0);
    await page.fill('#apiKey', 'fake-google-key-for-tests');
    await page.locator('#btnRefreshModels').click();
    await page.waitForFunction(() => document.querySelector('#modelRefreshStatus').textContent.includes('✅'));
    assert.equal(await page.locator('#apiModel option').count(), 2);
    assert.equal(await page.locator('#apiModel option[value="embed-only"]').count(), 0);
    assert.equal(await page.evaluate(() => apiTestStatus.success), false);
    assert.equal(await page.evaluate(async () => !!(await chrome.storage.local.get('modelCache')).modelCache?.google), false);
  });
  await check('HTTP 404 gives recovery guidance, and legacy saved model requires retesting', async () => {
    await page.evaluate(async () => {
      await chrome.storage.sync.set({ userConfig: { ...DEFAULT_CONFIG, apiConfig: { provider: 'google', apiKey: 'fake-google-key-for-tests', apiModel: 'models/gemini-2.0-flash-exp' } } });
    });
    await openSettings();
    assert.equal(await page.inputValue('#apiModel'), 'gemini-2.0-flash-exp');
    assert.match(await page.locator('#apiModel option:checked').textContent(), /重新选择/);
    assert.equal(await page.evaluate(() => apiTestStatus.success), false);
    await page.locator('#btnSave').click();
    assert.match(await page.locator('#toast').textContent(), /先测试/);
    mode = 'error404';
    await page.locator('#btnTestAPI').click();
    await page.waitForFunction(() => document.querySelector('#apiTestResult').textContent.includes('HTTP 404'));
    assert.match(await page.locator('#apiTestResult').textContent(), /刷新模型列表/);
    mode = 'success';
    await page.locator('#btnRefreshModels').click();
    await page.waitForFunction(() => document.querySelector('#modelRefreshStatus').textContent.includes('✅'));
    assert.equal(await page.inputValue('#apiModel'), 'gemini-2.0-flash-exp');
    await page.selectOption('#apiModel', 'gemini-3.5-flash-lite');
  });
  await check('valid generated text enables saving the exact tested model', async () => {
    await page.locator('#btnTestAPI').click();
    await page.waitForFunction(() => document.querySelector('#apiTestResult').className === 'success');
    await page.waitForFunction(() => !document.querySelector('#btnRefreshModels').disabled);
    await page.evaluate(() => saveSettings());
    assert.equal(await page.evaluate(async () => (await chrome.storage.sync.get('userConfig')).userConfig.apiConfig.apiModel), 'gemini-3.5-flash-lite');
    if (artifacts) await page.screenshot({ path: path.join(artifacts, 'google-settings-success.png') });
  });
  // Reload prevents the existing save-success modal from covering the next controls.
  await openSettings();
  for (const nextMode of ['error403', 'error429', 'empty']) {
    await check(`${nextMode} does not enable saving`, async () => {
      mode = nextMode;
      await page.locator('#btnTestAPI').click();
      await page.waitForFunction(() => document.querySelector('#apiTestResult').className === 'error');
      assert.equal(await page.evaluate(() => apiTestStatus.success), false);
    });
  }
  await check('failed discovery preserves current model and allows retry', async () => {
    mode = 'list-error';
    await page.locator('#btnRefreshModels').click();
    await page.waitForFunction(() => document.querySelector('#modelRefreshStatus').className.includes('error'));
    assert.equal(await page.inputValue('#apiModel'), 'gemini-3.5-flash-lite');
    assert.equal(await page.isDisabled('#btnRefreshModels'), false);
  });
  await check('changing the key during discovery discards the old account model list', async () => {
    mode = 'slow-list';
    const pending = new Promise(resolve => { started = resolve; });
    await page.locator('#btnRefreshModels').click();
    await pending;
    await page.fill('#apiKey', 'fake-replacement-key');
    mode = 'success';
    release();
    await page.waitForFunction(() => !document.querySelector('#btnRefreshModels').disabled);
    assert.equal(await page.evaluate(() => googleModelList.length), 0);
    assert.equal(await page.locator('#modelRefreshStatus').textContent(), '');
    await page.fill('#apiKey', 'fake-google-key-for-tests');
  });
  await check('changing the model while a test is pending discards stale success', async () => {
    mode = 'slow';
    const pending = new Promise(resolve => { started = resolve; });
    await page.locator('#btnTestAPI').click();
    await pending;
    await page.selectOption('#apiModel', 'gemini-3.8-flash');
    release();
    await page.waitForFunction(() => document.querySelector('#btnTestAPI').textContent === '测试连接');
    assert.equal(await page.evaluate(() => apiTestStatus.success), false);
    assert.equal(await page.locator('#apiTestResult').isVisible(), false);
  });
  await check('switching providers during a pending test discards stale success', async () => {
    const pending = new Promise(resolve => { started = resolve; });
    await page.locator('#btnTestAPI').click();
    await pending;
    await page.selectOption('#apiProvider', 'openrouter');
    release();
    await page.waitForFunction(() => document.querySelector('#btnTestAPI').textContent === '测试连接');
    assert.equal(await page.evaluate(() => apiTestStatus.success), false);
    assert.equal(await page.inputValue('#apiModel'), 'google/gemini-3.7-flash');
  });
  await check('OpenRouter and Qwen refresh, cache and connection formats remain compatible', async () => {
    mode = 'success';
    for (const provider of ['openrouter', 'qwen']) {
      await page.selectOption('#apiProvider', provider);
      await page.locator('#btnRefreshModels').click();
      await page.waitForFunction(() => document.querySelector('#modelRefreshStatus').textContent.includes('✅'));
      await page.selectOption('#apiModel', 'fixture-model');
      await page.locator('#btnTestAPI').click();
      await page.waitForFunction(() => document.querySelector('#apiTestResult').className === 'success');
      await page.waitForFunction(() => !document.querySelector('#btnRefreshModels').disabled);
      assert.equal(await page.evaluate(async provider => !!(await chrome.storage.local.get('modelCache')).modelCache[provider], provider), true);
    }
  });
  await check('real content script sends image analysis and follow-up through the Google service worker', async () => {
    // Replace the worker's transport only; exercise the real runtime listener and adapter.
    await worker.evaluate(() => {
      globalThis.googleRequests = [];
      globalThis.fetch = async (url, options) => {
        if (String(url).startsWith('https://generativelanguage.googleapis.com/')) {
          if (options.headers['x-goog-api-key'] !== 'fake-google-key-for-tests') throw new Error('wrong test key');
          googleRequests.push({ url, body: JSON.parse(options.body) });
          return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: googleRequests.length === 1 ? '模拟图文分析成功' : '模拟追问成功' }] } }] }), { status: 200 });
        }
        if (String(url) === 'https://sns-img-qc.xhscdn.com/fixture.png') {
          return new Response(Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII='), c => c.charCodeAt(0)), { headers: { 'Content-Type': 'image/png' } });
        }
        throw new Error('Unexpected network request');
      };
    });
    const note = await context.newPage();
    note.on('pageerror', e => pageErrors.push(e.message));
    await note.goto('https://www.xiaohongshu.com/explore/fixture123456');
    await note.locator('#xhs-ai-fab').waitFor();
    await note.evaluate(() => window.postMessage({ __xhsCollector: true, type: 'XHS_POSTS_CAPTURED', apiUrl: 'fixture', posts: [{
      noteId: 'fixture123456', source: 'detail', title: '模拟笔记', content: '虚构测试内容', images: ['https://sns-img-qc.xhscdn.com/fixture.png'],
    }] }, '*'));
    await note.locator('#xhs-ai-fab').click();
    await note.locator('.xhs-action-btn').first().click();
    await note.waitForFunction(() => document.querySelector('.xhs-panel-result').textContent.includes('模拟图文分析成功'));
    await note.locator('.xhs-conversation-text').fill('请继续分析');
    await note.locator('.xhs-conversation-send').click();
    await note.waitForFunction(() => document.querySelector('.xhs-conversation-history').textContent.includes('模拟追问成功'));
    const captured = await worker.evaluate(() => googleRequests);
    assert.equal(captured.length, 2);
    for (const req of captured) {
      assert.ok(req.url.endsWith('/gemini-3.5-flash-lite:generateContent'));
      assert.ok(req.body.systemInstruction.parts[0].text);
      assert.equal(req.body.contents[0].parts[1].inlineData.mimeType, 'image/png');
    }
    assert.deepEqual(captured[1].body.contents.map(m => m.role), ['user', 'model', 'user']);
    await note.locator('.xhs-ai-response').scrollIntoViewIfNeeded();
    if (artifacts) await note.screenshot({ path: path.join(artifacts, 'google-analysis-followup.png'), animations: 'disabled' });
  });
  assert.deepEqual(pageErrors, []);
  console.log(`${count} browser checks passed; all API responses mocked.`);
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
