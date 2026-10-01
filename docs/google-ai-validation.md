# Google AI 修复与验证

## 问题与实现

Issue [#1](https://github.com/fancyyan/xiaohongshu-content-collector/issues/1) 报告 `gemini-2.0-flash-exp` 无法调用 v1beta `generateContent`。2026-10-01 核对时，Issue 仍开放且没有回复；主分支基线为 `e23c7888d020a482aefb35daef10a49a157f93c0`（2026-09-08）。

原设置页推荐该旧模型，Google 不支持刷新模型列表。实际分析和追问还统一使用 OpenAI 格式，与设置页的 Google 测试不同。

本次修复：

- Google 内置清单使用当前稳定的 `gemini-3.8-flash` 和 `gemini-3.5-flash-lite`。内置清单是尚未刷新的起点，账号实际可用性仍须测试。
- 使用 `models.list`，处理 `nextPageToken`、去重，按 `supportedGenerationMethods` 中的 `generateContent` 筛选。发现结果仅在当前设置会话保留，避免跨 Key 复用；成功刷新后使用服务端清单，而非把旧内置模型重新混入。
- 保留已保存/当前选择，并标出未在清单中的模型；不静默替换模型，也不因为存在已保存的 Google Key 就假定测试成功。
- `lib/google-ai.js` 统一请求头鉴权、模型名称归一化、超时、错误脱敏、文本响应验证、图片和对话转换。测试发送短文本提示；实际分析输出上限为 3000 tokens。
- 内容脚本的 Google 分支通过后台读取已保存配置并发请求。测试、图文分析与追问使用相同适配器。默认 OpenRouter 和其他供应商的 API 协议不变。
- 扩展增加 Google API 域名权限。更新扩展时 Chrome 可能要求确认新增权限；需重新加载扩展及已打开的小红书页。

`generateContent` 能力本身不保证图片输入或文本输出，设置页已提示按模型文档选择。本次不自动切换到其他模型或绕过配额错误。

## 官方依据（2026-10-01 查阅）

- [模型目录](https://ai.google.dev/gemini-api/docs/models)：稳定与实验模型的区别、当前模型和旧模型状态。
- [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) / [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)：稳定模型 ID，支持图片输入、文本输出。
- [Models REST](https://ai.google.dev/api/models)：分页字段、资源名以及 `supportedGenerationMethods`。
- [GenerateContent REST](https://ai.google.dev/api/generate-content)：v1beta 路径、`contents`、`systemInstruction`、多轮上下文及响应格式。
- [API Key](https://ai.google.dev/gemini-api/docs/api-key)：`x-goog-api-key` 请求头。
- [错误排查](https://ai.google.dev/gemini-api/docs/troubleshooting)：模型、权限、区域及配额错误。

## 自动化验证

无需依赖或真实密钥：

```sh
node --test tests/google-ai.test.mjs mcp/server.test.mjs
node --check lib/google-ai.js
node --check popup/settings.js
node --check background.js
node --check bridge.js
node --check mcp/server.mjs
git diff --check
```

结果：20 项通过（Google 13 项 + 原 MCP 7 项）。覆盖模型分页/过滤/去重、空清单、分页循环、缺 Key、非法模型、图文/多轮请求、有效文本、空/受限响应、HTTP 400/401/403/404/429/503、超时、网络错误、密钥脱敏以及后台配置来源。语法与空白检查通过。

## 可选真实浏览器集成验证

已安装 Playwright 及其 Chromium 时：

```sh
node tests/google-ai.browser.mjs
```

脚本支持以下可选环境变量：

- `PLAYWRIGHT_MODULE`：已有 Playwright `index.mjs` 的绝对路径；未设置时使用可解析的 `playwright` 包。
- `CHROMIUM_EXECUTABLE`：已有 Chromium / Chrome for Testing 的绝对路径。
- `BROWSER_ARTIFACTS`：截图保存目录。

脚本建立并清理独立临时浏览器配置，在真实 MV3 扩展中执行设置页和内容脚本，所有外部请求均使用模拟响应/虚构笔记，阻断未预期网络请求，不使用个人 Chrome 配置。后台分析测试只替换网络传输，实际扩展消息处理和 Gemini 适配器仍运行。

本机运行结果：13 项浏览器检查全部通过，未出现页面 JavaScript 错误。Node v25.8.0，Chrome for Testing 145.0.7632.6。

如果使用已有的浏览器安装，按上面的环境变量指定本机路径后，在仓库根目录执行测试脚本即可。

检查项：新安装默认 OpenRouter；Google 可先刷新再测试；旧模型保留并要求重测；404 恢复；选定模型测试及保存；403/429/无文本不通过；刷新失败保持选择；更换 Key 丢弃旧发现结果；测试中切换模型/供应商丢弃旧结果；OpenRouter/Qwen 刷新、缓存、连接回归；真实内容脚本图文分析及多轮追问。

## 尚未运行的验证

没有运行真实 Google API 调用。执行环境没有提供 `GEMINI_API_KEY` 或 `GOOGLE_API_KEY`，也未读取个人浏览器配置、复制凭证或新建 Key。因此模拟测试不能证明具体账号的模型权限、地区、配额或实时服务状态。

真实验收时，在自己的扩展设置中填写 Key，刷新、选定模型、测试、保存，再用一条图文笔记执行分析及追问；不要把 Key 发到 Issue、PR 或日志。
