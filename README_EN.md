# Xiaohongshu Content Collector (XHS Collector)

<div align="center">

![Version](https://img.shields.io/badge/version-1.1.2-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Chrome](https://img.shields.io/badge/chrome-v88+-brightgreen.svg)

An intelligent Xiaohongshu (Little Red Book) content collection and analysis tool with automatic data collection, AI multimodal analysis, and data export capabilities.

[Features](#-features) • [Installation](#-installation) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [FAQ](#-faq)

[中文文档](README.md)

</div>

---

## ✨ Features

### 📊 Smart Data Collection
- **Passive API Interception** - Automatically intercepts Xiaohongshu API requests without active crawling
- **Multi-scenario Support** - Supports feed, search, detail pages, and user profiles
- **DOM Supplementary Scanning** - Combines DOM scanning to ensure data completeness
- **Deduplication Storage** - Automatic deduplication to avoid duplicate collection

### 🤖 AI Multimodal Analysis
- **Multiple Provider Support** - OpenRouter, Anthropic, OpenAI, Google AI, Qwen (Tongyi Qianwen), DeepSeek, MiniMax, and custom endpoints
- **China-based API Support** - Added Qwen, DeepSeek, MiniMax for users in China
- **Text & Image Analysis** - Analyzes both text content and visual style simultaneously
- **Multiple Analysis Modes** - Content analysis, copywriting, viral potential, tag suggestions, visual diagnostics, etc.
- **Batch Analysis** - Select multiple posts for one-click batch AI analysis with content analysis, viral detection, and tag analysis
- **Auto Analysis** - Automatically triggers AI analysis after auto-browsing completes
- **Analysis History** - All AI analysis results are auto-saved, with view, copy, and delete support
- **Custom Prompts** - Add custom analysis templates in settings, supports selecting custom prompts in batch analysis
- **Real-time Analysis** - Direct AI analysis in the browser

### 🛡️ Smart Anti-Detection
- **Rate Limiting** - Sliding window statistics with intelligent throttling
- **Behavior Simulation** - Simulates real user behavior (random scrolling, pauses, fatigue effects)
- **Configurable Parameters** - Flexible adjustment of rate limits and behavior parameters

### 📤 Multiple Export Formats
- **JSON** - Complete structured data
- **JSONL** - Line-by-line format for easy processing
- **Markdown** - Highly readable document format
- **Training Data** - Format suitable for AI model fine-tuning

### 💾 Storage Capacity Management
- **Capacity Monitoring** - Real-time display of storage usage and capacity percentage
- **Capacity Warnings** - Automatic alerts when approaching (80%) or reaching storage limit
- **Flexible Cleanup** - Clean data by age, export status, or count
- **Export Tracking** - Auto-marks exported data, supports cleaning exported records

### ⚙️ Visual Configuration
- **Settings Interface** - Complete visual settings page
- **Step-by-step Guide** - Clear step indicators to guide users through configuration
- **API Categories** - Recommended (International), China-based, Custom
- **Quick Presets** - Conservative, balanced, fast collection, unlimited images
- **Smart Validation** - Only requires API testing when API config changes
- **Real-time Effect** - Configuration changes take effect immediately
- **Help & Support** - Built-in tutorials, issue reporting, GitHub links

---

## 🚀 Installation

### Method 1: Install from Release (Recommended)

1. **Download Package**
   - Go to [Releases](https://github.com/fancyyan/xiaohongshu-content-collector/releases) page
   - Download the latest version `xhs-collector-beta-v1.1.2.zip`
   - Or direct download: [xhs-collector-beta-v1.1.2.zip](https://github.com/fancyyan/xiaohongshu-content-collector/releases/download/v1.1.2/xhs-collector-beta-v1.1.2.zip)

2. **Extract Files**
   - Extract the downloaded zip file to a local folder

3. **Load into Chrome**
   - Open Chrome browser
   - Visit `chrome://extensions/`
   - Enable "Developer mode" in the top right corner
   - Click "Load unpacked"
   - Select the extracted folder

4. **Verify Installation**
   - See "小红书内容收集器 (公测版)" in the extension list
   - Icon appears in the browser toolbar

### Method 2: Install from Source

1. **Clone Repository**
   ```bash
   git clone https://github.com/fancyyan/xiaohongshu-content-collector.git
   cd xiaohongshu-content-collector
   ```

2. **Load into Chrome**
   - Follow steps 3-4 from Method 1

---

## 🎯 Quick Start

### Step 1: Configure API (Optional)

If you want to use AI analysis features, you need to configure an API:

1. **Open Settings Page**
   - Click the extension icon in the browser toolbar
   - Click the **⚙️ Settings** button in the top right

2. **Select API Provider**
   - **Recommended (International)**: OpenRouter (multiple models), Anthropic, OpenAI, Google AI
   - **China-based**: Qwen Tongyi Qianwen (multimodal), DeepSeek (text only), MiniMax (text only)
   - **Custom**: Custom API endpoint
   - Recommended: **OpenRouter** (multiple models, cost-effective) or **Qwen** (fast access in China)
   - Get API Key:
     - OpenRouter: https://openrouter.ai/keys
     - Qwen: https://help.aliyun.com/zh/model-studio/getting-started/first-api-call-to-qwen

3. **Configure API**
   - Enter API Key
   - Select AI Model (Recommended: Gemini 2.0 Flash)
   - Click "Save"

### Step 2: Start Collecting

1. **Visit Xiaohongshu**
   - Open https://www.xiaohongshu.com/
   - Browse content normally

2. **Automatic Collection**
   - The extension automatically intercepts and collects browsed content
   - No action required, passive collection

3. **View Statistics**
   - Click the extension icon to view collection statistics
   - See the number of collected posts

### Step 3: Use AI Analysis (Optional)

1. **Open AI Panel**
   - On Xiaohongshu pages, click the AI analysis button in the bottom right
   - 🤖 (detail page), 📈 (feed), 👤 (user profile)

2. **Select Analysis Type**
   - Content analysis, copywriting, viral potential, etc.
   - Click the corresponding button to start analysis

3. **View Results**
   - AI analyzes both text and image content
   - Results can be copied or saved as files

### Step 4: Export Data

1. **Open Popup**
   - Click the extension icon

2. **Select Export Format**
   - JSON, JSONL, Markdown, Training Data
   - Click the corresponding button to export

3. **Save File**
   - Choose save location
   - File will be downloaded automatically

---

## 📖 Documentation

### Auto-Browse Feature

**Description:**
Automatically scrolls the page, simulates real user browsing behavior, and collects content automatically.

**Usage:**
1. Open extension Popup
2. Select scroll speed (slow/normal/fast)
3. Set maximum scroll count
4. Click "Start Auto Browse"

**Notes:**
- Recommended to use "normal" or "slow" mode
- Don't set too large scroll count
- Can click "Stop" button anytime

### AI Analysis Features

**Supported Analysis Types:**

**Detail Page Analysis:**
- 📊 Content Analysis - Analyze theme, style, audience, etc.
- ✍️ Copywriting - Mimic style to write new copy
- 🔥 Viral Potential - Evaluate viral possibility
- 🏷️ Tag Suggestions - Recommend precise tags
- 🎨 Visual Diagnostics - Analyze image style and composition

**Feed Analysis:**
- 📈 Trend Insights - Analyze popular topics and trends
- 🎯 Topic Recommendations - Recommend potential topics
- 🏆 Viral Post Analysis - Analyze high-engagement posts
- 📊 Data Reports - Generate data analysis reports

**User Profile Analysis:**
- 👤 Creator Profile - Analyze positioning and style
- 📐 Operation Strategy - Analyze operation methods
- 🔥 Viral Post Review - Summarize viral post patterns
- 🎯 Benchmark Suggestions - Recommend benchmark directions

### Configuration

**Image Quantity Limits:**
- Detail page: Default 6 (Recommended 3-15)
- Feed: Default 8 (Recommended 5-20)
- User profile: Default 8 (Recommended 5-30)
- Set to 0 for unlimited

**Rate Control:**
- Max requests per minute: Default 25 (Recommended 15-35)
- Max requests per 5 minutes: Default 80 (Recommended 50-120)
- Min request interval: Default 2500ms (Recommended 2000-4000)

**Scroll Behavior:**
- Upward scroll probability: Default 10% (Recommended 5-20%)
- Long pause probability: Default 15% (Recommended 10-30%)
- Fatigue threshold: Default 50/100 times

---

## 🔧 Advanced Features

### Custom API Endpoint

If you have your own API service:

1. Select "Custom" provider in settings page
2. Enter API endpoint URL
3. Enter API Key
4. Ensure API is compatible with OpenAI format

### Quick Presets

**Conservative (Recommended for beginners):**
- Images: 6/8/8
- Rate: 20/min, 60/5min
- Interval: 3000ms

**Balanced (Default):**
- Images: 6/8/8
- Rate: 25/min, 80/5min
- Interval: 2500ms

**Fast Collection (Risky):**
- Images: 10/15/15
- Rate: 35/min, 100/5min
- Interval: 2000ms

**Unlimited Images:**
- Images: Unlimited
- Rate: 25/min, 80/5min
- Interval: 2500ms

---

## ❓ FAQ

### Q: Is the extension safe? Will it leak data?
A: Completely safe. All data is stored locally in the browser's IndexedDB and is not uploaded to any server. API Keys are also encrypted and stored locally.

### Q: Will I get banned by Xiaohongshu?
A: The extension uses passive interception, simulates real user behavior, and has intelligent rate control. Normal use will not trigger anti-detection. Conservative configuration is recommended.

### Q: Can I use it without configuring an API Key?
A: Yes. Data collection features don't require an API Key. Only AI analysis features need API configuration.

### Q: Which AI models are supported?
A: Supports models from OpenRouter, Anthropic, OpenAI, Google AI, and other providers. Recommended: OpenRouter's Gemini 2.0 Flash (best cost-performance).

### Q: How to export data?
A: Click the extension icon, select format in the "Data Export" section (JSON/JSONL/Markdown/Training Data), and click the corresponding button to export.

### Q: Will auto-browse trigger anti-detection?
A: No. The extension has intelligent rate control and behavior simulation that automatically adjusts speed. "Normal" or "slow" mode is recommended.

### Q: Can I use it in multiple tabs simultaneously?
A: Yes, but it's recommended to use auto-browse in only one tab at a time to avoid excessive request frequency.

### Q: Where is data stored?
A: Stored in the browser's IndexedDB, path: Chrome DevTools → Application → IndexedDB → xhs_collector

### Q: How to clear data?
A: Click the extension icon and click the "Clear Data" button at the bottom. Note: This operation is irreversible.

### Q: What are the API costs?
A: Depends on the model used and number of images. Using Gemini 2.0 Flash + default image count, approximately $0.5-1 per 100 analyses.

---

## 🛠️ Technical Architecture

### Core Technologies
- **Manifest V3** - Latest Chrome extension standard
- **Content Scripts** - Page injection and data interception
- **Service Worker** - Background data processing
- **IndexedDB** - Local data storage
- **Chrome Storage API** - Configuration synchronization

### File Structure
```
xhs-collector/
├── manifest.json          # Extension configuration
├── background.js          # Service Worker
├── injector.js           # API interception script (MAIN world)
├── bridge.js             # Bridge script (ISOLATED world)
├── ai-panel.css          # AI panel styles
├── popup/                # Popup interface
│   ├── popup.html
│   ├── popup.css
│   ├── popup.js
│   ├── settings.html     # Settings page
│   ├── settings.css
│   └── settings.js
├── icons/                # Icon resources
└── docs/                 # Documentation
```

---

## 🤝 Contributing

Contributions, bug reports, and suggestions are welcome!

### Report Issues
- Go to [Issues](https://github.com/fancyyan/xiaohongshu-content-collector/issues) page
- Describe the problem and reproduction steps
- Attach screenshots or error messages

### Submit Code
1. Fork this project
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Thanks to [OpenRouter](https://openrouter.ai/) for multi-model API support
- Thanks to all contributors and users for their support

---

## 📮 Contact

- Bug Reports: [GitHub Issues](https://github.com/fancyyan/xiaohongshu-content-collector/issues)
- Feature Requests: [GitHub Discussions](https://github.com/fancyyan/xiaohongshu-content-collector/discussions)
- Email: fancyyan@icloud.com

---

<div align="center">

**⭐ If this project helps you, please give it a Star!**

Made with ❤️ by [Fancy Yan](https://github.com/fancyyan)

</div>
