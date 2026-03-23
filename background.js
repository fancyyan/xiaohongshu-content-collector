/**
 * 小红书内容收集器 - Background Service Worker
 */

// ========== 错误处理工具 ==========

/**
 * 清理错误消息，避免泄露敏感信息
 * @param {Error} error - 原始错误对象
 * @returns {string} - 安全的错误消息
 */
function sanitizeError(error) {
  if (!error) return '未知错误';

  let message = error.message || String(error);

  // 移除可能包含敏感信息的内容
  const sensitivePatterns = [
    /key[=:\s]+[^\s]+/gi,
    /token[=:\s]+[^\s]+/gi,
    /secret[=:\s]+[^\s]+/gi,
    /password[=:\s]+[^\s]+/gi,
    /authorization[=:\s]+[^\s]+/gi,
    /bearer\s+[^\s]+/gi,
    /sk-[a-zA-Z0-9-]+/gi,  // API keys
  ];

  sensitivePatterns.forEach(pattern => {
    message = message.replace(pattern, '[已隐藏]');
  });

  // 限制错误消息长度
  if (message.length > 200) {
    message = message.substring(0, 200) + '...';
  }

  return message;
}

/**
 * 安全的错误响应包装器
 * @param {Error} error - 错误对象
 * @returns {Object} - 安全的错误响应
 */
function createErrorResponse(error) {
  const safeMessage = sanitizeError(error);
  console.error('[XHS Collector] Error:', error);
  return { error: safeMessage };
}

// ========== IndexedDB 存储（内联） ==========

const DB_NAME = 'xhs_collector';
const DB_VERSION = 1;
const STORE_POSTS = 'posts';
const STORE_META = 'meta';

class StorageManager {
  constructor() { this.db = null; }

  async init() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_POSTS)) {
          const store = db.createObjectStore(STORE_POSTS, { keyPath: 'noteId' });
          store.createIndex('capturedAt', 'capturedAt', { unique: false });
          store.createIndex('source', 'source', { unique: false });
          store.createIndex('authorId', 'authorId', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('tags', 'tags', { multiEntry: true, unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async savePost(post) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_POSTS, 'readwrite');
      const store = tx.objectStore(STORE_POSTS);
      const getReq = store.get(post.noteId);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        let record;
        if (existing) {
          record = { ...existing, ...post,
            capturedAt: existing.capturedAt,
            updatedAt: Date.now(),
            captureCount: (existing.captureCount || 1) + 1,
            title: post.title || existing.title,
            content: post.content || existing.content,
            images: (post.images && post.images.length > 0) ? post.images : existing.images,
            videoUrl: post.videoUrl || existing.videoUrl,
          };
        } else {
          record = { ...post, capturedAt: Date.now(), updatedAt: Date.now(), captureCount: 1 };
        }
        store.put(record);
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async savePosts(posts) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_POSTS, 'readwrite');
      const store = tx.objectStore(STORE_POSTS);

      let saved = 0, updated = 0;
      let completed = 0;
      const total = posts.length;

      posts.forEach(post => {
        const getReq = store.get(post.noteId);
        getReq.onsuccess = () => {
          const existing = getReq.result;
          let record;

          if (existing) {
            updated++;
            record = {
              ...existing,
              ...post,
              capturedAt: existing.capturedAt,
              updatedAt: Date.now(),
              captureCount: (existing.captureCount || 1) + 1,
              title: post.title || existing.title,
              content: post.content || existing.content,
              images: (post.images && post.images.length > 0) ? post.images : existing.images,
              videoUrl: post.videoUrl || existing.videoUrl,
            };
          } else {
            saved++;
            record = {
              ...post,
              capturedAt: Date.now(),
              updatedAt: Date.now(),
              captureCount: 1
            };
          }

          store.put(record);
          completed++;
        };
        getReq.onerror = () => {
          completed++;
        };
      });

      tx.oncomplete = () => resolve({ saved, updated });
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async hasPost(noteId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_POSTS, 'readonly');
      const req = tx.objectStore(STORE_POSTS).count(noteId);
      req.onsuccess = () => resolve(req.result > 0);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllPosts() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_POSTS, 'readonly');
      const req = tx.objectStore(STORE_POSTS).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getPostCount() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_POSTS, 'readonly');
      const req = tx.objectStore(STORE_POSTS).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getStatsBySource() {
    const posts = await this.getAllPosts();
    const stats = {};
    for (const p of posts) { const src = p.source || 'unknown'; stats[src] = (stats[src] || 0) + 1; }
    return stats;
  }

  async getStats() {
    const count = await this.getPostCount();
    const bySource = await this.getStatsBySource();
    const meta = await this.getMeta('stats') || {};
    return { totalPosts: count, bySource, lastCaptureAt: meta.lastCaptureAt || null, sessionCaptures: meta.sessionCaptures || 0 };
  }

  async updateCaptureStats(count) {
    const meta = await this.getMeta('stats') || { key: 'stats', sessionCaptures: 0 };
    meta.lastCaptureAt = Date.now();
    meta.sessionCaptures = (meta.sessionCaptures || 0) + count;
    await this.setMeta('stats', meta);
  }

  async getMeta(key) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_META, 'readonly');
      const req = tx.objectStore(STORE_META).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async setMeta(key, value) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put({ ...value, key });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async exportJSON() {
    const posts = await this.getAllPosts();
    return JSON.stringify(posts, null, 2);
  }

  async exportJSONL() {
    const posts = await this.getAllPosts();
    return posts.map(p => JSON.stringify(p)).join('\n');
  }

  async exportMarkdown() {
    const posts = await this.getAllPosts();
    const lines = ['# 小红书内容收集\n', `> 共 ${posts.length} 条帖子，导出时间：${new Date().toLocaleString('zh-CN')}\n`];
    for (const post of posts) {
      lines.push('---\n', `## ${post.title || '无标题'}\n`);
      lines.push(`- **作者**: ${post.authorName || '未知'}`);
      lines.push(`- **类型**: ${post.type === 'video' ? '视频' : '图文'}`);
      lines.push(`- **点赞**: ${post.likedCount || 0} | **收藏**: ${post.collectedCount || 0} | **评论**: ${post.commentCount || 0}`);
      if (post.tags && post.tags.length > 0) lines.push(`- **标签**: ${post.tags.map(t => '#' + t).join(' ')}`);
      lines.push(`- **来源**: ${post.source || 'unknown'}`, `- **抓取时间**: ${new Date(post.capturedAt).toLocaleString('zh-CN')}`, '');
      if (post.content) lines.push(post.content, '');
      if (post.images && post.images.length > 0) { lines.push('**图片**:'); post.images.forEach((img, i) => lines.push(`- ![图${i + 1}](${img})`)); lines.push(''); }
    }
    return lines.join('\n');
  }

  async exportTrainingData() {
    const posts = await this.getAllPosts();
    const training = posts.filter(p => p.content && p.content.length > 10).map(p => ({
      instruction: '请分析以下小红书帖子的内容风格和主题：',
      input: [p.title ? `标题：${p.title}` : '', `内容：${p.content}`, p.tags ? `标签：${p.tags.join('、')}` : '',
        `类型：${p.type === 'video' ? '视频笔记' : '图文笔记'}`, `互动数据：${p.likedCount || 0}赞 ${p.collectedCount || 0}藏 ${p.commentCount || 0}评`].filter(Boolean).join('\n'),
      output: '',
    }));
    return JSON.stringify(training, null, 2);
  }

  async clearAll() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_POSTS, STORE_META], 'readwrite');
      tx.objectStore(STORE_POSTS).clear();
      tx.objectStore(STORE_META).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }
}

const storage = new StorageManager();

// ========== 消息处理 ==========

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SAVE_POSTS') {
    handleSavePosts(msg.posts).then(r => sendResponse(r)).catch(e => sendResponse(createErrorResponse(e)));
    return true;
  }
  if (msg.type === 'GET_STATS') {
    storage.getStats().then(s => sendResponse(s)).catch(e => sendResponse(createErrorResponse(e)));
    return true;
  }
  if (msg.type === 'EXPORT_DATA') {
    handleExport(msg.format).then(r => sendResponse(r)).catch(e => sendResponse(createErrorResponse(e)));
    return true;
  }
  if (msg.type === 'CLEAR_DATA') {
    storage.clearAll().then(() => { updateBadge(0); sendResponse({ ok: true }); }).catch(e => sendResponse(createErrorResponse(e)));
    return true;
  }
  if (msg.type === 'AUTO_SCROLL_STOPPED') {
    // 转发给 popup 以便更新按钮状态和停止刷新
    chrome.runtime.sendMessage({ type: 'AUTO_SCROLL_STOPPED' }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }
  // 代理获取图片并转 base64（绕过内容脚本的跨域限制）
  if (msg.type === 'FETCH_IMAGE') {
    fetchImageAsBase64(msg.url)
      .then(b64 => sendResponse({ ok: true, data: b64 }))
      .catch(e => sendResponse({ ok: false, error: sanitizeError(e) }));
    return true;
  }
  // 批量获取图片
  if (msg.type === 'FETCH_IMAGES') {
    fetchImagesAsBase64(msg.urls)
      .then(results => sendResponse({ ok: true, data: results }))
      .catch(e => sendResponse({ ok: false, error: sanitizeError(e) }));
    return true;
  }
  // 导出分析结果
  if (msg.type === 'EXPORT_ANALYSIS') {
    const dataUrl = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(msg.content);
    chrome.downloads.download({ url: dataUrl, filename: msg.filename, saveAs: true })
      .then(id => sendResponse({ ok: true, downloadId: id }))
      .catch(e => sendResponse({ ok: false, error: sanitizeError(e) }));
    return true;
  }
});

// ========== 核心 ==========

async function handleSavePosts(posts) {
  if (!posts || posts.length === 0) return { saved: 0, updated: 0 };
  const result = await storage.savePosts(posts);
  await storage.updateCaptureStats(result.saved);
  const count = await storage.getPostCount();
  updateBadge(count);
  if (result.saved > 0) console.log(`[XHS] +${result.saved} new, ↻${result.updated} updated (total: ${count})`);
  return result;
}

async function handleExport(format) {
  let content, filename, mimeType;
  switch (format) {
    case 'json': content = await storage.exportJSON(); filename = `xhs_posts_${ds()}.json`; mimeType = 'application/json'; break;
    case 'jsonl': content = await storage.exportJSONL(); filename = `xhs_posts_${ds()}.jsonl`; mimeType = 'application/jsonl'; break;
    case 'markdown': content = await storage.exportMarkdown(); filename = `xhs_posts_${ds()}.md`; mimeType = 'text/markdown'; break;
    case 'training': content = await storage.exportTrainingData(); filename = `xhs_training_${ds()}.json`; mimeType = 'application/json'; break;
    default: throw new Error('Unknown format: ' + format);
  }
  const dataUrl = 'data:' + mimeType + ';charset=utf-8,' + encodeURIComponent(content);
  const downloadId = await chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
  return { ok: true, filename, downloadId };
}

function updateBadge(count) {
  const text = count > 999 ? `${Math.floor(count / 1000)}k` : count > 0 ? String(count) : '';
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: '#FF2442' });
}

function ds() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
}

storage.getPostCount().then(c => updateBadge(c)).catch(() => {});
console.log('[XHS Collector] Background ready');

// ========== 图片代理获取 ==========

/**
 * Service Worker 代理获取图片并转为 base64 data URL
 * Service Worker 拥有 host_permissions 中声明的跨域权限
 */
async function fetchImageAsBase64(url) {
  try {
    const resp = await fetch(url, {
      headers: {
        'Referer': 'https://www.xiaohongshu.com/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const arrayBuffer = await resp.arrayBuffer();
    const contentType = resp.headers.get('content-type') || 'image/jpeg';

    // ArrayBuffer → base64
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    // 分块处理避免调用栈溢出
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    const base64 = btoa(binary);
    return `data:${contentType};base64,${base64}`;
  } catch (e) {
    console.warn('[XHS] Failed to fetch image:', url, e.message);
    return null;
  }
}

/**
 * 批量获取图片，3 个一批并发，每张 10 秒超时
 */
async function fetchImagesAsBase64(urls) {
  const results = [];
  for (let i = 0; i < urls.length; i += 3) {
    const batch = urls.slice(i, i + 3);
    const batchResults = await Promise.all(
      batch.map(url => Promise.race([
        fetchImageAsBase64(url),
        new Promise(r => setTimeout(() => r(null), 10000)),
      ]))
    );
    results.push(...batchResults);
  }
  return results;
}

// ========== 首次安装引导 ==========

/**
 * 首次安装时打开欢迎页面
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'onboarding.html' });
  }
});
