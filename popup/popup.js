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
      <span class="source-name">${sourceNames[source] || source}</span>
      <div class="source-bar-wrap">
        <div class="source-bar" style="width: ${(count / max * 100).toFixed(0)}%"></div>
      </div>
      <span class="source-count">${count}</span>
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
}

// ========== 辅助函数 ==========

function sendToActiveTab(msg, callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, msg, callback);
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
