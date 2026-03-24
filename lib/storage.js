/**
 * IndexedDB 存储管理器
 * 负责帖子的存储、去重、查询和导出
 */

const DB_NAME = 'xhs_collector';
const DB_VERSION = 2;
const STORE_POSTS = 'posts';
const STORE_META = 'meta';
const STORE_ANALYSES = 'analyses';

// 默认容量配置
const DEFAULT_CAPACITY_LIMIT = 1000; // 默认最多存储1000条

class StorageManager {
  constructor() {
    this.db = null;
    this.capacityLimit = DEFAULT_CAPACITY_LIMIT;
  }

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
          // 用于按话题/标签查询
          store.createIndex('tags', 'tags', { multiEntry: true, unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains(STORE_ANALYSES)) {
          const aStore = db.createObjectStore(STORE_ANALYSES, { keyPath: 'id', autoIncrement: true });
          aStore.createIndex('createdAt', 'createdAt', { unique: false });
          aStore.createIndex('pageType', 'pageType', { unique: false });
        }
      };

      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * 保存一条帖子（自动去重，增量更新）
   */
  async savePost(post) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_POSTS, 'readwrite');
      const store = tx.objectStore(STORE_POSTS);

      // 先查是否已存在
      const getReq = store.get(post.noteId);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        let record;

        if (existing) {
          // 合并：保留更完整的数据，更新互动数据
          record = {
            ...existing,
            ...post,
            // 保留首次抓取时间
            capturedAt: existing.capturedAt,
            // 记录最后更新时间
            updatedAt: Date.now(),
            // 记录抓取次数
            captureCount: (existing.captureCount || 1) + 1,
            // 保留更完整的字段
            title: post.title || existing.title,
            content: post.content || existing.content,
            images: (post.images && post.images.length > 0) ? post.images : existing.images,
            videoUrl: post.videoUrl || existing.videoUrl,
          };
        } else {
          record = {
            ...post,
            capturedAt: Date.now(),
            updatedAt: Date.now(),
            captureCount: 1,
          };
        }

        store.put(record);
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * 批量保存帖子
   */
  async savePosts(posts) {
    let saved = 0;
    let updated = 0;
    for (const post of posts) {
      const existed = await this.hasPost(post.noteId);
      await this.savePost(post);
      if (existed) updated++;
      else saved++;
    }
    return { saved, updated };
  }

  /**
   * 检查帖子是否已存在
   */
  async hasPost(noteId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_POSTS, 'readonly');
      const req = tx.objectStore(STORE_POSTS).count(noteId);
      req.onsuccess = () => resolve(req.result > 0);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * 获取单条帖子
   */
  async getPost(noteId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_POSTS, 'readonly');
      const req = tx.objectStore(STORE_POSTS).get(noteId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * 获取所有帖子
   */
  async getAllPosts() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_POSTS, 'readonly');
      const req = tx.objectStore(STORE_POSTS).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * 获取帖子总数
   */
  async getPostCount() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_POSTS, 'readonly');
      const req = tx.objectStore(STORE_POSTS).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * 按来源统计
   */
  async getStatsBySource() {
    const posts = await this.getAllPosts();
    const stats = {};
    for (const p of posts) {
      const src = p.source || 'unknown';
      stats[src] = (stats[src] || 0) + 1;
    }
    return stats;
  }

  /**
   * 获取收集统计
   */
  async getStats() {
    const count = await this.getPostCount();
    const bySource = await this.getStatsBySource();
    const meta = await this.getMeta('stats') || {};
    return {
      totalPosts: count,
      bySource,
      lastCaptureAt: meta.lastCaptureAt || null,
      sessionCaptures: meta.sessionCaptures || 0,
    };
  }

  /**
   * 更新统计元数据
   */
  async updateCaptureStats(count) {
    const meta = await this.getMeta('stats') || { key: 'stats', sessionCaptures: 0 };
    meta.lastCaptureAt = Date.now();
    meta.sessionCaptures = (meta.sessionCaptures || 0) + count;
    await this.setMeta('stats', meta);
  }

  // ========== Meta store ==========

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

  // ========== 导出功能 ==========

  /**
   * 导出为 JSON（供模型训练）
   */
  async exportJSON() {
    const posts = await this.getAllPosts();
    return JSON.stringify(posts, null, 2);
  }

  /**
   * 导出为 JSONL（每行一条，适合大规模训练）
   */
  async exportJSONL() {
    const posts = await this.getAllPosts();
    return posts.map(p => JSON.stringify(p)).join('\n');
  }

  /**
   * 导出为 Markdown（人类可读 + RAG 友好）
   */
  async exportMarkdown() {
    const posts = await this.getAllPosts();
    const lines = [];

    lines.push('# 小红书内容收集\n');
    lines.push(`> 共 ${posts.length} 条帖子，导出时间：${new Date().toLocaleString('zh-CN')}\n`);

    for (const post of posts) {
      lines.push('---\n');
      lines.push(`## ${post.title || '无标题'}\n`);
      lines.push(`- **作者**: ${post.authorName || '未知'}`);
      lines.push(`- **类型**: ${post.type === 'video' ? '视频' : '图文'}`);
      lines.push(`- **点赞**: ${post.likedCount || 0} | **收藏**: ${post.collectedCount || 0} | **评论**: ${post.commentCount || 0}`);

      if (post.tags && post.tags.length > 0) {
        lines.push(`- **标签**: ${post.tags.map(t => '#' + t).join(' ')}`);
      }

      lines.push(`- **来源**: ${post.source || 'unknown'}`);
      lines.push(`- **抓取时间**: ${new Date(post.capturedAt).toLocaleString('zh-CN')}`);
      lines.push('');

      if (post.content) {
        lines.push(post.content);
        lines.push('');
      }

      if (post.images && post.images.length > 0) {
        lines.push('**图片**:');
        post.images.forEach((img, i) => {
          lines.push(`- ![图${i + 1}](${img})`);
        });
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * 导出为模型训练格式（对话式）
   */
  async exportTrainingData() {
    const posts = await this.getAllPosts();
    const training = posts
      .filter(p => p.content && p.content.length > 10)
      .map(p => ({
        instruction: `请分析以下小红书帖子的内容风格和主题：`,
        input: [
          p.title ? `标题：${p.title}` : '',
          `内容：${p.content}`,
          p.tags ? `标签：${p.tags.join('、')}` : '',
          `类型：${p.type === 'video' ? '视频笔记' : '图文笔记'}`,
          `互动数据：${p.likedCount || 0}赞 ${p.collectedCount || 0}藏 ${p.commentCount || 0}评`,
        ].filter(Boolean).join('\n'),
        output: '',  // 留空让模型生成
      }));

    return JSON.stringify(training, null, 2);
  }

  /**
   * 清空所有数据
   */
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

  // ========== 容量管理功能 ==========

  /**
   * 检查是否达到容量上限
   */
  async isCapacityReached() {
    const count = await this.getPostCount();
    return count >= this.capacityLimit;
  }

  /**
   * 获取容量使用情况
   */
  async getCapacityInfo() {
    const count = await this.getPostCount();
    return {
      current: count,
      limit: this.capacityLimit,
      percentage: Math.round((count / this.capacityLimit) * 100),
      isNearLimit: count >= this.capacityLimit * 0.8, // 80%以上算接近上限
      isReached: count >= this.capacityLimit
    };
  }

  /**
   * 设置容量上限
   */
  setCapacityLimit(limit) {
    this.capacityLimit = Math.max(100, Math.min(5000, limit)); // 限制在100-5000之间
  }

  /**
   * 清理N天前的数据
   */
  async clearOldData(days = 7) {
    await this.init();
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_POSTS, 'readwrite');
      const store = tx.objectStore(STORE_POSTS);
      const index = store.index('capturedAt');
      const range = IDBKeyRange.upperBound(cutoffTime);

      let deletedCount = 0;
      const request = index.openCursor(range);

      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve({ deleted: deletedCount });
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * 清理已导出的数据
   */
  async clearExportedData() {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_POSTS, 'readwrite');
      const store = tx.objectStore(STORE_POSTS);

      let deletedCount = 0;
      const request = store.openCursor();

      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const post = cursor.value;
          if (post.exported) {
            cursor.delete();
            deletedCount++;
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve({ deleted: deletedCount });
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * 标记数据为已导出
   */
  async markAsExported(noteIds) {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_POSTS, 'readwrite');
      const store = tx.objectStore(STORE_POSTS);

      let markedCount = 0;
      noteIds.forEach(noteId => {
        const getReq = store.get(noteId);
        getReq.onsuccess = () => {
          const post = getReq.result;
          if (post) {
            post.exported = true;
            post.exportedAt = Date.now();
            store.put(post);
            markedCount++;
          }
        };
      });

      tx.oncomplete = () => resolve({ marked: markedCount });
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * 清理最旧的N条数据
   */
  async clearOldestData(count = 100) {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_POSTS, 'readwrite');
      const store = tx.objectStore(STORE_POSTS);
      const index = store.index('capturedAt');

      let deletedCount = 0;
      const request = index.openCursor();

      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && deletedCount < count) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve({ deleted: deletedCount });
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ========== 分析结果存储 ==========

  async saveAnalysis(analysis) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_ANALYSES, 'readwrite');
      const record = { ...analysis, createdAt: Date.now() };
      const req = tx.objectStore(STORE_ANALYSES).add(record);
      req.onsuccess = () => resolve(req.result);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getAnalyses(limit = 20) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_ANALYSES, 'readonly');
      const index = tx.objectStore(STORE_ANALYSES).index('createdAt');
      const results = [];
      const req = index.openCursor(null, 'prev');
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve(results);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteAnalysis(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_ANALYSES, 'readwrite');
      tx.objectStore(STORE_ANALYSES).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }
}

// 单例导出
const storage = new StorageManager();
