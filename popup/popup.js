/**
 * Popup 逻辑
 */

let statsRefreshTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  checkPageStatus();
  bindEvents();
});

/** 开始定时刷新统计（自动浏览期间每 2 秒更新一次） */
function startStatsRefresh() {
  stopStatsRefresh();
  statsRefreshTimer = setInterval(loadStats, 2000);
}

/** 停止定时刷新 */
function stopStatsRefresh() {
  if (statsRefreshTimer) { clearInterval(statsRefreshTimer); statsRefreshTimer = null; }
}

// ========== 统计加载 ==========

async function loadStats() {
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, (stats) => {
    if (chrome.runtime.lastError || stats?.error) return;

    document.getElementById('totalPosts').textContent = stats.totalPosts || 0;
    document.getElementById('sessionCaptures').textContent = stats.sessionCaptures || 0;

    if (stats.lastCaptureAt) {
      const ago = timeAgo(stats.lastCaptureAt);
      document.getElementById('lastCapture').textContent = ago;
    }

    renderSourceBars(stats.bySource || {});
  });

  // 检查容量并显示提示
  chrome.runtime.sendMessage({ type: 'GET_CAPACITY_INFO' }, (info) => {
    if (chrome.runtime.lastError || info?.error) return;
    updateCapacityWarning(info);
  });
}

function renderSourceBars(bySource) {
  const container = document.getElementById('sourceBars');
  const total = Object.values(bySource).reduce((a, b) => a + b, 0);

  if (total === 0) {
    container.innerHTML = '<div style="color:#C7C7CC;font-size:12px;text-align:center;padding:8px">暂无数据</div>';
    return;
  }

  const sourceNames = {
    homefeed: '推荐流',
    search: '搜索',
    detail: '详情页',
    user_profile: '用户主页',
    dom_feed: 'DOM 卡片',
    dom_detail: 'DOM 详情',
  };

  const sorted = Object.entries(bySource).sort((a, b) => b[1] - a[1]);
  const max = sorted[0][1];

  container.innerHTML = sorted.map(([source, count]) => `
    <div class="source-row">
      <span class="source-name">${escapeHtml(sourceNames[source] || source)}</span>
      <div class="source-bar-wrap">
        <div class="source-bar" style="width: ${(count / max * 100).toFixed(0)}%"></div>
      </div>
      <span class="source-count">${escapeHtml(String(count))}</span>
    </div>
  `).join('');
}

// ========== 页面状态检测 ==========

function checkPageStatus() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const isXHS = tab?.url?.includes('xiaohongshu.com');

    const statusEl = document.getElementById('status');
    const dot = statusEl.querySelector('.status-dot');
    const text = statusEl.querySelector('.status-text');

    if (isXHS) {
      dot.className = 'status-dot active';
      text.textContent = '已连接小红书';
    } else {
      dot.className = 'status-dot inactive';
      text.textContent = '请打开小红书网页';
      document.getElementById('btnStartScroll').disabled = true;
      document.getElementById('btnScanNow').disabled = true;
    }
  });
}

// ========== 事件绑定 ==========

function bindEvents() {
  // 设置按钮
  document.getElementById('btnSettings').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/settings.html') });
  });

  // 开始自动浏览
  document.getElementById('btnStartScroll').addEventListener('click', () => {
    const speedMap = {
      slow: { minInterval: 4000, maxInterval: 10000, pauseChance: 0.25 },
      normal: { minInterval: 2000, maxInterval: 6000, pauseChance: 0.15 },
      fast: { minInterval: 1000, maxInterval: 3000, pauseChance: 0.08 },
    };

    const speed = document.getElementById('scrollSpeed').value;
    const maxScrolls = parseInt(document.getElementById('maxScrolls').value) || 100;

    const config = {
      ...speedMap[speed],
      maxScrolls,
      scrollDistance: 400,
    };

    sendToActiveTab({ type: 'START_AUTO_SCROLL', config }, () => {
      document.getElementById('btnStartScroll').disabled = true;
      document.getElementById('btnStopScroll').disabled = false;
      showToast('自动浏览已启动');
      startStatsRefresh();
    });
  });

  // 停止自动浏览
  document.getElementById('btnStopScroll').addEventListener('click', () => {
    sendToActiveTab({ type: 'STOP_AUTO_SCROLL' }, () => {
      document.getElementById('btnStartScroll').disabled = false;
      document.getElementById('btnStopScroll').disabled = true;
      showToast('已停止');
      stopStatsRefresh();
      loadStats();
    });
  });

  // 立即扫描
  document.getElementById('btnScanNow').addEventListener('click', () => {
    sendToActiveTab({ type: 'SCAN_DOM' }, () => {
      showToast('扫描完成');
      setTimeout(loadStats, 500);
    });
  });

  // 导出按钮
  document.querySelectorAll('.export-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const format = btn.dataset.format;
      btn.style.opacity = '0.5';

      chrome.runtime.sendMessage({ type: 'EXPORT_DATA', format }, (result) => {
        btn.style.opacity = '1';
        if (result?.ok) {
          showToast(`已导出 ${result.filename}`);
        } else {
          showToast('导出失败: ' + (result?.error || '未知错误'));
        }
      });
    });
  });

  // 清空数据
  document.getElementById('btnClear').addEventListener('click', () => {
    if (confirm('确定要清空所有已收集的数据吗？此操作不可撤销。')) {
      chrome.runtime.sendMessage({ type: 'CLEAR_DATA' }, () => {
        showToast('数据已清空');
        loadStats();
      });
    }
  });

  // 清理数据（快速清理面板）
  document.getElementById('btnCleanup').addEventListener('click', () => {
    showCleanupDialog();
  });

  // 分析历史
  document.getElementById('btnHistory').addEventListener('click', () => {
    showAnalysisHistory();
  });

  // 批量分析
  document.getElementById('btnBatchAnalyze').addEventListener('click', () => {
    showBatchAnalyzePanel();
  });
}

// ========== 辅助函数 ==========

function sendToActiveTab(msg, callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, msg, callback);
    } else if (callback) {
      callback(null);
    }
  });
}

// 监听自动浏览自然结束（达到 maxScrolls）
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'AUTO_SCROLL_STOPPED') {
    stopStatsRefresh();
    loadStats();
    const startBtn = document.getElementById('btnStartScroll');
    const stopBtn = document.getElementById('btnStopScroll');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    showToast('自动浏览已完成');

    // 自动分析模式
    const autoAnalyze = document.getElementById('autoAnalyze');
    if (autoAnalyze?.checked) {
      setTimeout(() => triggerAutoAnalysis(), 1500);
    }
  }
  if (msg.type === 'AUTO_ANALYSIS_DONE') {
    showToast(`✅ 自动分析完成：${msg.label}`);
  }
});

// popup 关闭时清理定时器
window.addEventListener('unload', stopStatsRefresh);

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  return `${Math.floor(hr / 24)}天前`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(text) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// ========== 容量管理 ==========

function updateCapacityWarning(info) {
  const warningEl = document.getElementById('capacityWarning');
  const textEl = document.getElementById('capacityWarningText');

  if (!warningEl || !textEl) return;

  if (info.isReached) {
    warningEl.style.display = 'flex';
    textEl.textContent = `存储已满（${info.current}/${info.limit}条），请清理数据后继续收集`;
    warningEl.classList.add('critical');
  } else if (info.isNearLimit) {
    warningEl.style.display = 'flex';
    textEl.textContent = `存储空间不足（${info.current}/${info.limit}条，已使用${info.percentage}%）`;
    warningEl.classList.remove('critical');
  } else {
    warningEl.style.display = 'none';
  }
}

function showCleanupDialog() {
  const options = [
    { label: '清理7天前的数据', action: 'old', days: 7 },
    { label: '清理30天前的数据', action: 'old', days: 30 },
    { label: '清理已导出的数据', action: 'exported' },
    { label: '清理最早的100条', action: 'oldest', count: 100 },
    { label: '清理最早的500条', action: 'oldest', count: 500 }
  ];

  const message = '选择清理方式：\n\n' +
    options.map((opt, i) => `${i + 1}. ${opt.label}`).join('\n') +
    '\n\n输入数字选择（1-5），或取消';

  const choice = prompt(message);
  const index = parseInt(choice) - 1;

  if (index >= 0 && index < options.length) {
    const opt = options[index];
    executeCleanup(opt);
  }
}

function executeCleanup(option) {
  let messageType, params = {};

  if (option.action === 'old') {
    messageType = 'CLEAR_OLD_DATA';
    params = { days: option.days };
  } else if (option.action === 'exported') {
    messageType = 'CLEAR_EXPORTED_DATA';
  } else if (option.action === 'oldest') {
    messageType = 'CLEAR_OLDEST_DATA';
    params = { count: option.count };
  } else {
    return;
  }

  chrome.runtime.sendMessage({ type: messageType, ...params }, (result) => {
    if (result?.ok) {
      showToast(`已清理 ${result.deleted} 条数据`);
      loadStats();
    } else {
      showToast('清理失败: ' + (result?.error || '未知错误'));
    }
  });
}

// ========== 批量分析 ==========

const BATCH_PROMPTS = {
  '📊 内容分析': { pageType: 'feed', prompt: '请分析以下这批小红书帖子的整体内容特征：\n1. 主要话题分布\n2. 高互动帖子的共同特征\n3. 内容风格总结\n4. 给创作者的3条建议' },
  '🔥 爆款识别': { pageType: 'feed', prompt: '从以下帖子中识别爆款潜力：\n1. 找出互动数据最好的3篇，分析原因\n2. 总结爆款共同规律\n3. 给出可复用的内容模板' },
  '🏷️ 标签分析': { pageType: 'feed', prompt: '分析以下帖子的标签使用情况：\n1. 高频标签 TOP10\n2. 标签与互动数据的关系\n3. 推荐的标签组合策略' },
};

function showBatchAnalyzePanel() {
  if (document.querySelector('.history-overlay')) return;

  // 先加载用户配置，获取自定义 Prompt
  chrome.storage.sync.get('userConfig', (result) => {
    const customPrompts = result.userConfig?.customPrompts || [];

    chrome.runtime.sendMessage({ type: 'GET_RECENT_POSTS', limit: 50 }, (resp) => {
      if (chrome.runtime.lastError || !resp?.ok) {
        showToast('加载帖子失败');
        return;
      }

      const posts = resp.posts || [];
      if (posts.length === 0) {
        showToast('暂无帖子数据，请先采集');
        return;
      }

      // 合并默认和自定义 Prompt
      const allPrompts = { ...BATCH_PROMPTS };
      customPrompts.forEach(p => {
        if (p.name && p.content) {
          allPrompts[p.name] = { pageType: p.pageType, prompt: p.content };
        }
      });

      const overlay = document.createElement('div');
      overlay.className = 'history-overlay';

      overlay.innerHTML = `
        <div class="history-panel batch-panel">
          <div class="history-header">
            <span>🤖 批量分析</span>
            <button class="history-close">✕</button>
          </div>
          <div class="batch-prompt-select">
            <label>分析类型：</label>
            <select id="batchPromptKey">
              ${Object.keys(BATCH_PROMPTS).map(k => `<option value="${k}">${k}</option>`).join('')}
              ${customPrompts.length > 0 ? '<optgroup label="自定义 Prompt">' : ''}
              ${customPrompts.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('')}
              ${customPrompts.length > 0 ? '</optgroup>' : ''}
            </select>
          </div>
          <div class="batch-select-bar">
            <span class="batch-count">已选 <strong id="batchSelectedCount">0</strong> / ${posts.length} 条</span>
          <button class="batch-select-all">全选</button>
        </div>
        <div class="history-list batch-list">
          ${posts.map(p => `
            <label class="batch-item">
              <input type="checkbox" class="batch-check" value="${escapeHtml(String(p.noteId || ''))}">
              <div class="batch-item-info">
                <div class="batch-item-title">${escapeHtml((p.title || '无标题').slice(0, 30))}</div>
                <div class="batch-item-meta">${escapeHtml(p.authorName || '')} · ${escapeHtml(String(p.likedCount || 0))}赞 · ${timeAgo(p.capturedAt)}</div>
              </div>
            </label>
          `).join('')}
        </div>
        <div class="batch-footer">
          <button class="btn btn-primary batch-run" id="btnRunBatch" disabled>开始分析</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.history-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const countEl = overlay.querySelector('#batchSelectedCount');
    const runBtn = overlay.querySelector('#btnRunBatch');

    function updateCount() {
      const checked = overlay.querySelectorAll('.batch-check:checked').length;
      countEl.textContent = checked;
      runBtn.disabled = checked === 0;
    }

    overlay.querySelectorAll('.batch-check').forEach(cb => cb.addEventListener('change', updateCount));

    overlay.querySelector('.batch-select-all').addEventListener('click', () => {
      const checks = overlay.querySelectorAll('.batch-check');
      const allChecked = [...checks].every(c => c.checked);
      checks.forEach(c => { c.checked = !allChecked; });
      updateCount();
    });

    runBtn.addEventListener('click', () => {
      const selectedIds = new Set([...overlay.querySelectorAll('.batch-check:checked')].map(c => c.value));
      const selectedPosts = posts.filter(p => selectedIds.has(p.noteId));
      const promptKey = overlay.querySelector('#batchPromptKey').value;
      const promptCfg = allPrompts[promptKey];

      overlay.remove();
      executeBatchAnalysis(selectedPosts, promptKey, promptCfg.prompt);
    });
    });
  });
}

function executeBatchAnalysis(posts, promptKey, prompt) {
  showToast(`🤖 正在分析 ${posts.length} 条帖子...`);

  sendToActiveTab({
    type: 'BATCH_ANALYZE',
    posts,
    promptKey,
    prompt,
  }, (resp) => {
    if (chrome.runtime.lastError) {
      showToast('请先打开小红书页面');
      return;
    }
    if (resp?.error === 'NO_API_KEY') {
      showToast('请先在设置中配置 API Key');
    } else if (resp?.ok) {
      showToast('分析已启动，完成后可在历史中查看');
    }
  });
}

function triggerAutoAnalysis() {
  sendToActiveTab({ type: 'AUTO_ANALYZE' }, (resp) => {
    if (chrome.runtime.lastError) return;
    if (resp?.ok) {
      showToast('🤖 自动分析已启动');
    } else if (resp?.error === 'NO_API_KEY') {
      showToast('请先在设置中配置 API Key');
    } else if (resp?.error === 'NO_DATA') {
      showToast('暂无数据可分析');
    }
  });
}

function showAnalysisHistory() {
  if (document.querySelector('.history-overlay')) return;
  chrome.runtime.sendMessage({ type: 'GET_ANALYSES', limit: 20 }, (resp) => {
    if (chrome.runtime.lastError || !resp?.ok) {
      showToast('加载历史失败');
      return;
    }

    const list = resp.list || [];
    const overlay = document.createElement('div');
    overlay.className = 'history-overlay';

    const pageTypeLabel = { detail: '详情页', feed: '信息流', profile: '博主主页' };

    overlay.innerHTML = `
      <div class="history-panel">
        <div class="history-header">
          <span>📋 分析历史</span>
          <button class="history-close">✕</button>
        </div>
        <div class="history-list">
          ${list.length === 0
            ? '<div class="history-empty">暂无分析记录</div>'
            : list.map(item => {
              const safeId = Number(item.id) || 0;
              return `
              <div class="history-item" data-id="${safeId}">
                <div class="history-item-meta">
                  <span class="history-label">${escapeHtml(item.label)}</span>
                  <span class="history-type">${escapeHtml(pageTypeLabel[item.pageType] || item.pageType)}</span>
                  <span class="history-time">${timeAgo(item.createdAt)}</span>
                </div>
                <div class="history-item-preview">${escapeHtml((item.markdown || '').slice(0, 80).replace(/[#*`]/g, ''))}...</div>
                <div class="history-item-actions">
                  <button class="history-copy" data-id="${safeId}">复制</button>
                  <button class="history-delete" data-id="${safeId}">删除</button>
                </div>
              </div>
            `; }).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.history-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // 存储 list 供后续操作使用
    overlay._list = list;

    overlay.querySelectorAll('.history-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const item = list.find(i => i.id === id);
        if (item) {
          navigator.clipboard.writeText(item.markdown).then(() => showToast('已复制')).catch(() => showToast('复制失败'));
        }
      });
    });

    overlay.querySelectorAll('.history-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        btn.disabled = true;
        const id = parseInt(btn.dataset.id);
        chrome.runtime.sendMessage({ type: 'DELETE_ANALYSIS', id }, () => {
          const item = btn.closest('.history-item');
          if (item) item.remove();
          showToast('已删除');
        });
      });
    });
  });
}
