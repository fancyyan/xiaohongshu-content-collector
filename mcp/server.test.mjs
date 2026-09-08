import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const SERVER = new URL('./server.mjs', import.meta.url);

async function callServer(corpus, calls, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'xhs-mcp-test-'));
  const corpusPath = join(dir, 'corpus.json');
  await writeFile(corpusPath, JSON.stringify(corpus), 'utf8');

  try {
    const env = { ...process.env, ...(options.env || {}) };
    if (options.mockXhs) {
      const mockPath = join(dir, 'xhs-mock');
      await writeFile(mockPath, options.mockXhs, 'utf8');
      await chmod(mockPath, 0o755);
      env.XHS_CLI_BIN = mockPath;
      env.XHS_CLI_TIMEOUT_MS = '5000';
    }
    const child = spawn(process.execPath, [SERVER.pathname, '--corpus', corpusPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    for (const call of calls) child.stdin.write(`${JSON.stringify(call)}\n`);
    child.stdin.end();

    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    assert.equal(exitCode, 0, stderr);
    return stdout.trim().split('\n').filter(Boolean).map(JSON.parse);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function toolResult(response) {
  return JSON.parse(response.result.content[0].text);
}

function resultById(responses, id) {
  const response = responses.find((item) => item.id === id);
  assert.ok(response, `missing JSON-RPC response id=${id}`);
  return toolResult(response);
}

test('normalizes abbreviated and string interaction counts for ranking and stats', async () => {
  const corpus = [
    { noteId: 'plain', title: '普通', likedCount: 9000, collectedCount: 0, commentCount: 0 },
    { noteId: 'wan', title: '高互动', likedCount: '1.2万', collectedCount: '300', commentCount: '2k' },
  ];
  const responses = await callServer(corpus, [
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_notes', arguments: {} } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'stats', arguments: {} } },
  ]);

  const ranked = resultById(responses, 1);
  assert.equal(ranked[0].noteId, 'wan');
  assert.equal(ranked[0].likedCount, 12000);
  assert.equal(ranked[0].collectedCount, 300);
  assert.equal(ranked[0].commentCount, 2000);
  assert.equal(resultById(responses, 2).interactionP95, 14300);
});

test('accepts wrapped exports and ignores malformed records', async () => {
  const corpus = {
    data: [null, 'bad record', { noteId: 'valid', title: '有效笔记', tags: ['测试'] }],
  };
  const [response] = await callServer(corpus, [
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'stats', arguments: {} } },
  ]);

  const stats = toolResult(response);
  assert.equal(stats.total, 1);
  assert.equal(stats.dateRange, null);
  assert.deepEqual(stats.topTags, [{ tag: '测试', count: 1 }]);
});

test('returns a useful corpus error instead of crashing on an invalid wrapper', async () => {
  const [response] = await callServer({ data: { noteId: 'not-an-array' } }, [
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'recent_notes', arguments: {} } },
  ]);

  const result = toolResult(response);
  assert.equal(result.note, '语料不可用');
  assert.match(result.reason, /没有有效记录/);
});

const MOCK_USER = {
  user_id: 'user-1',
  nickname: '骑行者',
  avatar: 'https://example.com/avatar.jpg',
};

const MOCK_LIST_NOTE = {
  id: 'search-1',
  xsec_token: 'search-secret-token',
  note_card: {
    type: 'normal',
    display_title: '公路车入门',
    user: MOCK_USER,
    interact_info: {
      liked_count: '1.2万',
      collected_count: '300',
      comment_count: '20',
      shared_count: '10',
    },
    image_list: [{
      info_list: [
        { image_scene: 'WB_PRV', url: 'https://example.com/preview.jpg' },
        { image_scene: 'WB_DFT', url: 'https://example.com/default.jpg' },
      ],
    }],
    tag_list: [{ type: 'topic', name: '公路车' }],
  },
};

const MOCK_DETAIL_NOTE = {
  id: 'detail-1',
  note_card: {
    note_id: 'detail-1',
    type: 'video',
    title: '爬坡训练',
    desc: '一条完整正文',
    time: 1700000000,
    ip_location: '上海',
    user: MOCK_USER,
    interact_info: {
      liked_count: '900',
      collected_count: '80',
      comment_count: '12',
      share_count: '7',
    },
    image_list: [{ url_default: 'https://example.com/detail.jpg' }],
    tag_list: [{ type: 'topic', name: '骑行训练' }],
    video: {
      capa: { duration: 42 },
      media: { stream: { h264: [{ master_url: 'https://example.com/video.mp4' }] } },
    },
  },
};

const MOCK_XHS_RESPONSES = {
  status: {
    ok: true,
    schema_version: '1',
    data: {
      authenticated: true,
      user: { id: 'me-1', name: '测试账号', red_id: 'red-1', desc: '简介', token: 'must-not-leak' },
    },
  },
  search: { ok: true, schema_version: '1', data: { has_more: true, items: [MOCK_LIST_NOTE] } },
  read: { ok: true, schema_version: '1', data: { items: [MOCK_DETAIL_NOTE] } },
  comments: {
    ok: true,
    schema_version: '1',
    data: {
      xsec_token: 'comment-secret-token',
      has_more: true,
      cursor: 'next-page',
      comments: [{
        id: 'comment-1',
        note_id: 'detail-1',
        content: '很实用',
        like_count: '2k',
        create_time: 1700000100,
        ip_location: '浙江',
        sub_comment_count: '1',
        user_info: MOCK_USER,
        sub_comments: [{
          id: 'reply-1',
          note_id: 'detail-1',
          content: '谢谢',
          like_count: '3',
          user_info: MOCK_USER,
        }],
      }],
    },
  },
  hot: { ok: true, schema_version: '1', data: { has_more: false, items: [MOCK_LIST_NOTE] } },
};

const MOCK_XHS = [
  '#!/usr/bin/env node',
  'const command = process.argv[2];',
  'const responses = ' + JSON.stringify(MOCK_XHS_RESPONSES) + ';',
  'if (!responses[command]) {',
  '  process.stdout.write(JSON.stringify({ ok: false, schema_version: "1", error: { code: "unknown", message: command } }));',
  '  process.exit(1);',
  '}',
  'process.stdout.write(JSON.stringify(responses[command]));',
].join('\n');

test('advertises only the five read-only xiaohongshu-cli bridge tools', async () => {
  const [response] = await callServer([], [
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  ]);
  const names = response.result.tools.map((tool) => tool.name);
  assert.deepEqual(
    names.filter((name) => name.startsWith('xhs_')),
    ['xhs_status', 'xhs_search', 'xhs_read', 'xhs_comments', 'xhs_hot'],
  );
  assert.equal(names.some((name) => /post|like|favorite|follow|reply|delete/.test(name)), false);
});

test('bridges live CLI data into the collector schema without leaking tokens', async () => {
  const responses = await callServer([], [
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'xhs_status', arguments: {} } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'xhs_search', arguments: { query: '公路车', sort: 'popular', limit: 5 } } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'xhs_read', arguments: { idOrUrl: 'detail-1' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'xhs_comments', arguments: { idOrUrl: 'detail-1' } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'xhs_hot', arguments: { category: 'fitness', limit: 3 } } },
  ], { mockXhs: MOCK_XHS });

  const status = resultById(responses, 1);
  const search = resultById(responses, 2);
  const read = resultById(responses, 3);
  const comments = resultById(responses, 4);
  const hot = resultById(responses, 5);
  assert.deepEqual(status.user, {
    id: 'me-1',
    name: '测试账号',
    redId: 'red-1',
    description: '简介',
  });

  assert.equal(search.notes[0].noteId, 'search-1');
  assert.equal(search.notes[0].type, 'normal');
  assert.equal(search.notes[0].likedCount, 12000);
  assert.equal(search.notes[0].shareCount, 10);
  assert.deepEqual(search.notes[0].images, ['https://example.com/default.jpg']);
  assert.deepEqual(search.notes[0].tags, ['公路车']);

  assert.equal(read.note.content, '一条完整正文');
  assert.equal(read.note.type, 'video');
  assert.equal(read.note.videoDuration, 42);
  assert.equal(read.note.videoUrl, 'https://example.com/video.mp4');
  assert.equal(read.note.shareCount, 7);

  assert.equal(comments.comments[0].likedCount, 2000);
  assert.equal(comments.comments[0].replyCount, 1);
  assert.equal(comments.comments[0].replies[0].content, '谢谢');
  assert.equal(comments.hasMore, true);
  assert.equal(comments.cursor, 'next-page');

  assert.equal(hot.category, 'fitness');
  assert.equal(hot.notes[0].source, 'cli_hot_fitness');

  const serialized = JSON.stringify({ status, search, read, comments, hot });
  assert.doesNotMatch(serialized, /secret-token|xsec_token|must-not-leak/);
});

test('returns a structured error when the xhs binary is unavailable', async () => {
  const [response] = await callServer([], [
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'xhs_status', arguments: {} } },
  ], { env: { XHS_CLI_BIN: '/definitely/missing/xhs' } });

  const result = toolResult(response);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'cli_not_found');
});

test('redacts credentials from malformed CLI output', async () => {
  const brokenXhs = [
    '#!/usr/bin/env node',
    'process.stdout.write(\'broken {"xsec_token":"secret-value"}\');',
    'process.exit(1);',
  ].join('\n');
  const [response] = await callServer([], [
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'xhs_status', arguments: {} } },
  ], { mockXhs: brokenXhs });

  const result = toolResult(response);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'cli_exit_error');
  assert.doesNotMatch(JSON.stringify(result), /secret-value|xsec_token/);
});
