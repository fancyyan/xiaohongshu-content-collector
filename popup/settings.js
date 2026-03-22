/**
 * 设置页面逻辑
 */

// 默认配置
const DEFAULT_CONFIG = {
  imageLimit: {
    detail: 6,
    feed: 8,
    profile: 8,
  },
  rateLimit: {
    maxPerMinute: 25,
    maxPer5Min: 80,
    minInterval: 2500,
  },
  scrollBehavior: {
    upScrollChance: 0.1,
    longPauseChance: 0.15,
    fatigueThreshold1: 50,
    fatigueThreshold2: 100,
  },
  apiConfig: {
    provider: 'openrouter',
    apiKey: '',
    apiModel: 'google/gemini-2.0-flash-001',
    customEndpoint: '',
  }
};

// API 供应商配置
const API_PROVIDERS = {
  openrouter: {
    name: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    keyPlaceholder: 'sk-or-v1-...',
    keyLink: 'https://openrouter.ai/keys',
    hint: [
      'API Key 会安全存储在本地',
      '支持多种 AI 模型，性价比高',
      '获取 API Key：<a href="https://openrouter.ai/keys" target="_blank">OpenRouter 官网</a>',
    ],
    models: [
      { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash（推荐）' },
      { value: 'google/gemini-2.0-flash-thinking-exp', label: 'Gemini 2.0 Flash Thinking' },
      { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
      { value: 'anthropic/claude-3-opus', label: 'Claude 3 Opus' },
      { value: 'openai/gpt-4o', label: 'GPT-4o' },
      { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini（便宜）' },
      { value: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo' },
      { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
    ]
  },
  anthropic: {
    name: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    keyPlaceholder: 'sk-ant-...',
    keyLink: 'https://console.anthropic.com/settings/keys',
    hint: [
      'Claude 官方 API',
      '需要 Anthropic 账号',
      '获取 API Key：<a href="https://console.anthropic.com/settings/keys" target="_blank">Anthropic Console</a>',
    ],
    models: [
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet（推荐）' },
      { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
      { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku（便宜）' },
    ]
  },
  openai: {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    keyPlaceholder: 'sk-...',
    keyLink: 'https://platform.openai.com/api-keys',
    hint: [
      'GPT 官方 API',
      '需要 OpenAI 账号',
      '获取 API Key：<a href="https://platform.openai.com/api-keys" target="_blank">OpenAI Platform</a>',
    ],
    models: [
      { value: 'gpt-4o', label: 'GPT-4o（推荐）' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini（便宜）' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { value: 'gpt-4', label: 'GPT-4' },
    ]
  },
  google: {
    name: 'Google AI',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    keyPlaceholder: 'AIza...',
    keyLink: 'https://makersuite.google.com/app/apikey',
    hint: [
      'Gemini 官方 API',
      '需要 Google 账号',
      '获取 API Key：<a href="https://makersuite.google.com/app/apikey" target="_blank">Google AI Studio</a>',
    ],
    models: [
      { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash（推荐）' },
      { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash（便宜）' },
    ]
  },
  custom: {
    name: '自定义',
    endpoint: '',
    keyPlaceholder: '输入你的 API Key',
    keyLink: '',
    hint: [
      '使用自定义 API 端点',
      '需要兼容 OpenAI 格式的 API',
      '请确保 API 端点支持多模态（图片+文字）',
    ],
    models: [
      { value: 'custom-model', label: '自定义模型（在端点中指定）' },
    ]
  }
};

// 预设配置
const PRESETS = {
  safe: {
    name: '保守安全',
    imageLimit: { detail: 6, feed: 8, profile: 8 },
    rateLimit: { maxPerMinute: 20, maxPer5Min: 60, minInterval: 3000 },
    scrollBehavior: { upScrollChance: 0.1, longPauseChance: 0.2, fatigueThreshold1: 40, fatigueThreshold2: 80 }
  },
  balanced: {
    name: '均衡模式',
    imageLimit: { detail: 6, feed: 8, profile: 8 },
    rateLimit: { maxPerMinute: 25, maxPer5Min: 80, minInterval: 2500 },
    scrollBehavior: { upScrollChance: 0.1, longPauseChance: 0.15, fatigueThreshold1: 50, fatigueThreshold2: 100 }
  },
  fast: {
    name: '快速采集',
    imageLimit: { detail: 10, feed: 15, profile: 15 },
    rateLimit: { maxPerMinute: 35, maxPer5Min: 100, minInterval: 2000 },
    scrollBehavior: { upScrollChance: 0.08, longPauseChance: 0.1, fatigueThreshold1: 60, fatigueThreshold2: 120 }
  },
  unlimited: {
    name: '无限图片',
    imageLimit: { detail: 0, feed: 0, profile: 0 },
    rateLimit: { maxPerMinute: 25, maxPer5Min: 80, minInterval: 2500 },
    scrollBehavior: { upScrollChance: 0.1, longPauseChance: 0.15, fatigueThreshold1: 50, fatigueThreshold2: 100 }
  }
};

// API 测试状态
let apiTestStatus = {
  tested: false,
  success: false,
  lastTestedConfig: null // 存储上次测试的配置
};

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  bindEvents();
  updateProviderUI(); // 初始化供应商 UI
});

// 更新供应商相关的 UI
function updateProviderUI() {
  const provider = document.getElementById('apiProvider').value;
  const providerConfig = API_PROVIDERS[provider];

  // 更新 API Key 提示
  document.getElementById('apiKey').placeholder = providerConfig.keyPlaceholder;
  document.getElementById('apiKeyHint').textContent = `用于 ${providerConfig.name} API`;

  // 更新自定义端点显示
  const customEndpointContainer = document.getElementById('customEndpointContainer');
  if (provider === 'custom') {
    customEndpointContainer.style.display = 'flex';
  } else {
    customEndpointContainer.style.display = 'none';
  }

  // 更新模型列表
  const modelSelect = document.getElementById('apiModel');
  modelSelect.innerHTML = '';
  providerConfig.models.forEach(model => {
    const option = document.createElement('option');
    option.value = model.value;
    option.textContent = model.label;
    modelSelect.appendChild(option);
  });

  // 更新提示信息
  const hintList = document.getElementById('apiHintList');
  hintList.innerHTML = providerConfig.hint.map(h => `<li>${h}</li>`).join('');
}

// 加载设置
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('userConfig');
    const config = result.userConfig || DEFAULT_CONFIG;

    // 填充表单
    document.getElementById('imageDetail').value = config.imageLimit.detail;
    document.getElementById('imageFeed').value = config.imageLimit.feed;
    document.getElementById('imageProfile').value = config.imageLimit.profile;

    document.getElementById('rateMaxPerMinute').value = config.rateLimit.maxPerMinute;
    document.getElementById('rateMaxPer5Min').value = config.rateLimit.maxPer5Min;
    document.getElementById('rateMinInterval').value = config.rateLimit.minInterval;

    document.getElementById('scrollUpChance').value = Math.round(config.scrollBehavior.upScrollChance * 100);
    document.getElementById('scrollLongPauseChance').value = Math.round(config.scrollBehavior.longPauseChance * 100);
    document.getElementById('scrollFatigue1').value = config.scrollBehavior.fatigueThreshold1;
    document.getElementById('scrollFatigue2').value = config.scrollBehavior.fatigueThreshold2;

    // 填充 API 配置
    if (config.apiConfig) {
      document.getElementById('apiProvider').value = config.apiConfig.provider || 'openrouter';
      updateProviderUI(); // 更新 UI
      document.getElementById('apiKey').value = config.apiConfig.apiKey || '';
      document.getElementById('apiModel').value = config.apiConfig.apiModel || 'google/gemini-2.0-flash-001';
      document.getElementById('customEndpoint').value = config.apiConfig.customEndpoint || '';
    }
  } catch (error) {
    console.error('加载设置失败:', error);
    showToast('加载设置失败');
  }
}

// 保存设置
async function saveSettings() {
  try {
    const provider = document.getElementById('apiProvider').value;
    const providerConfig = API_PROVIDERS[provider];
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiModel = document.getElementById('apiModel').value;
    const customEndpoint = document.getElementById('customEndpoint').value.trim();

    // 校验 API Key
    if (!apiKey) {
      showToast('请先配置 API Key');
      document.getElementById('apiKey').focus();
      return;
    }

    // 校验自定义端点
    if (provider === 'custom') {
      if (!customEndpoint) {
        showToast('请填写自定义 API 端点');
        document.getElementById('customEndpoint').focus();
        return;
      }
    }

    // 检查是否已经测试过API连接
    const currentConfig = {
      provider,
      apiKey,
      apiModel,
      customEndpoint
    };

    // 判断配置是否改变
    const configChanged = !apiTestStatus.lastTestedConfig ||
      apiTestStatus.lastTestedConfig.provider !== currentConfig.provider ||
      apiTestStatus.lastTestedConfig.apiKey !== currentConfig.apiKey ||
      apiTestStatus.lastTestedConfig.apiModel !== currentConfig.apiModel ||
      apiTestStatus.lastTestedConfig.customEndpoint !== currentConfig.customEndpoint;

    // 如果配置改变了，或者从未测试过，或者上次测试失败，则要求先测试
    if (configChanged || !apiTestStatus.tested || !apiTestStatus.success) {
      showToast('请先测试API连接，确保配置正确后再保存');
      document.getElementById('btnTestAPI').focus();

      // 高亮测试按钮
      const testBtn = document.getElementById('btnTestAPI');
      testBtn.style.animation = 'pulse 0.5s ease-in-out 3';
      setTimeout(() => {
        testBtn.style.animation = '';
      }, 1500);

      return;
    }

    const config = {
      imageLimit: {
        detail: parseInt(document.getElementById('imageDetail').value) || 0,
        feed: parseInt(document.getElementById('imageFeed').value) || 0,
        profile: parseInt(document.getElementById('imageProfile').value) || 0,
      },
      rateLimit: {
        maxPerMinute: parseInt(document.getElementById('rateMaxPerMinute').value) || 25,
        maxPer5Min: parseInt(document.getElementById('rateMaxPer5Min').value) || 80,
        minInterval: parseInt(document.getElementById('rateMinInterval').value) || 2500,
      },
      scrollBehavior: {
        upScrollChance: parseInt(document.getElementById('scrollUpChance').value) / 100 || 0.1,
        longPauseChance: parseInt(document.getElementById('scrollLongPauseChance').value) / 100 || 0.15,
        fatigueThreshold1: parseInt(document.getElementById('scrollFatigue1').value) || 50,
        fatigueThreshold2: parseInt(document.getElementById('scrollFatigue2').value) || 100,
      },
      apiConfig: {
        provider: provider,
        apiKey: document.getElementById('apiKey').value.trim() || '',
        apiModel: document.getElementById('apiModel').value || providerConfig.models[0].value,
        customEndpoint: document.getElementById('customEndpoint').value.trim() || '',
        endpoint: provider === 'custom' ? document.getElementById('customEndpoint').value.trim() : providerConfig.endpoint,
      }
    };

    // 保存到 chrome.storage
    await chrome.storage.sync.set({ userConfig: config });

    // 通知所有标签页更新配置
    const tabs = await chrome.tabs.query({ url: 'https://www.xiaohongshu.com/*' });
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_CONFIG', config }).catch(() => {});
    });

    showToast('设置已保存');

    // 显示成功提示和跳转按钮
    setTimeout(() => {
      showSuccessModal();
    }, 500);
  } catch (error) {
    console.error('保存设置失败:', error);
    showToast('保存失败');
  }
}

// 显示成功提示弹窗
function showSuccessModal() {
  // 创建弹窗
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    border-radius: 16px;
    padding: 40px;
    max-width: 400px;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  `;

  content.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
    <h2 style="font-size: 24px; color: #333; margin-bottom: 12px;">设置成功！</h2>
    <p style="font-size: 14px; color: #666; margin-bottom: 30px;">
      你的配置已保存，现在可以开始使用插件了
    </p>
    <button id="btnGoToXHS" style="
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      margin-bottom: 10px;
    ">去小红书试试吧 →</button>
    <button id="btnCloseModal" style="
      width: 100%;
      padding: 14px;
      background: #f5f5f7;
      color: #666;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      cursor: pointer;
    ">稍后再说</button>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  // 绑定按钮事件
  document.getElementById('btnGoToXHS').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.xiaohongshu.com/explore' });
    window.close();
  });

  document.getElementById('btnCloseModal').addEventListener('click', () => {
    modal.remove();
    window.close();
  });

  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
      window.close();
    }
  });
}

// 应用预设
function applyPreset(presetName) {
  const preset = PRESETS[presetName];
  if (!preset) return;

  // 填充表单
  document.getElementById('imageDetail').value = preset.imageLimit.detail;
  document.getElementById('imageFeed').value = preset.imageLimit.feed;
  document.getElementById('imageProfile').value = preset.imageLimit.profile;

  document.getElementById('rateMaxPerMinute').value = preset.rateLimit.maxPerMinute;
  document.getElementById('rateMaxPer5Min').value = preset.rateLimit.maxPer5Min;
  document.getElementById('rateMinInterval').value = preset.rateLimit.minInterval;

  document.getElementById('scrollUpChance').value = Math.round(preset.scrollBehavior.upScrollChance * 100);
  document.getElementById('scrollLongPauseChance').value = Math.round(preset.scrollBehavior.longPauseChance * 100);
  document.getElementById('scrollFatigue1').value = preset.scrollBehavior.fatigueThreshold1;
  document.getElementById('scrollFatigue2').value = preset.scrollBehavior.fatigueThreshold2;

  showToast(`已应用「${preset.name}」预设`);
}

// 绑定事件
function bindEvents() {
  // 返回按钮
  document.getElementById('btnBack').addEventListener('click', () => {
    window.close();
  });

  // 保存按钮
  document.getElementById('btnSave').addEventListener('click', saveSettings);

  // API 供应商切换
  document.getElementById('apiProvider').addEventListener('change', () => {
    updateProviderUI();
    resetAPITestStatus();
  });

  // 监听API配置改变，重置测试状态
  document.getElementById('apiKey').addEventListener('input', resetAPITestStatus);
  document.getElementById('apiModel').addEventListener('change', resetAPITestStatus);
  document.getElementById('customEndpoint').addEventListener('input', resetAPITestStatus);

  // 密码显示/隐藏
  document.getElementById('btnTogglePassword').addEventListener('click', () => {
    const input = document.getElementById('apiKey');
    const btn = document.getElementById('btnTogglePassword');
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = '🙈';
    } else {
      input.type = 'password';
      btn.textContent = '👁️';
    }
  });

  // 预设按钮
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      applyPreset(preset);
    });
  });

  // 测试 API 连接按钮
  document.getElementById('btnTestAPI').addEventListener('click', testAPIConnection);
}

// 重置API测试状态
function resetAPITestStatus() {
  apiTestStatus.tested = false;
  apiTestStatus.success = false;
  apiTestStatus.lastTestedConfig = null;

  // 清除测试结果显示
  const resultDiv = document.getElementById('apiTestResult');
  if (resultDiv) {
    resultDiv.style.display = 'none';
    resultDiv.textContent = '';
    resultDiv.className = '';
  }
}

// 测试 API 连接
async function testAPIConnection() {
  const provider = document.getElementById('apiProvider').value;
  const apiKey = document.getElementById('apiKey').value.trim();
  const apiModel = document.getElementById('apiModel').value;
  const customEndpoint = document.getElementById('customEndpoint').value.trim();
  const resultDiv = document.getElementById('apiTestResult');
  const testBtn = document.getElementById('btnTestAPI');

  // 校验输入
  if (!apiKey) {
    resultDiv.textContent = '❌ 请先填写 API Key';
    resultDiv.className = 'error';
    resultDiv.style.display = 'block';
    return;
  }

  if (provider === 'custom' && !customEndpoint) {
    resultDiv.textContent = '❌ 请先填写自定义 API 端点';
    resultDiv.className = 'error';
    resultDiv.style.display = 'block';
    return;
  }

  // 显示测试中状态
  testBtn.disabled = true;
  testBtn.textContent = '测试中...';
  resultDiv.textContent = '⏳ 正在测试连接...';
  resultDiv.className = '';
  resultDiv.style.display = 'block';

  try {
    const providerConfig = API_PROVIDERS[provider];
    const endpoint = provider === 'custom' ? customEndpoint : providerConfig.endpoint;

    // 构建测试请求
    let response;
    if (provider === 'anthropic') {
      // Anthropic API 格式
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: apiModel,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });
    } else if (provider === 'google') {
      // Google AI API 格式
      const modelEndpoint = `${endpoint}/${apiModel}:generateContent?key=${apiKey}`;
      response = await fetch(modelEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hi' }] }]
        })
      });
    } else {
      // OpenAI 兼容格式 (OpenRouter, OpenAI, Custom)
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: apiModel,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10
        })
      });
    }

    if (response.ok) {
      resultDiv.textContent = '✅ 连接成功！API 配置正确，现在可以保存了';
      resultDiv.className = 'success';

      // 标记测试成功，并记录当前配置
      apiTestStatus.tested = true;
      apiTestStatus.success = true;
      apiTestStatus.lastTestedConfig = {
        provider,
        apiKey,
        apiModel,
        customEndpoint
      };
    } else {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || errorData.message || `HTTP ${response.status}`;
      resultDiv.textContent = `❌ 连接失败: ${errorMsg}`;
      resultDiv.className = 'error';

      // 标记测试失败
      apiTestStatus.tested = true;
      apiTestStatus.success = false;
      apiTestStatus.lastTestedConfig = null;
    }
  } catch (error) {
    resultDiv.textContent = `❌ 连接失败: ${error.message}`;
    resultDiv.className = 'error';

    // 标记测试失败
    apiTestStatus.tested = true;
    apiTestStatus.success = false;
    apiTestStatus.lastTestedConfig = null;
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = '测试连接';
  }
}

// 显示提示
function showToast(text) {
  const toast = document.getElementById('toast');
  toast.textContent = text;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}
