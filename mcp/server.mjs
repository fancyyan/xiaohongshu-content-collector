#!/usr/bin/env node
/**
 * xiaohongshu-content-collector — MCP server (stdio)
 *
 * 把你在插件里本地采集的小红书语料(由插件「导出 > JSON」产出的 corpus.json)
 * 暴露给 MCP 客户端(Claude Desktop / Cursor / Cline 等),让 AI agent 能
 * 检索、统计、并用插件自带的"爆款拆解/仿写/标签/选题/博主画像"视角分析。
 *
 * 零依赖:仅用 Node 内置模块。
 * 启动: node mcp/server.mjs --corpus <路径>   或   XHS_CORPUS=<路径> node mcp/server.mjs
 *
 * 语料 schema = lib/storage.js 的 post 对象:
 *   noteId,title,content,tags[],type('normal'|'video'),source,authorId,authorName,
 *   likedCount,collectedCount,commentCount,images[],videoUrl,capturedAt,updatedAt
 * 缺失字段一律做防御。
 */

import { readFile } from 'node:fs';
import { resolve } from 'node:path';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'xhs-collector-mcp';
const SERVER_VERSION = '1.3.0';

// ---- 语料路径解析 ----
function corpusPath() {
  const i = process.argv.indexOf('--corpus');
  if (i !== -1 && process.argv[i + 1]) return resolve(process.argv[i + 1]);
  if (process.env.XHS_CORPUS) return resolve(process.env.XHS_CORPUS);
  return null;
}
const CORPUS_PATH = corpusPath();

// 每次调用都重读,保证"重新导出即生效、无需重启"
function loadCorpus() {
  return new Promise((resolveP) => {
    if (!CORPUS_PATH) return resolveP({ ok: false, reason: '未指定语料路径(--corpus 或 XHS_CORPUS)', posts: [] });
    readFile(CORPUS_PATH, 'utf8', (err, data) => {
      if (err) return resolveP({ ok: false, reason: `读取语料失败:${err.code || err.message}(${CORPUS_PATH})`, posts: [] });
      let arr;
      try {
        arr = JSON.parse(data);
      } catch (e) {
        return resolveP({ ok: false, reason: `语料 JSON 解析失败:${e.message}`, posts: [] });
      }
      if (!Array.isArray(arr)) {
        // 兼容 {data:[...]} / {posts:[...]} 形态
        arr = (arr && (arr.data || arr.posts)) || [];
      }
      resolveP({ ok: arr.length > 0, reason: arr.length === 0 ? '语料为空' : '', posts: arr });
    });
  });
}

// ---- 工具函数 ----
const num = (v, d = 0) => (typeof v === 'number' && !Number.isNaN(v)) ? v : d;
const interaction = (p) => num(p.likedCount) + num(p.collectedCount) + num(p.commentCount);
const snippet = (s, n = 200) => (s ? (s.length > n ? s.slice(0, n) + '…' : s) : '');
const noteUrl = (p) => p.noteUrl || (p.noteId ? `https://www.xiaohongshu.com/explore/${p.noteId}` : '');

const trimForList = (p) => ({
  noteId: p.noteId,
  title: p.title || '',
  contentSnippet: snippet(p.content, 200),
  type: p.type || 'normal',
  source: p.source || 'unknown',
  authorName: p.authorName || '',
  authorId: p.authorId || '',
  likedCount: num(p.likedCount),
  collectedCount: num(p.collectedCount),
  commentCount: num(p.commentCount),
  tags: Array.isArray(p.tags) ? p.tags : [],
  noteUrl: noteUrl(p),
  capturedAt: p.capturedAt || null,
});

// ---- MCP 工具实现 ----
async function tool_search_notes(args) {
  const { posts, ok, reason } = await loadCorpus();
  if (!ok) return reasonNote(reason);
  const q = (args?.query || '').trim().toLowerCase();
  const limit = Math.min(Math.max(num(args?.limit, 10), 1), 100);
  const src = args?.source, typ = args?.type, tag = args?.tag;
  let hit;
  if (!q && !src && !typ && !tag) {
    hit = posts.slice(); // 无条件 → 返回最近一批
  } else {
    hit = posts.filter((p) => {
      if (src && (p.source || 'unknown') !== src) return false;
      if (typ && (p.type || 'normal') !== typ) return false;
      if (tag && !(Array.isArray(p.tags) && p.tags.includes(tag))) return false;
      if (q) {
        const hay = `${p.title || ''}\n${p.content || ''}\n${(Array.isArray(p.tags) ? p.tags : []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  hit.sort((a, b) => interaction(b) - interaction(a));
  return hit.slice(0, limit).map(trimForList);
}

async function tool_get_note(args) {
  const { posts, ok, reason } = await loadCorpus();
  if (!ok) return reasonNote(reason);
  const id = args?.noteId;
  if (!id) return { error: '缺少 noteId 参数' };
  const p = posts.find((x) => x.noteId === id);
  if (!p) return { error: `未找到 noteId=${id}` };
  return {
    noteId: p.noteId, title: p.title || '', content: p.content || '',
    type: p.type || 'normal', source: p.source || 'unknown',
    authorName: p.authorName || '', authorId: p.authorId || '',
    likedCount: num(p.likedCount), collectedCount: num(p.collectedCount), commentCount: num(p.commentCount),
    tags: Array.isArray(p.tags) ? p.tags : [], images: Array.isArray(p.images) ? p.images : [],
    videoUrl: p.videoUrl || '', noteUrl: noteUrl(p),
    capturedAt: p.capturedAt || null, updatedAt: p.updatedAt || null,
  };
}

async function tool_list_creators(args) {
  const { posts, ok, reason } = await loadCorpus();
  if (!ok) return reasonNote(reason);
  const limit = Math.min(Math.max(num(args?.limit, 20), 1), 200);
  const map = new Map();
  for (const p of posts) {
    const key = p.authorId || p.authorName || '_unknown';
    const cur = map.get(key) || { authorId: p.authorId || '', authorName: p.authorName || '', count: 0, totalLikes: 0, totalCollects: 0, totalComments: 0, latestCapturedAt: 0, latestNoteId: '' };
    cur.count += 1;
    cur.totalLikes += num(p.likedCount);
    cur.totalCollects += num(p.collectedCount);
    cur.totalComments += num(p.commentCount);
    const cap = num(p.capturedAt);
    if (cap > cur.latestCapturedAt) { cur.latestCapturedAt = cap; cur.latestNoteId = p.noteId; }
    map.set(key, cur);
  }
  const arr = [...map.values()].map((c) => ({
    ...c, avgInteraction: c.count ? Math.round((c.totalLikes + c.totalCollects + c.totalComments) / c.count) : 0,
  }));
  arr.sort((a, b) => b.totalLikes + b.totalCollects - (a.totalLikes + a.totalCollects));
  return arr.slice(0, limit);
}

async function tool_stats() {
  const { posts, ok, reason } = await loadCorpus();
  if (!ok) return reasonNote(reason);
  const bySource = {}, byType = {}, tagCount = {};
  let first = Infinity, last = -Infinity;
  const inter = [];
  for (const p of posts) {
    bySource[p.source || 'unknown'] = (bySource[p.source || 'unknown'] || 0) + 1;
    byType[p.type || 'normal'] = (byType[p.type || 'normal'] || 0) + 1;
    const cap = num(p.capturedAt);
    if (cap) { first = Math.min(first, cap); last = Math.max(last, cap); }
    const iv = interaction(p); inter.push(iv);
    for (const t of (Array.isArray(p.tags) ? p.tags : [])) tagCount[t] = (tagCount[t] || 0) + 1;
  }
  inter.sort((a, b) => a - b);
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([t, c]) => ({ tag: t, count: c }));
  return {
    total: posts.length, bySource, byType,
    dateRange: posts.length ? { first, last } : null,
    interactionP95: inter.length ? inter[Math.min(inter.length - 1, Math.floor(inter.length * 0.95))] : 0,
    topTags,
  };
}

async function tool_trending_tags(args) {
  const { posts, ok, reason } = await loadCorpus();
  if (!ok) return reasonNote(reason);
  const top = Math.min(Math.max(num(args?.top, 20), 1), 100);
  const freq = new Map();
  for (const p of posts) for (const t of (Array.isArray(p.tags) ? p.tags : [])) {
    const e = freq.get(t) || { tag: t, count: 0, sampleNoteIds: [] };
    e.count += 1; if (e.sampleNoteIds.length < 3) e.sampleNoteIds.push(p.noteId);
    freq.set(t, e);
  }
  return [...freq.values()].sort((a, b) => b.count - a.count).slice(0, top);
}

async function tool_recent_notes(args) {
  const { posts, ok, reason } = await loadCorpus();
  if (!ok) return reasonNote(reason);
  const limit = Math.min(Math.max(num(args?.limit, 10), 1), 100);
  return posts.slice().sort((a, b) => num(b.capturedAt) - num(a.capturedAt)).slice(0, limit).map(trimForList);
}

function reasonNote(reason) {
  return { note: '语料不可用', reason: reason || '请先在插件里「导出 > JSON」产出语料文件,并让本 server 指向它(--corpus 路径)。' };
}

// ---- 工具/资源/prompt 元数据 ----
const TOOLS = [
  { name: 'search_notes', description: '在小红书本机语料里按关键词/来源/类型/标签检索笔记,按互动量排序返回精简列表。无任何条件时返回高互动的一批。', inputSchema: { type: 'object', properties: { query: { type: 'string', description: '关键词,匹配标题/正文/标签' }, limit: { type: 'integer', default: 10, minimum: 1, maximum: 100 }, source: { type: 'string', description: '来源过滤(dom_feed/search/detail/profile 等)' }, type: { type: 'string', enum: ['normal', 'video'] }, tag: { type: 'string', description: '标签精确匹配' } } } },
  { name: 'get_note', description: '按 noteId 取单条笔记全字段(正文全文、图片 URL、标签、互动数、视频地址),供深入分析。', inputSchema: { type: 'object', properties: { noteId: { type: 'string' } }, required: ['noteId'] } },
  { name: 'list_creators', description: '聚合语料中的博主(authorId/authorName),返回各自笔记数、总互动、最新笔记,按总互动排序。', inputSchema: { type: 'object', properties: { limit: { type: 'integer', default: 20, minimum: 1, maximum: 200 } } } },
  { name: 'stats', description: '返回语料统计:总数、按来源/类型分布、采集时间范围、互动 P95、Top 标签。', inputSchema: { type: 'object' } },
  { name: 'trending_tags', description: '返回语料中频次最高的标签(及各标签的样本 noteId),近似判断近期热门话题。', inputSchema: { type: 'object', properties: { top: { type: 'integer', default: 20, minimum: 1, maximum: 100 } } } },
  { name: 'recent_notes', description: '按采集时间倒序返回最近一批笔记。', inputSchema: { type: 'object', properties: { limit: { type: 'integer', default: 10, minimum: 1, maximum: 100 } } } },
];

function resourcesList() {
  return [
    { uri: 'xhs-corpus://stats', name: '语料统计', description: '整体语料的统计概览(JSON)', mimeType: 'application/json' },
    // 每条笔记动态资源:URI 形如 xhs-note://{noteId}
  ];
}

async function resourceRead(uri) {
  if (uri === 'xhs-corpus://stats') {
    const s = await tool_stats();
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(s, null, 2) }] };
  }
  const m = /^xhs-note:\/\/(.+)$/.exec(uri);
  if (m) {
    const full = await tool_get_note({ noteId: m[1] });
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(full, null, 2) }] };
  }
  return { contents: [], isError: true };
}

// 5 个分析 prompt(复刻插件 getSystemPrompt 的四个视角)
const PROMPTS = [
  { name: '爆款拆解', description: '用"专业小红书内容分析师"视角对一条笔记做爆款拆解(钩子/选题/结构/封面复用点/风险)。', args: [{ name: 'noteId', description: '待拆解的笔记 ID;不填则自行用 search_notes 检索一条' }] },
  { name: '仿写文案', description: '模仿一条笔记的风格产出同主题新文案(内容分析师视角)。', args: [{ name: 'noteId', description: '模仿对象的笔记 ID;不填则自行检索一条相关笔记' }] },
  { name: '标签建议', description: '基于一条笔记给出精准的小红书话题标签建议。', args: [{ name: 'noteId', description: '待打标签的笔记 ID;不填则自行检索一条' }] },
  { name: '选题推荐', description: '用"趋势分析师"视角,基于本机语料趋势给出选题建议。', args: [{ name: '方向', description: '可选的领域方向,如"防晒穿搭"' }] },
  { name: '博主画像', description: '用"小红书博主运营顾问"视角,对语料中某博主做定位/策略/变现分析。', args: [{ name: 'authorNameOrId', description: '博主名或 ID;不填请先用 list_creators 选一个高互动博主' }] },
];

function lensPrompt(name, args = {}) {
  const a = args || {};
  switch (name) {
    case '爆款拆解':
      return `你是专业的小红书内容分析师,擅长分析内容策略、写作技巧、视觉表现和爆款规律。请${a.noteId ? `先用 get_note 拉 noteId=${a.noteId} 的笔记` : '先用 search_notes 检索一条你判断有代表性的笔记,再用 get_note 取全文'}。然后做爆款拆解:① 钩子(前3秒/标题如何抓眼球) ② 选题切角 ③ 结构与节奏 ④ 封面与视觉可复用点 ⑤ 潜在风险/平台敏感点 ⑥ 一句"可复用结构"。回复:纯文本 Markdown,中文,不要插入任何图片链接或 ![]()。语料来源于本机真实采集的小红书笔记。`;
    case '仿写文案':
      return `你是专业的小红书内容分析师。请${a.noteId ? `先用 get_note 拉 noteId=${a.noteId}` : '先用 search_notes+get_note 取一条相关笔记'}作为模仿范本,产出一条同主题、同风格但原创的新笔记文案(含标题、正文、可加 emoji 与适度的口语化分段、3-8 个 # 话题标签)。保持范本的钩子和语气,但不要照抄。回复:纯文本 Markdown,中文,不含图片链接。`;
    case '标签建议':
      return `你是专业的小红书内容分析师。请${a.noteId ? `用 get_note 拉 noteId=${a.noteId}` : '用 search_notes+get_note 取一条笔记'},基于其主题与调性给出 8 个精准的小红书话题标签:区分"流量标签"(大词,蹭曝光)与"精准标签"(长尾,转化好),并各给一句理由。中文,纯文本,不含图片链接。`;
    case '选题推荐':
      return `你是专业的小红书内容趋势分析师,擅长洞察平台内容趋势、预判爆款方向、分析封面设计。请先用 trending_tags 和 stats 了解本机语料趋势${a['方向'] ? `(聚焦方向:${a['方向']})` : ''},再用 search_notes 取几条佐证,然后给出 5 个"有潜力、差异化、可落地"的选题,每个含:选题名、目标人群、切角、预估钩子、一个差异化要点。中文,纯文本 Markdown,不含图片链接。`;
    case '博主画像':
      return `你是专业的小红书博主运营顾问,擅长分析定位、内容策略、视觉品牌与商业变现。请${a.authorNameOrId ? `用 list_creators 找到 ${a.authorNameOrId} 对应博主` : '先用 list_creators 挑一个互动最高的博主'},再用 search_notes/get_note 取其多条笔记,然后做博主画像:定位、人设、内容支柱、视觉调性、互动结构、变现潜力、可优化建议。中文,纯文本 Markdown,不含图片链接。`;
    default:
      return '未知 prompt。';
  }
}

function promptGet(name, args) {
  const text = lensPrompt(name, args);
  return { messages: [{ role: 'user', content: { type: 'text', text } }] };
}

// ---- JSON-RPC dispatch ----
function rpcError(id, code, message, data) {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
}

async function handle(req) {
  const { id, method, params } = req;
  // 通知(无 id)无需回应
  if (id === undefined || id === null) return null;
  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0', id, result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {}, resources: {}, prompts: {} },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          },
        };
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };
      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
      case 'tools/call': {
        const { name, arguments: ag } = params || {};
        const t = TOOLS.find((x) => x.name === name);
        if (!t) return rpcError(id, -32602, `未知工具:${name}`);
        const fn = { search_notes: tool_search_notes, get_note: tool_get_note, list_creators: tool_list_creators, stats: tool_stats, trending_tags: tool_trending_tags, recent_notes: tool_recent_notes }[name];
        const out = await fn(ag);
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] } };
      }
      case 'resources/list':
        return { jsonrpc: '2.0', id, result: { resources: resourcesList() } };
      case 'resources/read': {
        const out = await resourceRead(params?.uri);
        return { jsonrpc: '2.0', id, result: out };
      }
      case 'prompts/list':
        return { jsonrpc: '2.0', id, result: { prompts: PROMPTS.map((p) => ({ name: p.name, description: p.description, arguments: p.args.map((x) => ({ name: x.name, description: x.description, required: false })) })) } };
      case 'prompts/get': {
        const { name, arguments: ag } = params || {};
        const p = PROMPTS.find((x) => x.name === name);
        if (!p) return rpcError(id, -32602, `未知 prompt:${name}`);
        return { jsonrpc: '2.0', id, result: promptGet(name, ag) };
      }
      default:
        return rpcError(id, -32601, `未实现的方法:${method}`);
    }
  } catch (e) {
    return rpcError(id, -32603, `内部错误:${e?.message || String(e)}`);
  }
}

// ---- stdio 主循环:按行读取 JSON-RPC ----
let buf = '';
const inflight = new Set();
function dispatch(req) {
  const pr = handle(req).then((resp) => {
    if (resp) process.stdout.write(JSON.stringify(resp) + '\n');
  });
  inflight.add(pr);
  pr.catch(() => {}).finally(() => inflight.delete(pr));
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).replace(/\r$/, '');
    buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    let req;
    try { req = JSON.parse(line); } catch { /* 忽略非 JSON 行 */ continue; }
    dispatch(req);
  }
});
// 等"离开(结束读取)"时,先把所有在途的异步处理写完再退出,避免单条请求被截断
process.stdin.on('end', () => {
  Promise.allSettled([...inflight]).then(() => process.exit(0));
});
