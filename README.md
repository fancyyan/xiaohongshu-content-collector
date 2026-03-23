# 小红书内容收集器 (XHS Collector)

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.3-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Chrome](https://img.shields.io/badge/chrome-v88+-brightgreen.svg)

一个智能的小红书内容收集和分析工具，支持自动采集、AI 多模态分析、数据导出等功能。

[功能特性](#功能特性) • [安装指南](#安装指南) • [快速开始](#快速开始) • [使用文档](#使用文档) • [常见问题](#常见问题)

[English Documentation](README_EN.md)

</div>

---
## ⚠️ 免责声明

#### 本插件仅用于AI vibe coding 私人学习，切勿滥用，如果被小红书风控封号，不负赔偿责任！！！！酌情使用！！！！

## ✨ 功能特性

### 📊 智能数据采集
- **被动拦截采集** - 自动拦截小红书 API 请求，无需主动爬取
- **多场景支持** - 支持推荐流、搜索、详情页、用户主页
- **DOM 补充扫描** - 结合 DOM 扫描，确保数据完整性
- **去重存储** - 自动去重，避免重复收集

### 🤖 AI 多模态分析
- **多供应商支持** - OpenRouter、Anthropic、OpenAI、Google AI、自定义端点
- **图文分析** - 同时分析文字内容和图片视觉风格
- **多种分析模式** - 内容分析、仿写文案、爆款潜力、标签建议、视觉诊断等
- **实时分析** - 在浏览器中直接进行 AI 分析

### 🛡️ 智能风控规避
- **频率控制** - 滑动时间窗口统计，智能限流
- **行为模拟** - 模拟真实用户行为（随机滚动、暂停、疲劳效应）
- **可配置参数** - 灵活调整频率限制和行为参数

### 📤 多格式导出
- **JSON** - 完整的结构化数据
- **JSONL** - 逐行格式，便于处理
- **Markdown** - 可读性强的文档格式
- **训练数据** - 适合 AI 模型微调的格式

### ⚙️ 可视化配置
- **设置界面** - 完整的可视化设置页面
- **快速预设** - 保守安全、均衡模式、快速采集、无限图片
- **实时生效** - 配置修改后立即生效

---

## 🚀 安装指南

### 方法 1：从 Release 安装（推荐）

1. **下载安装包**
   - 前往 [Releases](https://github.com/fancyyan/xiaohongshu-content-collector/releases) 页面
   - 下载最新版本的 `xhs-collector-beta-v1.0.3.zip`
   - 或直接下载：[xhs-collector-beta-v1.0.3.zip](https://github.com/fancyyan/xiaohongshu-content-collector/releases/download/v1.0.3/xhs-collector-beta-v1.0.3.zip)

2. **解压文件**
   - 将下载的 zip 文件解压到本地文件夹

3. **加载到 Chrome**
   - 打开 Chrome 浏览器
   - 访问 `chrome://extensions/`
   - 开启右上角的"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择解压后的文件夹

4. **验证安装**
   - 在扩展列表中看到"小红书内容收集器 (公测版)"
   - 图标显示在浏览器工具栏

### 方法 2：从源码安装

1. **克隆项目**
   ```bash
   git clone https://github.com/fancyyan/xiaohongshu-content-collector.git
   cd xiaohongshu-content-collector
   ```

2. **加载到 Chrome**
   - 按照方法 1 的步骤 3-4 加载到 Chrome

---

## 🎯 快速开始

### 第一步：配置 API（可选）

如果你想使用 AI 分析功能，需要配置 API：

1. **打开设置页面**
   - 点击浏览器工具栏的插件图标
   - 点击右上角的 **⚙️ 设置** 按钮

2. **选择 API 供应商**
   - 推荐使用 **OpenRouter**（支持多种模型，性价比高）
   - 获取 API Key：https://openrouter.ai/keys

3. **配置 API**
   - 输入 API Key
   - 选择 AI 模型（推荐：Gemini 2.0 Flash）
   - 点击"保存"

### 第二步：开始收集

1. **访问小红书**
   - 打开 https://www.xiaohongshu.com/
   - 正常浏览内容

2. **自动收集**
   - 插件会自动拦截并收集浏览过的内容
   - 无需任何操作，被动收集

3. **查看统计**
   - 点击插件图标查看收集统计
   - 查看已收集的帖子数量

### 第三步：使用 AI 分析（可选）

1. **打开 AI 面板**
   - 在小红书页面，点击右下角的 AI 分析按钮
   - 🤖（详情页）、📈（信息流）、👤（博主主页）

2. **选择分析类型**
   - 内容分析、仿写文案、爆款潜力等
   - 点击对应按钮开始分析

3. **查看结果**
   - AI 会分析文字和图片内容
   - 结果可以复制或保存为文件

### 第四步：导出数据

1. **打开 Popup**
   - 点击插件图标

2. **选择导出格式**
   - JSON、JSONL、Markdown、训练数据
   - 点击对应按钮导出

3. **保存文件**
   - 选择保存位置
   - 文件会自动下载

---

## 📖 使用文档

### 自动浏览功能

**功能说明：**
自动滚动页面，模拟真实用户浏览行为，自动收集内容。

**使用方法：**
1. 打开插件 Popup
2. 选择滚动速度（慢速/正常/快速）
3. 设置最大滚动次数
4. 点击"开始自动浏览"

**注意事项：**
- 建议使用"正常"或"慢速"模式
- 不要设置过大的滚动次数
- 可以随时点击"停止"按钮

### AI 分析功能

**支持的分析类型：**

**详情页分析：**
- 📊 内容分析 - 分析主题、风格、受众等
- ✍️ 仿写文案 - 模仿风格写新文案
- 🔥 爆款潜力 - 评估爆款可能性
- 🏷️ 标签建议 - 推荐精准标签
- 🎨 视觉诊断 - 分析图片风格和构图

**信息流分析：**
- 📈 趋势洞察 - 分析热门主题和趋势
- 🎯 选题推荐 - 推荐有潜力的选题
- 🏆 爆文拆解 - 拆解高互动帖子
- 📊 数据报告 - 生成数据分析报告

**博主主页分析：**
- 👤 博主画像 - 分析定位和风格
- 📐 运营策略 - 分析运营方法
- 🔥 爆款复盘 - 总结爆款规律
- 🎯 对标建议 - 推荐对标方向

### 配置说明

**图片数量限制：**
- 详情页：默认 6 张（建议 3-15）
- 信息流：默认 8 张（建议 5-20）
- 博主主页：默认 8 张（建议 5-30）
- 设置为 0 表示无限制

**频率控制：**
- 每分钟最大请求数：默认 25（建议 15-35）
- 5分钟最大请求数：默认 80（建议 50-120）
- 最小请求间隔：默认 2500ms（建议 2000-4000）

**滚动行为：**
- 向上滚动概率：默认 10%（建议 5-20%）
- 长暂停概率：默认 15%（建议 10-30%）
- 疲劳阈值：默认 50/100 次

---

## 🔧 高级功能

### 自定义 API 端点

如果你有自己的 API 服务：

1. 在设置页面选择"自定义"供应商
2. 输入 API 端点 URL
3. 输入 API Key
4. 确保 API 兼容 OpenAI 格式

### 快速预设

**保守安全（推荐新手）：**
- 图片：6/8/8 张
- 频率：20次/分钟，60次/5分钟
- 间隔：3000ms

**均衡模式（默认）：**
- 图片：6/8/8 张
- 频率：25次/分钟，80次/5分钟
- 间隔：2500ms

**快速采集（有风险）：**
- 图片：10/15/15 张
- 频率：35次/分钟，100次/5分钟
- 间隔：2000ms

**无限图片：**
- 图片：无限制
- 频率：25次/分钟，80次/5分钟
- 间隔：2500ms

---

## ❓ 常见问题

### Q: 插件安全吗？会不会泄露数据？
A: 完全安全。所有数据都存储在本地浏览器的 IndexedDB 中，不会上传到任何服务器。API Key 也是加密存储在本地。

### Q: 会不会被小红书封号？
A: 插件采用被动拦截方式，模拟真实用户行为，并有智能频率控制。正常使用不会触发风控。建议使用保守配置。

### Q: 不配置 API Key 可以使用吗？
A: 可以。数据收集功能不需要 API Key。只有 AI 分析功能需要配置 API。

### Q: 支持哪些 AI 模型？
A: 支持 OpenRouter、Anthropic、OpenAI、Google AI 等多个供应商的模型。推荐使用 OpenRouter 的 Gemini 2.0 Flash（性价比最高）。

### Q: 如何导出数据？
A: 点击插件图标，在"数据导出"部分选择格式（JSON/JSONL/Markdown/训练数据），点击对应按钮即可导出。

### Q: 自动浏览会不会太快触发风控？
A: 不会。插件有智能频率控制和行为模拟，会自动调整速度。建议使用"正常"或"慢速"模式。

### Q: 可以同时在多个标签页使用吗？
A: 可以，但建议一次只在一个标签页使用自动浏览功能，避免请求过于频繁。

### Q: 数据存储在哪里？
A: 存储在浏览器的 IndexedDB 中，路径：Chrome DevTools → Application → IndexedDB → xhs_collector

### Q: 如何清空数据？
A: 点击插件图标，在底部点击"清空数据"按钮。注意：此操作不可撤销。

### Q: API 费用大概多少？
A: 取决于使用的模型和图片数量。使用 Gemini 2.0 Flash + 默认图片数量，大约每 100 次分析 $0.5-1。

---

## 🛠️ 技术架构

### 核心技术
- **Manifest V3** - Chrome 扩展最新标准
- **Content Scripts** - 页面注入和数据拦截
- **Service Worker** - 后台数据处理
- **IndexedDB** - 本地数据存储
- **Chrome Storage API** - 配置同步

### 文件结构
```
xhs-collector/
├── manifest.json          # 扩展配置文件
├── background.js          # Service Worker
├── injector.js           # API 拦截脚本（MAIN world）
├── bridge.js             # 桥接脚本（ISOLATED world）
├── ai-panel.css          # AI 面板样式
├── popup/                # Popup 界面
│   ├── popup.html
│   ├── popup.css
│   ├── popup.js
│   ├── settings.html     # 设置页面
│   ├── settings.css
│   └── settings.js
├── icons/                # 图标资源
└── docs/                 # 文档
```

---

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出建议！

### 报告问题
- 前往 [Issues](https://github.com/fancyyan/xiaohongshu-content-collector/issues) 页面
- 描述问题和复现步骤
- 附上截图或错误信息

### 提交代码
1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

---

## 🙏 致谢

- 感谢 [OpenRouter](https://openrouter.ai/) 提供多模型 API 支持
- 感谢所有贡献者和用户的支持

---

## 📮 联系方式

- 问题反馈：[GitHub Issues](https://github.com/fancyyan/xiaohongshu-content-collector/issues)
- 功能建议：[GitHub Discussions](https://github.com/fancyyan/xiaohongshu-content-collector/discussions)
- 邮箱：fancyyan@icloud.com

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给个 Star！**

Made with ❤️ by [Fancy Yan](https://github.com/fancyyan)

</div>
