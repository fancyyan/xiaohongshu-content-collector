/** Gemini REST adapter shared by Settings and the background service worker. */
globalThis.GoogleAI = (() => {
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models';

  function normalizeModel(model) {
    const id = String(model || '').trim().replace(/^models\//, '');
    if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error('请选择有效的 Google AI 模型');
    return id;
  }

  function safeMessage(message, apiKey) {
    return String(message).split(apiKey).join('[已隐藏]').slice(0, 500);
  }

  async function request(url, apiKey, body) {
    if (!apiKey) throw new Error('请先填写 Google AI API Key');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), body ? 120000 : 30000);
    try {
      const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const hints = {
          400: '请检查请求、API Key 和所在地区的服务支持。',
          401: '请检查 API Key。',
          403: '请检查 API Key 的权限、限制和服务可用地区。',
          404: '模型不存在或不支持此调用，请刷新模型列表、选择可用模型后重新测试。',
          429: '请求额度或速率受限，请检查配额和计费，稍后重试。',
        };
        throw new Error(`Google AI HTTP ${response.status}: ${data.error?.message || '请求失败'} ${hints[response.status] || ''}`);
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Google AI 请求超时，请稍后重试或减少图片数量');
      throw new Error(safeMessage(error.message, apiKey));
    } finally {
      clearTimeout(timer);
    }
  }

  // ListModels is paginated; only offer models supporting this app's API method.
  async function listModels(apiKey) {
    const models = [];
    const seen = new Set();
    const pages = new Set();
    let pageToken = '';
    do {
      const url = new URL(endpoint);
      url.searchParams.set('pageSize', '1000');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const data = await request(url.toString(), apiKey);
      for (const model of data.models || []) {
        if (!model.supportedGenerationMethods?.includes('generateContent')) continue;
        if (typeof model.name !== 'string' || !/^models\/[a-zA-Z0-9._-]+$/.test(model.name)) continue;
        const value = normalizeModel(model.name);
        if (seen.has(value)) continue;
        seen.add(value);
        models.push({ value, label: `${model.displayName || value} (${value})` });
      }
      pageToken = data.nextPageToken || '';
      if (pageToken && pages.has(pageToken)) throw new Error('Google AI 模型列表分页异常，请重试');
      pages.add(pageToken);
    } while (pageToken);
    if (!models.length) throw new Error('该 Key 未返回支持 generateContent 的模型，请检查权限后重试');
    return models;
  }

  function toParts(content) {
    if (typeof content === 'string') return [{ text: content }];
    return content.map(part => {
      if (part.type === 'text') return { text: part.text };
      const match = part.image_url?.url?.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\r\n]+)$/);
      if (!match) throw new Error('Google AI 图片必须为 base64 图片数据');
      return { inlineData: { mimeType: match[1], data: match[2] } };
    });
  }

  async function generateContent({ apiKey, model, messages }) {
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user', parts: toParts(m.content),
    }));
    const systemParts = messages.filter(m => m.role === 'system').flatMap(m => toParts(m.content));
    const body = { contents, generationConfig: { maxOutputTokens: 3000 } };
    if (systemParts.length) body.systemInstruction = { parts: systemParts };
    const data = await request(`${endpoint}/${normalizeModel(model)}:generateContent`, apiKey, body);
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('');
    if (!text?.trim()) {
      const reason = data.promptFeedback?.blockReason || candidate?.finishReason || '空响应';
      throw new Error(safeMessage(`Google AI 未返回文本（${reason}），请检查模型是否支持文本输出或调整内容后重试`, apiKey));
    }
    return text;
  }

  return { endpoint, normalizeModel, listModels, generateContent };
})();
