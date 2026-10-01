import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../lib/google-ai.js', import.meta.url), 'utf8');
const key = 'fake-google-key-for-tests';
const output = { candidates: [{ content: { parts: [{ text: 'OK' }] } }] };
const reply = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
function adapter(fetch, timers = {}) {
  const context = vm.createContext({ fetch, URL, AbortController, setTimeout, clearTimeout, ...timers });
  vm.runInContext(source, context);
  return context.GoogleAI;
}
const input = { apiKey: key, model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'Hi' }] };

test('ListModels paginates, filters by generateContent, normalizes and deduplicates', async () => {
  const calls = [];
  const ai = adapter(async (url, options) => {
    calls.push({ url, options });
    return reply(calls.length === 1 ? {
      models: [
        { name: 'models/gemini-3.8-flash', displayName: 'Flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/live', supportedGenerationMethods: ['bidiGenerateContent'] },
        { name: 'malformed', supportedGenerationMethods: ['generateContent'] },
      ], nextPageToken: 'next/+ page',
    } : { models: [
      { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
    ] });
  });
  assert.deepEqual(Array.from(await ai.listModels(key), m => m.value), ['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
  assert.equal(new URL(calls[1].url).searchParams.get('pageToken'), 'next/+ page');
  for (const { url, options } of calls) {
    assert.equal(new URL(url).searchParams.get('pageSize'), '1000');
    assert.ok(!url.includes(key));
    assert.equal(options.headers['x-goog-api-key'], key);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.method, 'GET');
  }
});

test('ListModels rejects empty or looping results and missing keys', async () => {
  await assert.rejects(adapter(async () => reply({ models: [] })).listModels(key), /generateContent/);
  await assert.rejects(adapter(async () => reply({ nextPageToken: 'same' })).listModels(key), /分页异常/);
  await assert.rejects(adapter(() => assert.fail('must not fetch')).listModels(''), /API Key/);
});

test('generation converts system prompt, image and multi-turn roles using the selected model', async () => {
  const ai = adapter(async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    assert.equal(options.headers['x-goog-api-key'], key);
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    assert.deepEqual(body.systemInstruction, { parts: [{ text: 'Analyze' }] });
    assert.deepEqual(body.contents, [
      { role: 'user', parts: [{ text: 'Photo' }, { inlineData: { mimeType: 'image/png', data: 'YWJj' } }] },
      { role: 'model', parts: [{ text: 'Answer' }] },
      { role: 'user', parts: [{ text: 'Follow up' }] },
    ]);
    assert.equal(body.generationConfig.maxOutputTokens, 3000);
    assert.equal(body.messages, undefined);
    return reply({ candidates: [{ content: { parts: [{ text: 'hidden', thought: true }, { text: 'A' }, { text: 'B' }] } }] });
  });
  assert.equal(await ai.generateContent({ ...input, model: ' models/gemini-3.8-flash ', messages: [
    { role: 'system', content: 'Analyze' },
    { role: 'user', content: [{ type: 'text', text: 'Photo' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,YWJj' } }] },
    { role: 'assistant', content: 'Answer' }, { role: 'user', content: 'Follow up' },
  ] }), 'AB');
});

test('malformed models and remote image URLs fail before making a request', async () => {
  const ai = adapter(() => assert.fail('must not fetch'));
  for (const model of ['', '../model', 'https://example.com/model', 'm?key=bad']) {
    await assert.rejects(ai.generateContent({ ...input, model }), /有效/);
  }
  await assert.rejects(ai.generateContent({ ...input, messages: [{ role: 'user', content: [
    { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
  ] }] }), /base64/);
});

for (const [status, hint] of [[400, /请求/], [401, /API Key/], [403, /权限/], [404, /刷新模型列表/], [429, /配额/], [503, /HTTP 503/]]) {
  test(`HTTP ${status} is actionable and redacts the key`, async () => {
    const ai = adapter(async () => reply({ error: { message: `Failure ${key}` } }, status));
    await assert.rejects(ai.generateContent(input), error => {
      assert.match(error.message, hint);
      assert.ok(!error.message.includes(key));
      return true;
    });
  });
}

test('invalid JSON and empty, blocked or non-text responses do not pass connection tests', async () => {
  for (const data of [{}, { promptFeedback: { blockReason: 'SAFETY' } }, { candidates: [{ finishReason: 'MAX_TOKENS' }] },
    { candidates: [{ content: { parts: [{ text: 'reason', thought: true }, { inlineData: { data: 'abc' } }] } }] }]) {
    await assert.rejects(adapter(async () => reply(data)).generateContent(input), /未返回文本/);
  }
  await assert.rejects(adapter(async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } })).generateContent(input), /HTTP 502/);
});

test('network failures redact the key, and aborts clear the timer', async () => {
  await assert.rejects(adapter(async () => { throw new Error(`Network ${key}`); }).generateContent(input), e => !e.message.includes(key));
  let cleared = false;
  const ai = adapter(async (_url, { signal }) => {
    signal.throwIfAborted();
  }, { setTimeout: fn => { fn(); return 1; }, clearTimeout: () => { cleared = true; } });
  await assert.rejects(ai.generateContent(input), /超时/);
  assert.equal(cleared, true);
});

test('background routes generation using saved Google config, never a message-supplied key or URL', async () => {
  let listener;
  const config = { provider: 'google', apiKey: key, apiModel: input.model };
  const context = vm.createContext({
    console, URL, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      assert.equal(url, `${context.GoogleAI.endpoint}/${input.model}:generateContent`);
      assert.equal(options.headers['x-goog-api-key'], key);
      return reply(output);
    },
    chrome: {
      runtime: { onMessage: { addListener: fn => { listener = fn; } }, onInstalled: { addListener() {} } },
      storage: { sync: { get: async () => ({ userConfig: { apiConfig: config } }) } },
    },
  });
  context.importScripts = () => vm.runInContext(source, context);
  vm.runInContext(readFileSync(new URL('../background.js', import.meta.url), 'utf8'), context);
  const send = () => new Promise(resolve => {
    assert.equal(listener({ type: 'GOOGLE_AI_GENERATE', messages: input.messages, apiKey: 'untrusted', endpoint: 'https://example.com' }, {}, resolve), true);
  });
  assert.equal((await send()).text, 'OK');
  config.provider = 'openrouter';
  assert.match((await send()).error, /配置并测试/);
});
