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
  },
  customPrompts: [],
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
  deepseek: {
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    keyPlaceholder: 'sk-...',
    keyLink: 'https://platform.deepseek.com/api_keys',
    hint: [
      'DeepSeek 官方 API（国内）',
      '⚠️ 仅支持文本分析，不支持图片',
      '获取 API Key：<a href="https://platform.deepseek.com/api_keys" target="_blank">DeepSeek Platform</a>',
    ],
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek Chat（推荐）' },
      { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner（思考模式）' },
    ]
  },
  qwen: {
    name: 'Qwen（通义千问）',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    keyPlaceholder: 'sk-...',
    keyLink: 'https://help.aliyun.com/zh/model-studio/getting-started/first-api-call-to-qwen',
    hint: [
      '阿里云通义千问 API（国内）',
      '支持多模态分析（VL系列模型）',
      '获取 API Key：<a href="https://help.aliyun.com/zh/model-studio/getting-started/first-api-call-to-qwen" target="_blank">阿里云百炼</a>',
    ],
    models: [
      { value: 'qwen-vl-max-latest', label: 'Qwen VL Max（多模态，推荐）' },
      { value: 'qwen-vl-plus-latest', label: 'Qwen VL Plus（多模态）' },
      { value: 'qwen-max', label: 'Qwen Max（文本）' },
      { value: 'qwen-plus', label: 'Qwen Plus（文本）' },
      { value: 'qwen-turbo', label: 'Qwen Turbo（文本，便宜）' },
    ]
  },
  minimax: {
    name: 'MiniMax',
    endpoint: 'https://api.minimax.io/anthropic',
    keyPlaceholder: '输入你的 API Key',
    keyLink: 'https://platform.minimax.io',
    hint: [
      'MiniMax 官方 API（国内）',
      '⚠️ 仅支持文本分析，不支持图片',
      '获取 API Key：<a href="https://platform.minimax.io" target="_blank">MiniMax Platform</a>',
    ],
    models: [
      { value: 'MiniMax-M2.7', label: 'MiniMax M2.7（推荐）' },
      { value: 'MiniMax-M2.7-highspeed', label: 'MiniMax M2.7 高速版' },
      { value: 'MiniMax-M2.5', label: 'MiniMax M2.5' },
      { value: 'MiniMax-M2.5-highspeed', label: 'MiniMax M2.5 高速版' },
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
      '模型名称应在 API 端点 URL 中指定，或在请求体中固定',
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
  updateFormSteps(); // 初始化表单步骤状态
});

// 更新表单步骤状态
function updateFormSteps() {
  const provider = document.getElementById('apiProvider').value;
  const apiKey = document.getElementById('apiKey').value.trim();

  const apiKeyInput = document.getElementById('apiKey');
  const btnTogglePassword = document.getElementById('btnTogglePassword');
  const btnTestAPI = document.getElementById('btnTestAPI');
  const apiModelSelect = document.getElementById('apiModel');
  const customModelInput = document.getElementById('customModel');
  const customEndpointInput = document.getElementById('customEndpoint');

  // 步骤2：API Key - 只有选择了提供方才能填写
  if (provider && provider !== '') {
    apiKeyInput.disabled = false;
    btnTogglePassword.disabled = false;
    btnTestAPI.disabled = false;
    apiKeyInput.placeholder = API_PROVIDERS[provider].keyPlaceholder;
  } else {
    apiKeyInput.disabled = true;
    btnTogglePassword.disabled = true;
    btnTestAPI.disabled = true;
    apiKeyInput.placeholder = '请先选择 API 供应商';
  }

  // 步骤3：模型选择 - 只有填写了API Key才能选择
  if (provider && provider !== '' && apiKey) {
    apiModelSelect.disabled = false;
    customModelInput.disabled = false;
    if (provider === 'custom') {
      customEndpointInput.disabled = false;
    }
  } else {
    apiModelSelect.disabled = true;
    customModelInput.disabled = true;
    customEndpointInput.disabled = true;
    if (!apiKey) {
      customModelInput.placeholder = '请先填写 API Key';
    }
  }
}

// 更新供应商相关的 UI
function updateProviderUI() {
  const provider = document.getElementById('apiProvider').value;

  // 如果没有选择提供方，不更新UI
  if (!provider || provider === '') {
    return;
  }

  const providerConfig = API_PROVIDERS[provider];

  // 更新 API Key 提示
  document.getElementById('apiKey').placeholder = providerConfig.keyPlaceholder;
  document.getElementById('apiKeyHint').textContent = `用于 ${providerConfig.name} API`;

  // 更新自定义端点和模型显示
  const customEndpointContainer = document.getElementById('customEndpointContainer');
  const apiModelContainer = document.getElementById('apiModelContainer');
  const customModelContainer = document.getElementById('customModelContainer');

  if (provider === 'custom') {
    customEndpointContainer.style.display = 'flex';
    customModelContainer.style.display = 'flex';
    apiModelContainer.style.display = 'none';
  } else {
    customEndpointContainer.style.display = 'none';
    customModelContainer.style.display = 'none';
    apiModelContainer.style.display = 'flex';
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

  // 更新表单步骤状态
  updateFormSteps();
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
      document.getElementById('customModel').value = config.apiConfig.customModel || '';

      // 如果已有API配置，标记为已测试成功（假设之前保存时已经测试过）
      if (config.apiConfig.apiKey) {
        apiTestStatus.tested = true;
        apiTestStatus.success = true;
        apiTestStatus.lastTestedConfig = {
          provider: config.apiConfig.provider || 'openrouter',
          apiKey: config.apiConfig.apiKey,
          apiModel: config.apiConfig.apiModel || 'google/gemini-2.0-flash-001',
          customEndpoint: config.apiConfig.customEndpoint || '',
          customModel: config.apiConfig.customModel || ''
        };
      }
    }

    // 加载自定义 Prompt
    renderCustomPrompts(config.customPrompts || []);
  } catch (error) {
    console.error('加载设置失败:', error);
    showToast('加载设置失败');
  }
}

/**
 * 验证配置值的范围
 * @param {Object} config - 配置对象
 * @returns {string[]} - 错误消息数组
 */
function validateConfig(config) {
  const errors = [];

  // 验证图片数量限制
  if (config.imageLimit.detail < 0 || config.imageLimit.detail > 50) {
    errors.push('详情页图片数量应在 0-50 之间');
  }
  if (config.imageLimit.feed < 0 || config.imageLimit.feed > 50) {
    errors.push('信息流图片数量应在 0-50 之间');
  }
  if (config.imageLimit.profile < 0 || config.imageLimit.profile > 50) {
    errors.push('博主主页图片数量应在 0-50 之间');
  }

  // 验证频率限制
  if (config.rateLimit.maxPerMinute < 5 || config.rateLimit.maxPerMinute > 60) {
    errors.push('每分钟请求数应在 5-60 之间');
  }
  if (config.rateLimit.maxPer5Min < 20 || config.rateLimit.maxPer5Min > 300) {
    errors.push('5分钟请求数应在 20-300 之间');
  }
  if (config.rateLimit.minInterval < 1000 || config.rateLimit.minInterval > 10000) {
    errors.push('最小请求间隔应在 1000-10000 毫秒之间');
  }

  // 验证滚动行为
  if (config.scrollBehavior.upScrollChance < 0 || config.scrollBehavior.upScrollChance > 1) {
    errors.push('向上滚动概率应在 0-1 之间');
  }
  if (config.scrollBehavior.longPauseChance < 0 || config.scrollBehavior.longPauseChance > 1) {
    errors.push('长暂停概率应在 0-1 之间');
  }
  if (config.scrollBehavior.fatigueThreshold1 < 10 || config.scrollBehavior.fatigueThreshold1 > 200) {
    errors.push('疲劳阈值1应在 10-200 之间');
  }
  if (config.scrollBehavior.fatigueThreshold2 < 20 || config.scrollBehavior.fatigueThreshold2 > 300) {
    errors.push('疲劳阈值2应在 20-300 之间');
  }

  // 验证逻辑关系
  if (config.scrollBehavior.fatigueThreshold2 <= config.scrollBehavior.fatigueThreshold1) {
    errors.push('疲劳阈值2应大于疲劳阈值1');
  }

  return errors;
}

// 保存设置
async function saveSettings() {
  try {
    const provider = document.getElementById('apiProvider').value;
    const providerConfig = API_PROVIDERS[provider];
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiModel = document.getElementById('apiModel').value;
    const customEndpoint = document.getElementById('customEndpoint').value.trim();
    const customModel = document.getElementById('customModel').value.trim();

    // 校验 API Key
    if (!apiKey) {
      showToast('请先配置 API Key');
      document.getElementById('apiKey').focus();
      return;
    }

    // 校验自定义端点和模型
    if (provider === 'custom') {
      if (!customEndpoint) {
        showToast('请填写自定义 API 端点');
        document.getElementById('customEndpoint').focus();
        return;
      }
      if (!customModel) {
        showToast('请填写模型 ID');
        document.getElementById('customModel').focus();
        return;
      }
    }

    // 检查API配置是否改变
    const currentAPIConfig = {
      provider,
      apiKey,
      apiModel,
      customEndpoint,
      customModel
    };

    // 判断API配置是否改变（只有在已经测试过的情况下才比较）
    let apiConfigChanged = false;
    if (apiTestStatus.lastTestedConfig) {
      apiConfigChanged =
        apiTestStatus.lastTestedConfig.provider !== currentAPIConfig.provider ||
        apiTestStatus.lastTestedConfig.apiKey !== currentAPIConfig.apiKey ||
        apiTestStatus.lastTestedConfig.apiModel !== currentAPIConfig.apiModel ||
        apiTestStatus.lastTestedConfig.customEndpoint !== currentAPIConfig.customEndpoint ||
        apiTestStatus.lastTestedConfig.customModel !== currentAPIConfig.customModel;
    }

    // 只有在以下情况才要求测试API：
    // 1. 从未测试过API
    // 2. 上次测试失败
    // 3. API配置改变了
    const needAPITest = !apiTestStatus.tested || !apiTestStatus.success || apiConfigChanged;

    if (needAPITest) {
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
        apiModel: provider === 'custom' ? document.getElementById('customModel').value.trim() : document.getElementById('apiModel').value,
        customEndpoint: document.getElementById('customEndpoint').value.trim() || '',
        customModel: document.getElementById('customModel').value.trim() || '',
        endpoint: provider === 'custom' ? document.getElementById('customEndpoint').value.trim() : providerConfig.endpoint,
      },
      customPrompts: collectCustomPrompts(),
    };

    // 验证配置范围
    const validationErrors = validateConfig(config);
    if (validationErrors.length > 0) {
      const errorMessage = '配置验证失败：\n' + validationErrors.join('\n');
      alert(errorMessage);
      showToast('配置验证失败，请检查输入');
      return;
    }

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
    // 如果选择了提供方，自动聚焦到API Key输入框
    const provider = document.getElementById('apiProvider').value;
    if (provider && provider !== '') {
      setTimeout(() => {
        document.getElementById('apiKey').focus();
      }, 100);
    }
  });

  // 监听API配置改变，重置测试状态并更新表单步骤
  document.getElementById('apiKey').addEventListener('input', () => {
    resetAPITestStatus();
    updateFormSteps();
  });
  document.getElementById('apiKey').addEventListener('blur', updateFormSteps);
  document.getElementById('apiModel').addEventListener('change', resetAPITestStatus);
  document.getElementById('customEndpoint').addEventListener('input', () => {
    resetAPITestStatus();
    updateFormSteps();
  });

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

  // 添加自定义 Prompt
  document.getElementById('btnAddPrompt').addEventListener('click', addCustomPromptRow);
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
  const customModel = document.getElementById('customModel').value.trim();
  const resultDiv = document.getElementById('apiTestResult');
  const testBtn = document.getElementById('btnTestAPI');

  // 校验输入
  if (!apiKey) {
    resultDiv.textContent = '❌ 请先填写 API Key';
    resultDiv.className = 'error';
    resultDiv.style.display = 'block';
    return;
  }

  if (provider === 'custom') {
    if (!customEndpoint) {
      resultDiv.textContent = '❌ 请先填写自定义 API 端点';
      resultDiv.className = 'error';
      resultDiv.style.display = 'block';
      return;
    }
    if (!customModel) {
      resultDiv.textContent = '❌ 请先填写模型 ID';
      resultDiv.className = 'error';
      resultDiv.style.display = 'block';
      return;
    }
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
    const modelToUse = provider === 'custom' ? customModel : apiModel;

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
          model: modelToUse,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });
    } else if (provider === 'google') {
      // Google AI API 格式
      const modelEndpoint = `${endpoint}/${modelToUse}:generateContent?key=${apiKey}`;
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
          model: modelToUse,
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
        customEndpoint,
        customModel
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

// ========== 自定义 Prompt 管理 ==========

const PAGE_TYPE_OPTIONS = [
  { value: 'detail', label: '详情页' },
  { value: 'feed', label: '信息流' },
  { value: 'profile', label: '博主主页' },
];

function renderCustomPrompts(prompts) {
  const container = document.getElementById('customPromptList');
  container.innerHTML = '';

  if (!prompts || prompts.length === 0) {
    container.innerHTML = '<p class="empty-prompt-hint">暂无自定义 Prompt，点击下方按钮添加</p>';
    return;
  }

  prompts.forEach((p, index) => {
    container.appendChild(createPromptRow(p, index));
  });
}

function createPromptRow(prompt, index) {
  const row = document.createElement('div');
  row.className = 'custom-prompt-row';
  row.dataset.index = index;

  row.innerHTML = `
    <div class="prompt-row-header">
      <input type="text" class="prompt-name-input" placeholder="按钮名称（如：🎯 竞品分析）" value="${escapeAttr(prompt.name || '')}">
      <select class="prompt-type-select">
        ${PAGE_TYPE_OPTIONS.map(opt =>
          `<option value="${opt.value}" ${prompt.pageType === opt.value ? 'selected' : ''}>${opt.label}</option>`
        ).join('')}
      </select>
      <button class="btn-remove-prompt" title="删除">✕</button>
    </div>
    <textarea class="prompt-content-input" placeholder="输入 Prompt 内容，AI 会基于当前页面数据进行分析..." rows="3">${escapeAttr(prompt.content || '')}</textarea>
  `;

  row.querySelector('.btn-remove-prompt').addEventListener('click', () => {
    row.remove();
    const remaining = document.querySelectorAll('.custom-prompt-row');
    if (remaining.length === 0) {
      document.getElementById('customPromptList').innerHTML =
        '<p class="empty-prompt-hint">暂无自定义 Prompt，点击下方按钮添加</p>';
    }
  });

  return row;
}

function addCustomPromptRow() {
  const container = document.getElementById('customPromptList');
  const emptyHint = container.querySelector('.empty-prompt-hint');
  if (emptyHint) emptyHint.remove();

  const index = container.querySelectorAll('.custom-prompt-row').length;
  container.appendChild(createPromptRow({ name: '', pageType: 'detail', content: '' }, index));
}

function collectCustomPrompts() {
  const rows = document.querySelectorAll('.custom-prompt-row');
  const prompts = [];
  const seenNames = new Set();

  // 获取所有默认 Prompt 名称
  const defaultPromptNames = new Set([
    // 详情页
    '📊 内容分析', '✍️ 仿写文案', '🔥 爆款潜力', '🏷️ 标签建议', '🎨 视觉诊断',
    // 信息流
    '📈 趋势洞察', '🎯 选题推荐', '🏆 爆文拆解', '📊 数据报告',
    // 博主主页
    '👤 博主画像', '📐 运营策略', '🔥 爆款复盘', '🎯 对标建议'
  ]);

  rows.forEach(row => {
    const name = row.querySelector('.prompt-name-input').value.trim();
    const pageType = row.querySelector('.prompt-type-select').value;
    const content = row.querySelector('.prompt-content-input').value.trim();

    if (name && content) {
      // 检查是否与默认 Prompt 重名
      if (defaultPromptNames.has(name)) {
        showToast(`❌ "${name}" 与默认 Prompt 重名，请修改`);
        row.querySelector('.prompt-name-input').style.borderColor = '#ff3b30';
        throw new Error(`Prompt 名称 "${name}" 与默认 Prompt 重名`);
      }

      // 检查是否与其他自定义 Prompt 重名
      if (seenNames.has(name)) {
        showToast(`❌ "${name}" 重复，请使用不同的名称`);
        row.querySelector('.prompt-name-input').style.borderColor = '#ff3b30';
        throw new Error(`Prompt 名称 "${name}" 重复`);
      }

      seenNames.add(name);
      row.querySelector('.prompt-name-input').style.borderColor = '';
      prompts.push({ name, pageType, content });
    }
  });
  return prompts;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
