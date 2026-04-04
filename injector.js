/**
 * injector.js — 运行在页面主 world (MAIN)
 *
 * 拦截 fetch/XHR 响应，通过 postMessage 发送给 bridge.js
 * 此脚本可以覆写页面的 window.fetch，因为它和页面共享同一个 JS 上下文
 */

(function () {
  'use strict';

  if (window.__xhsCollectorInjected) return;
  window.__xhsCollectorInjected = true;

  const API_PATTERNS = [
    '/api/sns/web/v1/homefeed',
    '/api/sns/web/v1/search/notes',
    '/api/sns/web/v1/feed',
    '/api/sns/web/v1/user_posted',
  ];

  function isTargetUrl(url) {
    return API_PATTERNS.some(p => url.includes(p));
  }

  // ========== 解析器 ==========

  function parseResponse(url, data) {
    if (!data || data.success === false) return [];

    try {
      if (url.includes('/homefeed')) return parseNoteList(data, 'homefeed');
      if (url.includes('/search/notes')) return parseNoteList(data, 'search');
      if (url.includes('/feed')) return parseNoteList(data, 'detail');
      if (url.includes('/user_posted')) return parseUserPosts(data);
    } catch (e) {
      console.warn('[XHS Collector] Parse error:', e);
    }
    return [];
  }

  function parseNoteList(data, source) {
    const posts = [];
    const items = data?.data?.items || [];

    for (const item of items) {
      const n = item?.note_card;
      if (!n) continue;

      posts.push({
        noteId: n.note_id || item.id,
        type: n.type === 'video' ? 'video' : 'image',
        title: n.display_title || n.title || '',
        content: n.desc || '',
        coverUrl: n.cover?.url_default || n.cover?.url_pre || '',
        images: (n.image_list || []).map(img => img.url_default || img.url_pre).filter(Boolean),
        videoUrl: n.video?.media?.stream?.h264?.[0]?.master_url || n.video?.media?.stream?.h265?.[0]?.master_url || '',
        videoDuration: n.video?.capa?.duration || n.video?.media?.video?.duration || 0,
        authorId: n.user?.user_id || '',
        authorName: n.user?.nickname || '',
        authorAvatar: n.user?.avatar || '',
        likedCount: n.interact_info?.liked_count || 0,
        collectedCount: n.interact_info?.collected_count || 0,
        commentCount: n.interact_info?.comment_count || 0,
        shareCount: n.interact_info?.share_count || 0,
        tags: (n.tag_list || []).filter(t => t.type === 'topic').map(t => t.name),
        publishTime: n.time || null,
        ipLocation: n.ip_location || '',
        source,
        xsecToken: item.xsec_token || '',
      });
    }
    return posts;
  }

  function parseUserPosts(data) {
    const posts = [];
    const notes = data?.data?.notes || [];
    for (const n of notes) {
      posts.push({
        noteId: n.note_id || n.id,
        type: n.type === 'video' ? 'video' : 'image',
        title: n.display_title || '',
        coverUrl: n.cover?.url_default || '',
        likedCount: n.interact_info?.liked_count || 0,
        authorId: n.user?.user_id || '',
        authorName: n.user?.nickname || '',
        source: 'user_profile',
        xsecToken: n.xsec_token || '',
      });
    }
    return posts;
  }

  // ========== 发送到 bridge ==========

  function emitPosts(posts, apiUrl) {
    if (posts.length === 0) return;
    window.postMessage({
      __xhsCollector: true,
      type: 'XHS_POSTS_CAPTURED',
      posts,
      apiUrl,
    }, '*');
  }

  // ========== 拦截 fetch ==========

  const origFetch = window.fetch;

  window.fetch = async function (...args) {
    const resp = await origFetch.apply(this, args);

    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (isTargetUrl(url)) {
        const clone = resp.clone();
        clone.json().then(data => {
          const posts = parseResponse(url, data);
          emitPosts(posts, url);
        }).catch(() => {});
      }
    } catch (e) {}

    return resp;
  };

  // ========== 拦截 XMLHttpRequest ==========

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__xhsUrl = url;
    return origOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const url = this.__xhsUrl || '';
    if (isTargetUrl(url)) {
      this.addEventListener('load', function () {
        try {
          const data = JSON.parse(this.responseText);
          const posts = parseResponse(url, data);
          emitPosts(posts, url);
        } catch (e) {}
      });
    }
    return origSend.apply(this, args);
  };

  console.log('[XHS Collector] API interceptor injected (MAIN world)');
})();
