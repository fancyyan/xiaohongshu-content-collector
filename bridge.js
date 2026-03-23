/**
 * bridge.js — 运行在 ISOLATED world
 *
 * 职责：
 * 1. 监听 injector.js 通过 postMessage 发来的帖子数据
 * 2. 转发给 background service worker 存储
 * 3. 处理 popup 的自动浏览控制指令
 * 4. DOM 扫描补充
 * 5. AI 多模态分析面板（文字 + 图片）
 */

(function () {
  'use strict';

  // ========== 安全辅助函数 ==========

  function isExtensionValid() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function safeSendMessage(msg, callback) {
    if (!isExtensionValid()) return;
    try {
      chrome.runtime.sendMessage(msg, (resp) => {
        try {
          if (chrome?.runtime?.lastError) return;
          if (callback) callback(resp);
        } catch (e) {}
      });
    } catch (e) {}
  }

  console.log('[XHS Collector] Bridge loaded (ISOLATED world)');

  // ========== 用户配置 ==========

  let USER_CONFIG = {
    // 频率控制配置
    rateLimit: {
      maxPerMinute: 25,
      maxPer5Min: 80,
      minInterval: 2500,
    },
    // 图片数量配置
    imageLimit: {
      detail: 6,
      feed: 8,
      profile: 8,
    },
    // 滚动行为配置
    scrollBehavior: {
      upScrollChance: 0.1,
      longPauseChance: 0.15,
      fatigueThreshold1: 50,
      fatigueThreshold2: 100,
    }
  };

  // 从 chrome.storage 加载配置
  async function loadUserConfig() {
    try {
      const result = await chrome.storage.sync.get('userConfig');
      if (result.userConfig) {
        USER_CONFIG = result.userConfig;
        console.log('[XHS Collector] 用户配置已加载', USER_CONFIG);
        // 更新频率控制器
        requestLimiter.maxPerMinute = USER_CONFIG.rateLimit.maxPerMinute;
        requestLimiter.maxPer5Min = USER_CONFIG.rateLimit.maxPer5Min;
        requestLimiter.minInterval = USER_CONFIG.rateLimit.minInterval;
      }
    } catch (error) {
      console.warn('[XHS Collector] 加载配置失败，使用默认配置', error);
    }
  }

  // 监听配置更新
  if (isExtensionValid()) {
    try {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'UPDATE_CONFIG') {
          USER_CONFIG = msg.config;
          console.log('[XHS Collector] 配置已更新', USER_CONFIG);
          // 更新频率控制器
          requestLimiter.maxPerMinute = USER_CONFIG.rateLimit.maxPerMinute;
          requestLimiter.maxPer5Min = USER_CONFIG.rateLimit.maxPer5Min;
          requestLimiter.minInterval = USER_CONFIG.rateLimit.minInterval;
          // 更新 API 配置
          updateAPIConfig();
          sendResponse({ ok: true });
          return true;
        }
      });
    } catch (e) {}
  }

  // 初始化时加载配置
  loadUserConfig();

  console.log('[XHS Collector] 用户配置系统已初始化');

  // ========== 简化版频率控制器 ==========

  const requestLimiter = {
    timestamps: [],
    maxPerMinute: USER_CONFIG.rateLimit.maxPerMinute,
    maxPer5Min: USER_CONFIG.rateLimit.maxPer5Min,
    minInterval: USER_CONFIG.rateLimit.minInterval,
    lastRequestTime: 0,

    checkRequest() {
      const now = Date.now();

      // 检查最小间隔
      if (now - this.lastRequestTime < this.minInterval) {
        return { allowed: false, waitTime: this.minInterval - (now - this.lastRequestTime) };
      }

      // 清理过期时间戳
      const fiveMinAgo = now - 5 * 60 * 1000;
      this.timestamps = this.timestamps.filter(t => t > fiveMinAgo);

      // 检查1分钟限制
      const oneMinAgo = now - 60 * 1000;
      const countLastMin = this.timestamps.filter(t => t > oneMinAgo).length;
      if (countLastMin >= this.maxPerMinute) {
        return { allowed: false, waitTime: 60000 };
      }

      // 检查5分钟限制
      if (this.timestamps.length >= this.maxPer5Min) {
        return { allowed: false, waitTime: 60000 };
      }

      return { allowed: true, waitTime: 0 };
    },

    recordRequest() {
      const now = Date.now();
      this.timestamps.push(now);
      this.lastRequestTime = now;
    },

    getSuggestedDelay() {
      const countLastMin = this.timestamps.filter(t => t > Date.now() - 60000).length;
      const ratio = countLastMin / this.maxPerMinute;

      if (ratio > 0.8) {
        return this.minInterval * (1.5 + Math.random());
      }
      return this.minInterval * (0.8 + Math.random() * 0.4);
    }
  };

  console.log('[XHS Collector] 频率控制器已加载');

  // ========== 数据缓存 ==========

  let currentPostData = null;
  let feedPostsCache = [];
  let profilePostsCache = [];
  let profileAuthorName = '';
  let onDataUpdated = null;

  // 最近一次分析结果（用于导出）
  let lastAnalysis = { label: '', markdown: '', pageType: '', timestamp: 0 };

  // ========== 接收 injector 的 postMessage ==========

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data?.__xhsCollector) return;

    if (event.data.type === 'XHS_POSTS_CAPTURED') {
      const { posts, apiUrl } = event.data;
      if (!posts || posts.length === 0) return;

      // ✅ 频率检查
      const check = requestLimiter.checkRequest();
      if (!check.allowed) {
        console.log(`[XHS] 请求限流，等待 ${Math.round(check.waitTime/1000)}秒`);
        setTimeout(() => {
          requestLimiter.recordRequest();
          processPosts(posts, apiUrl);
        }, check.waitTime);
        return;
      }

      // 记录请求
      requestLimiter.recordRequest();
      processPosts(posts, apiUrl);
    }
  });

  function processPosts(posts, apiUrl) {
    const source = posts[0]?.source;

    if (source === 'detail') {
      currentPostData = posts[0];
      if (onDataUpdated) onDataUpdated();
    } else if (source === 'homefeed' || source === 'search') {
      addPostsToCache(posts, 'feed');
    } else if (source === 'user_profile') {
      addPostsToCache(posts, 'profile');
    }

    safeSendMessage(
      { type: 'SAVE_POSTS', posts, url: apiUrl },
      (resp) => {
        if (resp?.saved > 0) console.log(`[XHS Collector] ✅ ${resp.saved} 新, ↻${resp.updated} 更新`);
      }
    );
  }

  // ========== popup/background 指令 ==========

  if (isExtensionValid()) {
    try {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'GET_PAGE_INFO') {
          sendResponse({ url: window.location.href, title: document.title, isXHS: true });
          return true;
        }
        if (msg.type === 'START_AUTO_SCROLL') { startAutoScroll(msg.config || {}); sendResponse({ ok: true }); return true; }
        if (msg.type === 'STOP_AUTO_SCROLL') { stopAutoScroll(); sendResponse({ ok: true }); return true; }
        if (msg.type === 'SCAN_DOM') { scanDOM(); sendResponse({ ok: true }); return true; }
        return false;
      });
    } catch (e) {}
  }

  // ========== 自动滚动（popup） ==========

  let scrollTimer = null;
  let scrollCfg = {};
  let scrollCount = 0;

  function startAutoScroll(config) {
    if (scrollTimer) return;
    scrollCfg = {
      maxScrolls: config.maxScrolls || 200,
      count: 0,
    };
    scrollCount = 0;
    doNextScroll();
  }

  function stopAutoScroll() {
    if (scrollTimer) {
      clearTimeout(scrollTimer);
      scrollTimer = null;
      safeSendMessage({ type: 'AUTO_SCROLL_STOPPED' });
    }
    // ✅ 同时停止面板采集
    stopCollecting();
  }

  function doNextScroll() {
    if (scrollCfg.count >= scrollCfg.maxScrolls) {
      stopAutoScroll();
      return;
    }

    scrollCount++;

    // ✅ 智能滚动距离（使用配置的向上滚动概率）
    let distance = 400 + Math.random() * 300;
    if (Math.random() < USER_CONFIG.scrollBehavior.upScrollChance) {
      distance = -(200 + Math.random() * 200);
    }

    // ✅ 智能间隔（带高斯分布）
    let interval = 2000 + Math.random() * 4000;
    interval += gaussRand() * 1000;
    interval = Math.max(1500, interval);

    // ✅ 随机长暂停（使用配置的长暂停概率）
    if (Math.random() < USER_CONFIG.scrollBehavior.longPauseChance) {
      interval = 5000 + Math.random() * 10000;
    }

    // ✅ 疲劳效应（使用配置的疲劳阈值）
    if (scrollCount > USER_CONFIG.scrollBehavior.fatigueThreshold1) interval *= 1.2;
    if (scrollCount > USER_CONFIG.scrollBehavior.fatigueThreshold2) interval *= 1.5;

    // ✅ 结合频率限制器的建议延迟
    const rateLimitDelay = requestLimiter.getSuggestedDelay();
    const finalDelay = Math.max(interval, rateLimitDelay);

    scrollTimer = setTimeout(() => {
      window.scrollBy({ top: distance, behavior: 'smooth' });
      scrollCfg.count++;
      doNextScroll();
    }, finalDelay);
  }

  function gaussRand() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ========== 面板自动采集 ==========

  let collectTimer = null;
  let collectCount = 0;
  let isCollecting = false;
  const COLLECT_MAX_SCROLLS = 30;

  function startCollecting(onDone) {
    if (isCollecting) return;
    isCollecting = true;
    collectCount = 0;
    doCollectScroll(onDone);
  }

  function stopCollecting() {
    if (collectTimer) { clearTimeout(collectTimer); collectTimer = null; }
    isCollecting = false;
  }

  function doCollectScroll(onDone) {
    if (!isCollecting || collectCount >= COLLECT_MAX_SCROLLS) {
      stopCollecting();
      if (onDone) onDone();
      return;
    }
    collectTimer = setTimeout(() => {
      // 增大滚动距离，确保能触发新的 API 请求
      window.scrollBy({ top: 600 + Math.random() * 500, behavior: 'smooth' });
      collectCount++;
      // 每次滚动后立即做一次 DOM 扫描，及时入缓存
      setTimeout(() => scanDOM(), 500);
      doCollectScroll(onDone);
    }, 2000 + Math.random() * 1500);
  }

  // ========== DOM 扫描 ==========

  function scanDOM() {
    const pageType = detectPageType();

    if (pageType === 'detail') {
      const noteId = window.location.pathname.split('/explore/')[1]?.split('?')[0];
      if (noteId && noteId.length > 8) {
        const post = extractDetailDOM(noteId);
        if (post) {
          if (!currentPostData) currentPostData = post;
          sendPosts([post]);
        }
      }
      return;
    }

    const cards = document.querySelectorAll('section.note-item:not([data-xhs-ok])');
    const posts = [];
    cards.forEach(card => {
      const p = extractCardDOM(card);
      if (p) { posts.push(p); card.setAttribute('data-xhs-ok', '1'); }
    });

    if (posts.length > 0) {
      // DOM 扫描到的帖子也写入内存缓存，保持面板计数与红点同步
      addPostsToCache(posts, pageType);
      sendPosts(posts);
    }
  }

  /** 将帖子加入对应的内存缓存（去重），返回新增数量 */
  function addPostsToCache(posts, pageType) {
    let newCount = 0;
    if (pageType === 'feed') {
      const existIds = new Set(feedPostsCache.map(p => p.noteId));
      for (const p of posts) {
        if (!existIds.has(p.noteId)) { feedPostsCache.push(p); existIds.add(p.noteId); newCount++; }
      }
      if (feedPostsCache.length > 200) feedPostsCache = feedPostsCache.slice(-200);
    } else if (pageType === 'profile') {
      const existIds = new Set(profilePostsCache.map(p => p.noteId));
      for (const p of posts) {
        if (!existIds.has(p.noteId)) { profilePostsCache.push(p); existIds.add(p.noteId); newCount++; }
      }
      if (posts[0]?.authorName) profileAuthorName = posts[0].authorName;
    }
    if (newCount > 0 && onDataUpdated) onDataUpdated();
    return newCount;
  }

  /**
   * 多选择器查询辅助函数
   * @param {string[]} selectors - 选择器数组
   * @returns {string} - 找到的文本内容
   */
  function queryWithFallback(selectors) {
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        const text = element?.textContent?.trim();
        if (text) return text;
      } catch (e) {
        continue;
      }
    }
    return '';
  }

  function extractDetailDOM(noteId) {
    try {
      // 标题选择器（多个备选）
      const titleSelectors = [
        '#detail-title',
        '.title',
        '.note-title',
        '[class*="title"]',
        'h1',
        '[data-title]'
      ];
      const title = queryWithFallback(titleSelectors);

      // 内容选择器（多个备选）
      const descSelectors = [
        '#detail-desc',
        '.note-text',
        '.desc',
        '.note-content',
        '[class*="content"]',
        '[class*="desc"]',
        '.note-scroller'
      ];
      const desc = queryWithFallback(descSelectors);

      // 作者选择器（多个备选）
      const authorSelectors = [
        '.author-wrapper .username',
        '.user-name',
        '.name',
        '[class*="author"]',
        '[class*="user-name"]'
      ];
      const author = queryWithFallback(authorSelectors);

      if (!title && !desc) return null;

      // 标签提取（多种方式）
      const tags = Array.from(document.querySelectorAll('a[href*="search_result"], .tag, [class*="tag"]'))
        .map(el => el.textContent?.trim()?.replace(/^#/, '')).filter(Boolean);

      // 图片提取（多个备选）
      const imageSelectors = [
        '.note-image-slider img',
        '.media-container img',
        '.note-detail img',
        '[class*="image"] img',
        '[class*="photo"] img'
      ];
      const images = [];
      imageSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(img => {
            const src = img.src || img.dataset?.src || img.dataset?.original;
            if (src) images.push(src);
          });
        } catch (e) {}
      });

      return {
        noteId,
        title: title || '',
        content: desc || '',
        authorName: author || '',
        tags: [...new Set(tags)],
        images: [...new Set(images)].filter(Boolean),
        source: 'dom_detail'
      };
    } catch (e) {
      console.warn('[XHS Collector] extractDetailDOM error:', e);
      return null;
    }
  }

  function extractCardDOM(card) {
    try {
      // 链接提取（多个备选）
      const linkSelectors = [
        'a[href*="/explore/"]',
        'a[href*="/note/"]',
        '[class*="link"]',
        'a'
      ];
      let noteId = null;
      for (const selector of linkSelectors) {
        const link = card.querySelector(selector);
        if (link) {
          const href = link.getAttribute('href') || '';
          noteId = href.split('/explore/')?.[1]?.split('?')?.[0] ||
                   href.split('/note/')?.[1]?.split('?')?.[0];
          if (noteId && noteId.length > 8) break;
        }
      }
      if (!noteId) return null;

      // 标题提取（多个备选）
      const titleSelectors = [
        '.title',
        'span',
        '[class*="title"]',
        'h3',
        'h4'
      ];
      let title = '';
      for (const selector of titleSelectors) {
        const el = card.querySelector(selector);
        if (el?.textContent?.trim()) {
          title = el.textContent.trim();
          break;
        }
      }

      // 作者提取（多个备选）
      const authorSelectors = [
        '.author-wrapper .name',
        '.author-name',
        '[class*="author"]',
        '[class*="user"]'
      ];
      let authorName = '';
      for (const selector of authorSelectors) {
        const el = card.querySelector(selector);
        if (el?.textContent?.trim()) {
          authorName = el.textContent.trim();
          break;
        }
      }

      // 封面图提取（多个备选）
      const imgSelectors = [
        'img',
        '[class*="cover"] img',
        '[class*="image"] img'
      ];
      let coverUrl = '';
      for (const selector of imgSelectors) {
        const img = card.querySelector(selector);
        if (img) {
          coverUrl = img.src || img.dataset?.src || img.dataset?.original || '';
          if (coverUrl) break;
        }
      }

      return {
        noteId,
        title,
        authorName,
        coverUrl,
        source: 'dom_feed',
      };
    } catch (e) {
      console.warn('[XHS Collector] extractCardDOM error:', e);
      return null;
    }
  }

  function sendPosts(posts) { safeSendMessage({ type: 'SAVE_POSTS', posts, url: 'dom' }); }

  let domScanInterval = setInterval(() => {
    if (!isExtensionValid()) { clearInterval(domScanInterval); stopAutoScroll(); stopCollecting(); return; }
    scanDOM();
  }, 8000);
  setTimeout(() => { if (isExtensionValid()) scanDOM(); }, 3000);

  // ========== AI 分析面板 ==========

  // API 配置（从用户配置中读取）
  let OPENROUTER_KEY = '';
  let AI_MODEL = 'google/gemini-2.0-flash-001';
  let API_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
  let API_PROVIDER = 'openrouter';

  // 更新 API 配置
  function updateAPIConfig() {
    if (USER_CONFIG.apiConfig) {
      if (USER_CONFIG.apiConfig.apiKey) {
        OPENROUTER_KEY = USER_CONFIG.apiConfig.apiKey;
      }
      if (USER_CONFIG.apiConfig.apiModel) {
        AI_MODEL = USER_CONFIG.apiConfig.apiModel;
      }
      if (USER_CONFIG.apiConfig.endpoint) {
        API_ENDPOINT = USER_CONFIG.apiConfig.endpoint;
      }
      if (USER_CONFIG.apiConfig.provider) {
        API_PROVIDER = USER_CONFIG.apiConfig.provider;
      }
      console.log('[XHS Collector] API 配置已更新:', {
        provider: API_PROVIDER,
        model: AI_MODEL,
        endpoint: API_ENDPOINT,
        hasKey: !!OPENROUTER_KEY
      });
    }
  }

  // 初始化时更新 API 配置
  setTimeout(() => updateAPIConfig(), 1000);

  // ---------- 图片处理（通过 background 代理） ----------

  /**
   * 通过 background service worker 获取图片并转为 base64
   * service worker 有 host_permissions 跨域权限 + 设置正确的 Referer
   */
  function fetchImageViaBackground(url) {
    return new Promise((resolve) => {
      if (!isExtensionValid()) { resolve(null); return; }
      try {
        chrome.runtime.sendMessage({ type: 'FETCH_IMAGE', url }, (resp) => {
          try {
            if (chrome?.runtime?.lastError) { resolve(null); return; }
            resolve(resp?.ok ? resp.data : null);
          } catch { resolve(null); }
        });
      } catch { resolve(null); }
    });
  }

  /**
   * 批量通过 background 获取图片
   * 走 background 的批量接口（更高效，减少消息来回）
   */
  function fetchImagesViaBackground(urls) {
    return new Promise((resolve) => {
      if (!isExtensionValid() || !urls.length) { resolve([]); return; }
      try {
        chrome.runtime.sendMessage({ type: 'FETCH_IMAGES', urls }, (resp) => {
          try {
            if (chrome?.runtime?.lastError) { resolve([]); return; }
            resolve(resp?.ok ? (resp.data || []) : []);
          } catch { resolve([]); }
        });
      } catch { resolve([]); }
    });
  }

  /**
   * 准备图片，带进度回调
   */
  async function prepareImages(urls, onProgress) {
    if (!urls.length) return [];

    // 全部交给 background 批量处理
    if (onProgress) onProgress(0, urls.length);
    const results = await fetchImagesViaBackground(urls);
    const valid = results.filter(Boolean);
    if (onProgress) onProgress(valid.length, urls.length);
    return valid;
  }

  // ---------- 图片 URL 收集 ----------

  /**
   * 从 DOM 直接抓取当前详情页可见图片
   */
  function getDOMImages() {
    const imgs = [];
    document.querySelectorAll('.note-image-slider img, .media-container img, .note-detail img').forEach(img => {
      const src = img.src || img.dataset?.src || img.dataset?.original;
      if (src && src.startsWith('http') && !src.includes('avatar') && !src.includes('icon')) {
        imgs.push(src);
      }
    });
    return [...new Set(imgs)];
  }

  /**
   * 获取帖子的图片 URL 列表（已去重）
   * 详情页：根据配置；信息流/博主主页：每篇取封面，根据配置
   */
  function getImageUrls(type) {
    if (type === 'detail') {
      let urls = [];
      if (currentPostData?.images?.length > 0) {
        urls = currentPostData.images;
      } else if (currentPostData?.coverUrl) {
        urls = [currentPostData.coverUrl];
      }
      if (urls.length === 0) urls = getDOMImages();
      const limit = USER_CONFIG.imageLimit.detail;
      return limit > 0 ? [...new Set(urls)].slice(0, limit) : [...new Set(urls)];
    }
    if (type === 'feed') {
      const sorted = [...feedPostsCache].sort((a, b) => (b.likedCount || 0) - (a.likedCount || 0));
      const urls = sorted.map(p => p.coverUrl || (p.images && p.images[0])).filter(Boolean);
      const limit = USER_CONFIG.imageLimit.feed;
      return limit > 0 ? urls.slice(0, limit) : urls;
    }
    if (type === 'profile') {
      const urls = profilePostsCache.map(p => p.coverUrl || (p.images && p.images[0])).filter(Boolean);
      const limit = USER_CONFIG.imageLimit.profile;
      return limit > 0 ? urls.slice(0, limit) : urls;
    }
    return [];
  }

  // ---------- 页面检测 ----------

  function detectPageType() {
    const path = window.location.pathname;
    if (path.includes('/explore/')) return 'detail';
    if (path.match(/\/user\/profile\//)) return 'profile';
    return 'feed';
  }

  function getCacheCount(type) {
    if (type === 'feed') return feedPostsCache.length;
    if (type === 'profile') return profilePostsCache.length;
    return currentPostData ? 1 : 0;
  }

  // ---------- Prompt 配置 ----------

  const IMG_HINT = '\n\n同时请仔细观察附带的图片，分析图片的视觉风格、构图、配色、场景，并将图片分析融入你的回答中。';

  const PROMPTS_DETAIL = {
    '📊 内容分析': '请从以下维度分析这篇小红书帖子：\n1. 内容主题和定位\n2. 写作风格和技巧\n3. 标题吸引力评分(1-10)\n4. 图片/视觉风格分析（构图、调色、场景感）\n5. 目标受众画像\n6. 互动数据解读（点赞/收藏/评论比例说明什么）\n\n请用简洁的中文回答。',
    '✍️ 仿写文案': '请模仿这篇小红书帖子的风格、语气和结构，写一篇类似主题但内容不同的小红书文案。要求：\n1. 保持相同的文风（口语化/专业/种草等）\n2. 使用类似的标题技巧\n3. 包含合适的emoji和话题标签\n4. 字数相当\n5. 同时描述配图建议（参考原帖图片风格）',
    '🔥 爆款潜力': '请评估这篇小红书帖子的爆款潜力：\n1. 爆款指数评分(1-10)，并说明理由\n2. 文字内容哪些元素有助于传播\n3. 图片/视觉表现力评分(1-10)及分析\n4. 有哪些可以改进的地方（文字 + 视觉）\n5. 给出3条具体的优化建议\n6. 建议的发布时间段',
    '🏷️ 标签建议': '根据这篇帖子的文字和图片内容，请：\n1. 分析当前标签是否合适\n2. 推荐10个更精准的话题标签（#xxx格式）\n3. 建议3个关键词用于搜索优化\n4. 指出内容最可能触达的用户圈层',
    '🎨 视觉诊断': '请专门分析这篇帖子的视觉表现：\n1. 图片整体风格（日系/韩系/简约/ins风/国风等）\n2. 构图分析（每张图的构图技巧）\n3. 色彩搭配评分(1-10)及建议\n4. 封面图吸引力评估\n5. 与同类爆款帖子的视觉差距\n6. 具体的视觉优化建议（拍摄角度、滤镜、排版等）',
  };

  const PROMPTS_FEED = {
    '📈 趋势洞察': '请分析以下推荐信息流中的帖子（含封面图），总结：\n1. 当前平台推荐的热门主题 TOP5\n2. 封面图的主流视觉风格（什么样的封面更容易被推荐）\n3. 高互动帖子的共同特征（文字+视觉）\n4. 值得关注的选题方向\n5. 整体内容调性分析',
    '🎯 选题推荐': '基于以下推荐信息流的内容和视觉趋势，请：\n1. 推荐5个当前最有潜力的选题方向\n2. 每个选题给出标题示例 + 封面构思\n3. 分析这些选题为什么可能火\n4. 给出每个选题的配图风格建议',
    '🏆 爆文拆解': '从以下信息流帖子中，找出互动数据最好的3篇，分别拆解：\n1. 标题和封面为什么吸引人\n2. 使用了什么视觉风格\n3. 哪些元素可以复用\n4. 给模仿者的具体建议（含配图指导）',
    '📊 数据报告': '请对以下信息流帖子做一份数据分析报告：\n1. 帖子数量统计\n2. 平均互动数据\n3. 封面风格分类及各类占比\n4. 高互动 vs 低互动帖子的视觉差异\n5. 标签使用频率 TOP10',
  };

  const PROMPTS_PROFILE = {
    '👤 博主画像': '请根据以下博主的所有帖子数据和封面图，分析：\n1. 博主的内容定位和垂直领域\n2. 视觉风格一致性评估\n3. 内容风格特征\n4. 粉丝画像推测\n5. 商业化能力评估',
    '📐 运营策略': '请分析这位博主的运营策略：\n1. 内容矩阵分析\n2. 视觉品牌建设（封面风格、色调一致性）\n3. 标题技巧总结\n4. 与同领域博主的差异化\n5. 给出3条提升建议（含视觉优化）',
    '🔥 爆款复盘': '请从这位博主的帖子和封面中：\n1. 找出互动最好的3篇，分析文字+视觉为什么成功\n2. 找出数据最差的3篇，分析视觉和内容问题\n3. 总结该博主的爆款公式（含视觉模板）\n4. 给出可复制的内容+视觉模板',
    '🎯 对标建议': '基于这位博主的内容和视觉特征：\n1. 推荐3个值得对标的方向\n2. 分析核心竞争力\n3. 视觉品牌改进方向\n4. 制定30天优化计划（含视觉升级）',
  };

  // ---------- 数据 → 文本 ----------

  function formatSinglePost(p) {
    const parts = [];
    if (p.title) parts.push(`标题：${p.title}`);
    if (p.content) parts.push(`正文：${p.content}`);
    if (p.authorName) parts.push(`作者：${p.authorName}`);
    if (p.tags && p.tags.length) parts.push(`标签：${p.tags.map(t => '#' + t).join(' ')}`);
    parts.push(`类型：${p.type === 'video' ? '视频笔记' : '图文笔记'}`);
    const stats = [];
    if (p.likedCount) stats.push(`${p.likedCount}赞`);
    if (p.collectedCount) stats.push(`${p.collectedCount}藏`);
    if (p.commentCount) stats.push(`${p.commentCount}评`);
    if (stats.length) parts.push(`互动：${stats.join(' ')}`);
    if (p.ipLocation) parts.push(`IP属地：${p.ipLocation}`);
    const imgCount = (p.images?.length || 0) + (p.coverUrl ? 1 : 0);
    if (imgCount > 0) parts.push(`图片数：${imgCount}张`);
    return parts.join('\n');
  }

  function formatPostList(posts, label) {
    if (!posts || posts.length === 0) return null;
    const lines = [`共 ${posts.length} 篇${label}：\n`];
    posts.forEach((p, i) => {
      lines.push(`【第${i + 1}篇】`);
      lines.push(formatSinglePost(p));
      lines.push('');
    });
    return lines.join('\n');
  }

  function getContextForPage() {
    const pageType = detectPageType();

    if (pageType === 'detail') {
      if (currentPostData) return { type: 'detail', text: formatSinglePost(currentPostData) };
      const title = document.querySelector('#detail-title, .title, .note-title')?.textContent?.trim() || '';
      const desc = document.querySelector('#detail-desc, .note-text, .desc, .note-content')?.textContent?.trim() || '';
      const author = document.querySelector('.author-wrapper .username, .user-name, .name')?.textContent?.trim() || '';
      const tags = Array.from(document.querySelectorAll('a[href*="search_result"], .tag'))
        .map(el => el.textContent?.trim()).filter(Boolean).join(' ');
      if (!title && !desc) return { type: 'detail', text: null };
      return {
        type: 'detail',
        text: [title ? `标题：${title}` : '', desc ? `正文：${desc}` : '', author ? `作者：${author}` : '', tags ? `标签：${tags}` : ''].filter(Boolean).join('\n'),
      };
    }

    if (pageType === 'profile') {
      const domAuthor = document.querySelector('.user-name, .user-nickname, h1')?.textContent?.trim() || '';
      const domBio = document.querySelector('.user-desc, .bio, .desc')?.textContent?.trim() || '';
      const authorInfo = [];
      const name = profileAuthorName || domAuthor;
      if (name) authorInfo.push(`博主：${name}`);
      if (domBio) authorInfo.push(`简介：${domBio}`);
      if (profilePostsCache.length > 0) {
        const header = authorInfo.length > 0 ? authorInfo.join('\n') + '\n\n' : '';
        return { type: 'profile', text: header + formatPostList(profilePostsCache, '博主帖子') };
      }
      return { type: 'profile', text: null };
    }

    if (feedPostsCache.length > 0) {
      return { type: 'feed', text: formatPostList(feedPostsCache, '推荐帖子') };
    }
    return { type: 'feed', text: null };
  }

  function getPromptsForType(type) {
    if (type === 'profile') return PROMPTS_PROFILE;
    if (type === 'feed') return PROMPTS_FEED;
    return PROMPTS_DETAIL;
  }

  function getPageLabel(type) {
    if (type === 'profile') return '👤 博主分析';
    if (type === 'feed') return '📈 信息流分析';
    return '🤖 AI 分析';
  }

  function getSystemPrompt(type) {
    const vision = '你同时具备图片分析能力，请仔细观察提供的图片并将视觉分析融入回答。';
    if (type === 'profile') return `你是一个专业的小红书博主运营顾问，擅长分析博主定位、内容策略、视觉品牌和商业变现。${vision}请用中文回答。`;
    if (type === 'feed') return `你是一个专业的小红书内容趋势分析师，擅长洞察平台内容和视觉趋势、预判爆款方向、分析封面设计。${vision}请用中文回答。`;
    return `你是一个专业的小红书内容分析师，擅长分析内容策略、写作技巧、视觉表现和用户运营。${vision}请用中文回答。`;
  }

  // ---------- 多模态 AI 调用 ----------

  /**
   * 调用 AI（支持多模态：文字 + 图片）
   * @param {string} systemPrompt
   * @param {string} textContent  文字部分
   * @param {string[]} base64Images  base64 data URL 数组（可为空）
   */
  async function callAI(systemPrompt, textContent, base64Images = []) {
    // 构建 user message 的 content 数组
    const userContent = [];

    // 文字
    userContent.push({ type: 'text', text: textContent });

    // 图片
    for (const b64 of base64Images) {
      userContent.push({
        type: 'image_url',
        image_url: { url: b64 },
      });
    }

    const imgNote = base64Images.length > 0
      ? `\n\n（已附带 ${base64Images.length} 张图片供你分析）`
      : '\n\n（未能获取图片，请仅基于文字信息分析）';

    userContent[0].text += imgNote;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    const resp = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
      },
      body: JSON.stringify({ model: AI_MODEL, messages, max_tokens: 3000, temperature: 0.7 }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`API 错误 ${resp.status}: ${err}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '未获得回复';
  }

  // 继续对话
  async function continueConversation(conversationHistory) {
    // 构建消息列表，只保留文本内容
    const messages = conversationHistory.map(msg => {
      if (msg.role === 'user' && msg.images) {
        // 第一条用户消息包含图片
        const content = [];
        content.push({ type: 'text', text: msg.content });
        for (const b64 of msg.images) {
          content.push({
            type: 'image_url',
            image_url: { url: b64 },
          });
        }
        return { role: 'user', content };
      } else {
        return { role: msg.role, content: msg.content };
      }
    });

    const resp = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
      },
      body: JSON.stringify({ model: AI_MODEL, messages, max_tokens: 3000, temperature: 0.7 }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`API 错误 ${resp.status}: ${err}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '未获得回复';
  }

  // HTML 转义
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ---------- UI ----------

  function injectAIPanel() {
    if (document.getElementById('xhs-ai-fab')) return;

    const pageType = detectPageType();

    const fab = document.createElement('button');
    fab.id = 'xhs-ai-fab';
    fab.title = 'AI 分析';
    fab.textContent = pageType === 'profile' ? '👤' : pageType === 'feed' ? '📈' : '🤖';
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.id = 'xhs-ai-panel';
    document.body.appendChild(panel);

    let statusBarEl, statusTextEl, statusCountEl, collectBtnEl;

    function updateStatusBar() {
      if (!statusBarEl) return;
      const type = detectPageType();
      if (type === 'detail') { statusBarEl.style.display = 'none'; return; }
      statusBarEl.style.display = 'flex';
      const count = getCacheCount(type);
      const label = type === 'profile' ? '博主帖子' : '推荐帖子';
      const imgCount = getImageUrls(type).length;
      const imgInfo = imgCount > 0 ? ` · ${imgCount}张图` : '';

      if (isCollecting) {
        statusTextEl.innerHTML = `<span class="xhs-status-dot collecting"></span>正在采集中...`;
        statusCountEl.textContent = `已获取 ${count} 篇${label}${imgInfo}`;
        collectBtnEl.textContent = '⏹ 停止';
        collectBtnEl.className = 'xhs-collect-btn stop';
      } else if (count > 0) {
        statusTextEl.innerHTML = `<span class="xhs-status-dot ready"></span>数据就绪`;
        statusCountEl.textContent = `已获取 ${count} 篇${label}${imgInfo}`;
        collectBtnEl.textContent = '📥 继续采集';
        collectBtnEl.className = 'xhs-collect-btn';
      } else {
        statusTextEl.innerHTML = `<span class="xhs-status-dot empty"></span>暂无数据`;
        statusCountEl.textContent = '点击下方按钮自动采集';
        collectBtnEl.textContent = '📥 开始采集';
        collectBtnEl.className = 'xhs-collect-btn';
      }
    }

    function updateFooterStats() {
      safeSendMessage({ type: 'GET_STATS' }, (stats) => {
        const el = panel.querySelector('.xhs-footer-stats');
        if (el && stats?.totalPosts) {
          el.textContent = `📦 数据库共 ${stats.totalPosts} 篇 · `;
        }
      });
    }

    onDataUpdated = () => { updateStatusBar(); updateFooterStats(); };

    function renderPanel() {
      const freshType = detectPageType();
      const freshPrompts = getPromptsForType(freshType);
      const label = getPageLabel(freshType);
      const count = getCacheCount(freshType);
      const needsCollect = freshType !== 'detail';
      const hasData = count > 0;
      const imgUrls = getImageUrls(freshType);

      panel.innerHTML = `
        <div class="xhs-panel-header">
          <h3>${label}</h3>
          <button class="xhs-panel-close">✕</button>
        </div>
        ${needsCollect ? `
        <div class="xhs-status-bar">
          <div class="xhs-status-info">
            <span class="xhs-status-text"></span>
            <span class="xhs-status-count"></span>
          </div>
          <button class="xhs-collect-btn">📥 开始采集</button>
        </div>
        ` : `
        <div class="xhs-status-bar" style="display:flex">
          <div class="xhs-status-info">
            <span class="xhs-status-text">${hasData
              ? `<span class="xhs-status-dot ready"></span>帖子已加载`
              : `<span class="xhs-status-dot empty"></span>等待加载`}</span>
            <span class="xhs-status-count">${imgUrls.length > 0
              ? `📸 ${imgUrls.length} 张图片可供分析`
              : '暂无图片'}</span>
          </div>
        </div>
        `}
        <div class="xhs-panel-actions">
          ${Object.keys(freshPrompts).map(k =>
            `<button class="xhs-action-btn${!hasData && needsCollect ? ' disabled' : ''}" data-prompt="${k}" ${!hasData && needsCollect ? 'disabled' : ''}>${k}</button>`
          ).join('')}
        </div>
        <div class="xhs-panel-result">
          <div class="placeholder">${hasData || !needsCollect
            ? '点击上方按钮，AI 将分析文字 + 图片内容'
            : '👆 先点击「开始采集」获取数据，再进行分析'}</div>
        </div>
        <div class="xhs-panel-footer"><span class="xhs-footer-stats"></span>🖼 多模态分析 · Powered by ${AI_MODEL}</div>
      `;

      statusBarEl = panel.querySelector('.xhs-status-bar');
      statusTextEl = panel.querySelector('.xhs-status-text');
      statusCountEl = panel.querySelector('.xhs-status-count');
      collectBtnEl = panel.querySelector('.xhs-collect-btn');

      // 定期从 IndexedDB 拉取总数，显示在底栏
      updateFooterStats();

      if (collectBtnEl) {
        updateStatusBar();
        collectBtnEl.addEventListener('click', () => {
          if (isCollecting) {
            stopCollecting();
            updateStatusBar();
            enableActionBtns();
          } else {
            startCollecting(() => { updateStatusBar(); enableActionBtns(); });
            updateStatusBar();
          }
        });
      }

      panel.querySelector('.xhs-panel-close').addEventListener('click', () => {
        panel.classList.remove('open');
        fab.classList.remove('hidden');
        stopCollecting();
      });

      // 分析按钮（多模态）
      panel.querySelectorAll('.xhs-action-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (btn.classList.contains('disabled')) return;

          const latestCtx = getContextForPage();
          const latestPrompts = getPromptsForType(latestCtx.type);
          const promptKey = btn.dataset.prompt;
          const prompt = latestPrompts[promptKey];
          const resultEl = panel.querySelector('.xhs-panel-result');

          if (!latestCtx.text) {
            resultEl.innerHTML = '<div class="placeholder">⚠️ 数据不足，请先采集更多内容</div>';
            return;
          }

          if (isCollecting) { stopCollecting(); updateStatusBar(); }

          panel.querySelectorAll('.xhs-action-btn').forEach(b => { b.style.opacity = '0.5'; b.style.pointerEvents = 'none'; });
          btn.style.opacity = '1';

          // 获取图片
          const imgUrls = getImageUrls(latestCtx.type);
          let base64Images = [];

          if (imgUrls.length > 0) {
            resultEl.innerHTML = '<div class="loading">📸 正在加载图片 (0/' + imgUrls.length + ')</div>';
            base64Images = await prepareImages(imgUrls, (done, total) => {
              const loadingEl = resultEl.querySelector('.loading');
              if (loadingEl) loadingEl.textContent = `📸 正在加载图片 (${done}/${total})`;
            });
            resultEl.innerHTML = `<div class="loading">🤖 AI 正在分析 ${base64Images.length} 张图片 + 文字...</div>`;
          } else {
            resultEl.innerHTML = '<div class="loading">🤖 AI 正在分析中...</div>';
          }

          try {
            const systemPrompt = getSystemPrompt(latestCtx.type);
            const userContent = `${prompt}\n\n---\n以下是数据：\n${latestCtx.text}`;
            const result = await callAI(systemPrompt, userContent, base64Images);

            // 存储分析结果（用于导出）
            lastAnalysis = {
              label: promptKey,
              markdown: result,
              pageType: latestCtx.type,
              timestamp: Date.now(),
              conversationHistory: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent, images: base64Images },
                { role: 'assistant', content: result }
              ]
            };

            // 渲染结果 + 操作栏 + 对话框
            resultEl.innerHTML = renderMarkdown(result) +
              `<div class="xhs-result-actions">
                <button class="xhs-export-btn" data-action="copy">📋 复制</button>
                <button class="xhs-export-btn" data-action="save">💾 保存为文件</button>
              </div>
              <div class="xhs-conversation">
                <div class="xhs-conversation-history"></div>
                <div class="xhs-conversation-suggestions">
                  <div class="xhs-suggestion-title">💡 你可以继续问：</div>
                  <button class="xhs-suggestion-btn" data-question="能详细解释一下这个分析结果吗？">能详细解释一下这个分析结果吗？</button>
                  <button class="xhs-suggestion-btn" data-question="有什么可以改进的建议吗？">有什么可以改进的建议吗？</button>
                  <button class="xhs-suggestion-btn" data-question="这个内容的目标受众是谁？">这个内容的目标受众是谁？</button>
                </div>
                <div class="xhs-conversation-input-wrapper">
                  <input type="text" class="xhs-conversation-text" placeholder="继续对话，追问更多问题..." />
                  <button class="xhs-conversation-send">发送</button>
                </div>
              </div>`;

            // 绑定导出按钮
            resultEl.querySelector('[data-action="copy"]').addEventListener('click', copyAnalysis);
            resultEl.querySelector('[data-action="save"]').addEventListener('click', exportAnalysis);

            // 绑定对话功能
            const conversationInput = resultEl.querySelector('.xhs-conversation-text');
            const conversationSend = resultEl.querySelector('.xhs-conversation-send');
            const conversationHistory = resultEl.querySelector('.xhs-conversation-history');
            const suggestionBtns = resultEl.querySelectorAll('.xhs-suggestion-btn');

            const sendMessage = async (message) => {
              if (!message || !message.trim()) return;

              message = message.trim();

              // 隐藏建议问题
              const suggestionsDiv = resultEl.querySelector('.xhs-conversation-suggestions');
              if (suggestionsDiv) {
                suggestionsDiv.style.display = 'none';
              }

              // 禁用输入
              conversationInput.disabled = true;
              conversationSend.disabled = true;
              conversationSend.textContent = '发送中...';

              try {
                // 添加用户消息到历史
                lastAnalysis.conversationHistory.push({
                  role: 'user',
                  content: message
                });

                // 在结果区域显示用户消息
                const userMsgDiv = document.createElement('div');
                userMsgDiv.className = 'xhs-conversation-message xhs-user-message';
                userMsgDiv.innerHTML = `<strong>你：</strong>${escapeHtml(message)}`;
                conversationHistory.appendChild(userMsgDiv);

                // 显示加载状态
                const loadingDiv = document.createElement('div');
                loadingDiv.className = 'xhs-conversation-message xhs-ai-message';
                loadingDiv.innerHTML = '<strong>AI：</strong><span class="loading">思考中...</span>';
                conversationHistory.appendChild(loadingDiv);

                // 滚动到底部
                conversationHistory.scrollTop = conversationHistory.scrollHeight;

                // 构建增强的上下文提示，包含小红书原文内容
                const originalContent = lastAnalysis.conversationHistory.find(msg => msg.role === 'user' && msg.content.includes('以下是数据：'));
                const contextPrompt = `你正在帮助用户分析小红书内容。这是一个连续对话，用户想要基于之前的分析继续深入了解。

【重要】请务必结合以下信息来回答：
1. 之前的分析结果（在对话历史中）
2. 小红书的原始内容（如果用户问题涉及具体细节，请直接引用原文）

用户的问题：${message}

回答要求：
- 如果问题涉及具体内容，请引用小红书原文中的关键信息
- 结合之前的分析结果，提供有针对性的回答
- 保持回答简洁、实用，避免重复之前已经说过的内容
- 如果需要补充建议，请给出具体可操作的建议`;

                // 更新最后一条用户消息，添加上下文
                lastAnalysis.conversationHistory[lastAnalysis.conversationHistory.length - 1].content = contextPrompt;

                // 调用AI继续对话
                const aiResponse = await continueConversation(lastAnalysis.conversationHistory);

                // 添加AI回复到历史（使用原始问题，不包含上下文提示）
                lastAnalysis.conversationHistory[lastAnalysis.conversationHistory.length - 1].content = message;
                lastAnalysis.conversationHistory.push({
                  role: 'assistant',
                  content: aiResponse
                });

                // 更新显示
                loadingDiv.innerHTML = `<strong>AI：</strong><div class="xhs-ai-response">${renderMarkdown(aiResponse)}</div>`;

                // 滚动到新内容的第一句话位置
                setTimeout(() => {
                  const aiResponseDiv = loadingDiv.querySelector('.xhs-ai-response');
                  if (aiResponseDiv) {
                    // 找到第一个实际内容元素（段落、列表项等）
                    const firstContentElement = aiResponseDiv.querySelector('p, li, h1, h2, h3, h4, h5, h6') || aiResponseDiv;

                    // 计算第一句话相对于对话历史容器的位置
                    const containerRect = conversationHistory.getBoundingClientRect();
                    const contentRect = firstContentElement.getBoundingClientRect();

                    // 计算滚动偏移量，让第一句话显示在容器顶部，留出一些边距
                    const scrollOffset = contentRect.top - containerRect.top + conversationHistory.scrollTop - 30;

                    conversationHistory.scrollTo({
                      top: scrollOffset,
                      behavior: 'smooth'
                    });
                  }
                }, 150);

                // 清空输入框
                conversationInput.value = '';

              } catch (err) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'xhs-conversation-message xhs-error-message';
                errorDiv.innerHTML = `<strong>错误：</strong>${escapeHtml(err.message)}`;
                conversationHistory.appendChild(errorDiv);
                conversationHistory.scrollTop = conversationHistory.scrollHeight;
              } finally {
                conversationInput.disabled = false;
                conversationSend.disabled = false;
                conversationSend.textContent = '发送';
                conversationInput.focus();
              }
            };

            // 绑定建议问题按钮
            suggestionBtns.forEach(btn => {
              btn.addEventListener('click', () => {
                const question = btn.dataset.question;
                conversationInput.value = question;
                sendMessage(question);
              });
            });

            conversationSend.addEventListener('click', () => sendMessage(conversationInput.value));
            conversationInput.addEventListener('keypress', (e) => {
              if (e.key === 'Enter') sendMessage(conversationInput.value);
            });
          } catch (err) {
            resultEl.innerHTML = `<div class="placeholder">❌ 分析失败：${err.message}</div>`;
          } finally {
            panel.querySelectorAll('.xhs-action-btn').forEach(b => { b.style.opacity = '1'; b.style.pointerEvents = 'auto'; });
          }
        });
      });
    }

    function enableActionBtns() {
      const count = getCacheCount(detectPageType());
      panel.querySelectorAll('.xhs-action-btn').forEach(btn => {
        if (count > 0) { btn.classList.remove('disabled'); btn.removeAttribute('disabled'); }
      });
      if (count > 0) {
        const placeholder = panel.querySelector('.xhs-panel-result .placeholder');
        if (placeholder && placeholder.textContent.includes('先点击')) {
          placeholder.textContent = '✅ 数据就绪，点击上方按钮开始分析';
        }
      }
    }

    fab.addEventListener('click', () => {
      const isOpen = panel.classList.contains('open');
      if (!isOpen) {
        renderPanel();
        const t = detectPageType();
        fab.textContent = t === 'profile' ? '👤' : t === 'feed' ? '📈' : '🤖';
        if (t !== 'detail' && getCacheCount(t) === 0) {
          setTimeout(() => { startCollecting(() => { updateStatusBar(); enableActionBtns(); }); updateStatusBar(); }, 500);
        }
      } else {
        stopCollecting();
      }
      panel.classList.toggle('open');
      fab.classList.toggle('hidden');
    });

    renderPanel();
  }

  /**
   * Markdown → HTML 渲染（增强版）
   * 支持：标题、加粗、斜体、代码块、行内代码、引用、列表、分割线、表格
   */
  function renderMarkdown(text) {
    // 1. 代码块 ```...```
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `\n%%CODEBLOCK%%<pre class="xhs-md-code"><code>${escaped}</code></pre>%%ENDCODE%%\n`;
    });

    const lines = text.split('\n');
    const html = [];
    let inList = false, inOl = false, inBlockquote = false;
    let inTable = false, tableRows = [];

    function closeList() { if (inList) { html.push('</ul>'); inList = false; } if (inOl) { html.push('</ol>'); inOl = false; } }
    function closeBq() { if (inBlockquote) { html.push('</blockquote>'); inBlockquote = false; } }
    function closeTable() {
      if (inTable && tableRows.length > 0) {
        let t = '<table class="xhs-md-table"><thead><tr>';
        tableRows[0].forEach(h => { t += `<th>${inlineFmt(h.trim())}</th>`; });
        t += '</tr></thead><tbody>';
        for (let r = 2; r < tableRows.length; r++) {
          t += '<tr>'; tableRows[r].forEach(c => { t += `<td>${inlineFmt(c.trim())}</td>`; }); t += '</tr>';
        }
        t += '</tbody></table>'; html.push(t); tableRows = []; inTable = false;
      }
    }

    for (const line of lines) {
      // 代码块占位
      if (line.includes('%%CODEBLOCK%%')) {
        closeList(); closeBq(); closeTable();
        html.push(line.replace('%%CODEBLOCK%%', '').replace('%%ENDCODE%%', ''));
        continue;
      }

      // 表格
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        closeList(); closeBq();
        const cells = line.trim().slice(1, -1).split('|');
        if (!inTable) inTable = true;
        tableRows.push(cells); continue;
      } else if (inTable) { closeTable(); }

      // 分割线
      if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) { closeList(); closeBq(); html.push('<hr class="xhs-md-hr">'); continue; }

      // 标题
      const h4m = line.match(/^####\s+(.+)/); if (h4m) { closeList(); closeBq(); html.push(`<h5 class="xhs-md-h5">${inlineFmt(h4m[1])}</h5>`); continue; }
      const h3m = line.match(/^###\s+(.+)/);  if (h3m) { closeList(); closeBq(); html.push(`<h4 class="xhs-md-h4">${inlineFmt(h3m[1])}</h4>`); continue; }
      const h2m = line.match(/^##\s+(.+)/);   if (h2m) { closeList(); closeBq(); html.push(`<h3 class="xhs-md-h3">${inlineFmt(h2m[1])}</h3>`); continue; }
      const h1m = line.match(/^#\s+(.+)/);    if (h1m) { closeList(); closeBq(); html.push(`<h2 class="xhs-md-h2">${inlineFmt(h1m[1])}</h2>`); continue; }

      // 引用
      const bq = line.match(/^>\s?(.*)/);
      if (bq) { closeList(); if (!inBlockquote) { html.push('<blockquote class="xhs-md-bq">'); inBlockquote = true; } html.push(`<p>${inlineFmt(bq[1])}</p>`); continue; }
      else if (inBlockquote) { closeBq(); }

      // 无序列表
      const ul = line.match(/^\s*[-*+]\s+(.+)/);
      if (ul) { if (inOl) { html.push('</ol>'); inOl = false; } if (!inList) { html.push('<ul class="xhs-md-ul">'); inList = true; } html.push(`<li>${inlineFmt(ul[1])}</li>`); continue; }

      // 有序列表
      const ol = line.match(/^\s*(\d+)[.)]\s+(.+)/);
      if (ol) { if (inList) { html.push('</ul>'); inList = false; } if (!inOl) { html.push('<ol class="xhs-md-ol">'); inOl = true; } html.push(`<li>${inlineFmt(ol[2])}</li>`); continue; }

      closeList();
      if (line.trim() === '') { html.push('<div class="xhs-md-spacer"></div>'); }
      else { html.push(`<p class="xhs-md-p">${inlineFmt(line)}</p>`); }
    }
    closeList(); closeBq(); closeTable();
    return html.join('\n');
  }

  /** 行内格式：加粗、斜体、行内代码、链接、#标签 */
  function inlineFmt(text) {
    return text
      .replace(/`([^`]+)`/g, '<code class="xhs-md-icode">$1</code>')
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="xhs-md-link">$1</a>')
      .replace(/(#[\u4e00-\u9fa5a-zA-Z0-9_]+)/g, '<span class="xhs-md-tag">$1</span>');
  }

  /** 导出分析结果为 Markdown 文件 */
  function exportAnalysis() {
    if (!lastAnalysis.markdown) return;
    const t = lastAnalysis.pageType;
    const typeLabel = t === 'profile' ? '博主分析' : t === 'feed' ? '信息流分析' : '帖子分析';
    const d = new Date(lastAnalysis.timestamp);
    const ds = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
    const content = `# 小红书${typeLabel} - ${lastAnalysis.label}\n\n> 分析时间：${d.toLocaleString('zh-CN')}\n> 页面：${window.location.href}\n\n---\n\n${lastAnalysis.markdown}\n`;
    safeSendMessage({ type: 'EXPORT_ANALYSIS', content, filename: `xhs_${typeLabel}_${ds}.md` }, (resp) => {
      if (resp?.ok) showToast('✅ 已保存到下载目录');
    });
  }

  /** 复制分析结果到剪贴板 */
  async function copyAnalysis() {
    if (!lastAnalysis.markdown) return;
    try {
      await navigator.clipboard.writeText(lastAnalysis.markdown);
      showToast('✅ 已复制到剪贴板');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = lastAnalysis.markdown;
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      showToast('✅ 已复制到剪贴板');
    }
  }

  function showToast(msg) {
    let toast = document.getElementById('xhs-ai-toast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'xhs-ai-toast'; document.body.appendChild(toast); }
    toast.textContent = msg; toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  }

  function initAIPanel() {
    if (!document.body) { setTimeout(initAIPanel, 300); return; }
    setTimeout(injectAIPanel, 1500);

    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        currentPostData = null;
        stopCollecting();
        const newType = detectPageType();
        if (newType !== 'profile') { profilePostsCache = []; profileAuthorName = ''; }
        if (newType !== 'feed') feedPostsCache = [];
        const oldFab = document.getElementById('xhs-ai-fab');
        const oldPanel = document.getElementById('xhs-ai-panel');
        if (oldFab) oldFab.remove();
        if (oldPanel) oldPanel.remove();
        setTimeout(injectAIPanel, 1500);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAIPanel);
  } else {
    initAIPanel();
  }

})();
