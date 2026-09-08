#!/usr/bin/env node
/**
 * xiaohongshu-content-collector — MCP server (stdio)
 *
 * 把你在插件里本地采集的小红书语料(由插件「导出 > JSON」产出的 corpus.json)
 * 暴露给 MCP 客户端(Claude Desktop / Cursor / Cline 等),让 AI agent 能
 * 检索、统计、并用插件自带的"爆款拆解/仿写/标签/选题/博主画像"视角分析；
 * 可选调用本机 xiaohongshu-cli 实时搜索、读详情、评论与分类热门内容。
 *
 * 零依赖:仅用 Node 内置模块。
 * 启动: node mcp/server.mjs --corpus <路径> [--xhs-bin <路径>]
 *
 * 语料 schema = lib/storage.js 的 post 对象:
 *   noteId,title,content,tags[],type('normal'|'video'),source,authorId,authorName,
 *   likedCount,collectedCount,commentCount,images[],videoUrl,capturedAt,updatedAt
 * 缺失字段一律做防御。
 */

import { readFile } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'xhs-collector-mcp';
const SERVER_VERSION = '1.4.0';

function cliOption(name, envName, fallback) {
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return process.env[envName] || fallback;
}

const XHS_BIN = cliOption('--xhs-bin', 'XHS_CLI_BIN', 'xhs');
const XHS_TIMEOUT_MS = Math.min(
  Math.max(num(cliOption('--xhs-timeout', 'XHS_CLI_TIMEOUT_MS', '45000')), 5000),
  120000,
);
const XHS_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

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
        // 兼容 {data:[...]} / {posts:[...]} 形态，但不把任意对象误当成数组。
        arr = Array.isArray(arr?.data) ? arr.data : Array.isArray(arr?.posts) ? arr.posts : [];
      }
      // 导出文件可能经过人工合并或清洗，跳过 null / 字符串等无效记录。
      arr = arr.filter((post) => post && typeof post === 'object' && !Array.isArray(post));
      resolveP({ ok: arr.length > 0, reason: arr.length === 0 ? '语料为空或没有有效记录' : '', posts: arr });
    });
  });
}

// ---- 工具函数 ----
function num(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value !== 'string') return fallback;

  const normalized = value.trim().replace(/,/g, '');
  if (!normalized) return fallback;
  const match = /^(-?\d+(?:\.\d+)?)\s*(亿|万|千|[wk])?\+?$/i.exec(normalized);
  if (!match) return fallback;

  const multipliers = { '亿': 1e8, '万': 1e4, '千': 1e3, w: 1e4, k: 1e3 };
  const unit = match[2]?.toLowerCase();
  const parsed = Number(match[1]) * (multipliers[unit] || 1);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}
const interaction = (p) => num(p.likedCount) + num(p.collectedCount) + num(p.commentCount);
const snippet = (s, n = 200) => (s ? (s.length > n ? s.slice(0, n) + '…' : s) : '');
const noteUrl = (p) => p.noteUrl || (p.noteId ? `https://www.xiaohongshu.com/explore/${p.noteId}` : '');

function boundedInt(value, fallback, min, max) {
  return Math.min(Math.max(Math.round(num(value, fallback)), min), max);
}

function safeCliMessage(value) {
  return String(value || '')
    .replace(/"(?:xsec_token|xsec_source|cookie|authorization|token)"\s*:\s*"[^"]*"/gi, '"credential":"[已隐藏]"')
    .replace(/([?&](?:xsec_token|xsec_source)=)[^&\s]+/gi, '$1[已隐藏]')
    .replace(/(cookie|authorization|token)[=:\s]+[^\s]+/gi, '$1=[已隐藏]')
    .trim()
    .slice(0, 500);
}

function cliError(code, message, details) {
  return {
    ok: false,
    error: {
      code,
      message: safeCliMessage(message),
      ...(details ? { details: safeCliMessage(details) } : {}),
    },
  };
}

function runXhsNow(args) {
  return new Promise((resolveP) => {
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let timedOut = false;
    let oversized = false;
    let settled = false;
    let child;
    let timer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolveP(result);
    };

    try {
      child = spawn(XHS_BIN, [...args, '--json'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, OUTPUT: 'json' },
        shell: false,
      });
    } catch (error) {
      resolveP(cliError('cli_start_failed', '无法启动 xiaohongshu-cli', error.message));
      return;
    }

    timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, XHS_TIMEOUT_MS);

    const collect = (target, chunk) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > XHS_MAX_OUTPUT_BYTES) {
        oversized = true;
        child.kill('SIGTERM');
        return target;
      }
      return target + chunk;
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout = collect(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = collect(stderr, chunk); });
    child.on('error', (error) => {
      finish(cliError(
        error.code === 'ENOENT' ? 'cli_not_found' : 'cli_start_failed',
        error.code === 'ENOENT' ? `未找到 xhs 命令：${XHS_BIN}` : '无法启动 xiaohongshu-cli',
        error.message,
      ));
    });
    child.on('close', (code) => {
      if (timedOut) return finish(cliError('cli_timeout', `xiaohongshu-cli 超过 ${XHS_TIMEOUT_MS}ms 未完成`));
      if (oversized) return finish(cliError('cli_output_too_large', 'xiaohongshu-cli 输出超过 8MB 限制'));

      let envelope;
      try {
        envelope = JSON.parse(stdout);
      } catch {
        return finish(cliError(
          code === 0 ? 'cli_invalid_json' : 'cli_exit_error',
          code === 0 ? 'xiaohongshu-cli 未返回有效 JSON' : `xiaohongshu-cli 退出码 ${code}`,
          stderr || stdout,
        ));
      }
      if (!envelope || typeof envelope !== 'object') {
        return finish(cliError('cli_invalid_envelope', 'xiaohongshu-cli 返回格式无效'));
      }
      if (code !== 0 && envelope.ok !== false) {
        return finish(cliError('cli_exit_error', `xiaohongshu-cli 退出码 ${code}`, stderr));
      }
      finish(envelope);
    });
  });
}

// 串行执行，避免多个 MCP 调用同时访问小红书而放大风控风险。
let xhsQueue = Promise.resolve();
function runXhs(args) {
  const current = xhsQueue.then(() => runXhsNow(args));
  xhsQueue = current.then(() => undefined, () => undefined);
  return current;
}

function imageUrl(image) {
  if (!image || typeof image !== 'object') return '';
  if (image.url_default || image.url_pre || image.url) {
    return image.url_default || image.url_pre || image.url;
  }
  const info = Array.isArray(image.info_list) ? image.info_list : [];
  return info.find((entry) => entry?.image_scene === 'WB_DFT')?.url
    || info.find((entry) => entry?.image_scene === 'WB_PRV')?.url
    || info.find((entry) => entry?.url)?.url
    || '';
}

function normalizeLiveNote(item, source) {
  const card = item?.note_card || item?.note || item;
  if (!card || typeof card !== 'object') return null;
  const noteId = card.note_id || item?.id || card.id;
  if (!noteId) return null;
  const user = card.user || {};
  const interact = card.interact_info || {};
  const images = (Array.isArray(card.image_list) ? card.image_list : []).map(imageUrl).filter(Boolean);
  const tags = (Array.isArray(card.tag_list) ? card.tag_list : [])
    .filter((tag) => tag && (!tag.type || tag.type === 'topic'))
    .map((tag) => tag.name)
    .filter(Boolean);
  const videoUrl = card.video?.media?.stream?.h264?.[0]?.master_url
    || card.video?.media?.stream?.h265?.[0]?.master_url
    || '';

  return {
    noteId: String(noteId),
    type: card.type === 'video' ? 'video' : 'normal',
    title: card.display_title || card.title || '',
    content: card.desc || '',
    coverUrl: card.cover?.url_default || card.cover?.url_pre || images[0] || '',
    images,
    videoUrl,
    videoDuration: num(card.video?.capa?.duration || card.video?.media?.video?.duration),
    authorId: user.user_id || '',
    authorName: user.nickname || user.nick_name || '',
    authorAvatar: user.avatar || '',
    likedCount: num(interact.liked_count),
    collectedCount: num(interact.collected_count),
    commentCount: num(interact.comment_count),
    shareCount: num(interact.share_count ?? interact.shared_count),
    tags,
    publishTime: card.time || card.last_update_time || null,
    ipLocation: card.ip_location || '',
    source,
    noteUrl: `https://www.xiaohongshu.com/explore/${noteId}`,
    capturedAt: Date.now(),
  };
}

function normalizeLiveNotes(envelope, source, limit) {
  const data = envelope?.data;
  const items = Array.isArray(data) ? data
    : Array.isArray(data?.items) ? data.items
      : Array.isArray(data?.notes) ? data.notes
        : [];
  return items.map((item) => normalizeLiveNote(item, source)).filter(Boolean).slice(0, limit);
}

function normalizeComment(comment) {
  if (!comment || typeof comment !== 'object') return null;
  const user = comment.user_info || comment.user || {};
  return {
    commentId: comment.id || '',
    noteId: comment.note_id || '',
    content: comment.content || '',
    likedCount: num(comment.like_count),
    createdAt: comment.create_time || null,
    ipLocation: comment.ip_location || '',
    authorId: user.user_id || user.id || '',
    authorName: user.nickname || user.nick_name || '',
    authorAvatar: user.image || user.avatar || '',
    replyCount: num(comment.sub_comment_count),
    replies: (Array.isArray(comment.sub_comments) ? comment.sub_comments : [])
      .map(normalizeComment)
      .filter(Boolean),
  };
}

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
  const q = String(args?.query || '').trim().toLowerCase();
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
  let first = Infinity, last = -Infinity, dated = 0;
  const inter = [];
  for (const p of posts) {
    bySource[p.source || 'unknown'] = (bySource[p.source || 'unknown'] || 0) + 1;
    byType[p.type || 'normal'] = (byType[p.type || 'normal'] || 0) + 1;
    const cap = num(p.capturedAt);
    if (cap) { first = Math.min(first, cap); last = Math.max(last, cap); dated += 1; }
    const iv = interaction(p); inter.push(iv);
    for (const t of (Array.isArray(p.tags) ? p.tags : [])) tagCount[t] = (tagCount[t] || 0) + 1;
  }
  inter.sort((a, b) => a - b);
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([t, c]) => ({ tag: t, count: c }));
  return {
    total: posts.length, bySource, byType,
    dateRange: dated > 0 ? { first, last } : null,
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

async function tool_xhs_status() {
  const envelope = await runXhs(['status']);
  if (!envelope.ok) return envelope;
  const user = envelope.data?.user || {};
  return {
    ok: true,
    authenticated: Boolean(envelope.data?.authenticated),
    user: envelope.data?.authenticated ? {
      id: user.id || user.user_id || '',
      name: user.name || user.nickname || '',
      redId: user.red_id || user.username || '',
      description: user.desc || '',
    } : null,
  };
}

async function tool_xhs_search(args) {
  const query = String(args?.query || '').trim();
  if (!query) return cliError('invalid_arguments', '缺少 query 参数');
  const sort = ['general', 'popular', 'latest'].includes(args?.sort) ? args.sort : 'general';
  const type = ['all', 'video', 'image'].includes(args?.type) ? args.type : 'all';
  const page = boundedInt(args?.page, 1, 1, 100);
  const limit = boundedInt(args?.limit, 10, 1, 20);
  const envelope = await runXhs(['search', query, '--sort', sort, '--type', type, '--page', String(page)]);
  if (!envelope.ok) return envelope;
  return {
    ok: true,
    query,
    page,
    hasMore: Boolean(envelope.data?.has_more),
    notes: normalizeLiveNotes(envelope, 'cli_search', limit),
  };
}

async function tool_xhs_read(args) {
  const reference = String(args?.idOrUrl || args?.noteId || '').trim();
  if (!reference) return cliError('invalid_arguments', '缺少 idOrUrl 参数');
  const envelope = await runXhs(['read', reference]);
  if (!envelope.ok) return envelope;
  const notes = normalizeLiveNotes(envelope, 'cli_detail', 1);
  if (notes.length === 0) return cliError('note_not_found', 'CLI 返回成功，但没有可识别的笔记数据');
  return { ok: true, note: notes[0] };
}

async function tool_xhs_comments(args) {
  const reference = String(args?.idOrUrl || args?.noteId || '').trim();
  if (!reference) return cliError('invalid_arguments', '缺少 idOrUrl 参数');
  const limit = boundedInt(args?.limit, 20, 1, 100);
  const command = ['comments', reference];
  if (args?.cursor) command.push('--cursor', String(args.cursor));
  const envelope = await runXhs(command);
  if (!envelope.ok) return envelope;
  const comments = (Array.isArray(envelope.data?.comments) ? envelope.data.comments : [])
    .map(normalizeComment)
    .filter(Boolean)
    .slice(0, limit);
  return {
    ok: true,
    noteId: comments.find((comment) => comment.noteId)?.noteId || '',
    comments,
    hasMore: Boolean(envelope.data?.has_more),
    cursor: envelope.data?.cursor || '',
  };
}

async function tool_xhs_hot(args) {
  const categories = ['fashion', 'food', 'cosmetics', 'movie', 'career', 'love', 'home', 'gaming', 'travel', 'fitness'];
  const category = categories.includes(args?.category) ? args.category : 'food';
  const limit = boundedInt(args?.limit, 10, 1, 20);
  const envelope = await runXhs(['hot', '--category', category]);
  if (!envelope.ok) return envelope;
  return {
    ok: true,
    category,
    hasMore: Boolean(envelope.data?.has_more),
    notes: normalizeLiveNotes(envelope, `cli_hot_${category}`, limit),
  };
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
  { name: 'xhs_status', description: '通过本机 xiaohongshu-cli 只读检查登录状态和当前账号。不会返回 Cookie 或 xsec_token。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'xhs_search', description: '通过本机 xiaohongshu-cli 实时搜索小红书笔记，并归一化为插件语料字段。只读、串行执行。', inputSchema: { type: 'object', properties: { query: { type: 'string', description: '搜索关键词' }, sort: { type: 'string', enum: ['general', 'popular', 'latest'], default: 'general' }, type: { type: 'string', enum: ['all', 'video', 'image'], default: 'all' }, page: { type: 'integer', minimum: 1, maximum: 100, default: 1 }, limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 } }, required: ['query'], additionalProperties: false } },
  { name: 'xhs_read', description: '通过本机 xiaohongshu-cli 读取一条笔记详情，返回正文、标签、互动数、图片和视频信息。', inputSchema: { type: 'object', properties: { idOrUrl: { type: 'string', description: '笔记 ID 或完整小红书 URL；优先使用 xhs_search 返回的 noteId' } }, required: ['idOrUrl'], additionalProperties: false } },
  { name: 'xhs_comments', description: '通过本机 xiaohongshu-cli 读取一页评论并脱敏归一化；不会自动全量翻页。', inputSchema: { type: 'object', properties: { idOrUrl: { type: 'string', description: '笔记 ID 或完整小红书 URL' }, cursor: { type: 'string', description: '可选分页 cursor' }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 } }, required: ['idOrUrl'], additionalProperties: false } },
  { name: 'xhs_hot', description: '通过本机 xiaohongshu-cli 读取指定分类的热门笔记，并归一化为插件语料字段。', inputSchema: { type: 'object', properties: { category: { type: 'string', enum: ['fashion', 'food', 'cosmetics', 'movie', 'career', 'love', 'home', 'gaming', 'travel', 'fitness'], default: 'food' }, limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 } }, additionalProperties: false } },
];

const TOOL_HANDLERS = {
  search_notes: tool_search_notes,
  get_note: tool_get_note,
  list_creators: tool_list_creators,
  stats: tool_stats,
  trending_tags: tool_trending_tags,
  recent_notes: tool_recent_notes,
  xhs_status: tool_xhs_status,
  xhs_search: tool_xhs_search,
  xhs_read: tool_xhs_read,
  xhs_comments: tool_xhs_comments,
  xhs_hot: tool_xhs_hot,
};

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
        const fn = TOOL_HANDLERS[name];
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
