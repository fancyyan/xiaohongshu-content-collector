# XHS Collector MCP Server

把小红书内容收集器采集的本地语料,通过 [MCP](https://modelcontextprotocol.io) 暴露给 AI agent(Claude Desktop / Cursor / Cline 等),并可选桥接本机 `xiaohongshu-cli` 做实时搜索、详情、评论和热门内容读取。

- **零 Node 依赖**:仅用 Node 内置模块,无需 `npm install`。
- **本地优先**:本地语料工具不联网；只有 `xhs_*` 实时工具会显式调用本机 CLI。
- **默认只读**:不暴露点赞、收藏、评论、关注、删除或发布能力。
- **输入** = 插件「导出 > JSON」产出的 `corpus.json`(一个数组,每项是一条 post)。

## 快速开始

```bash
# 1) 在插件里「导出 > JSON」,存成本地文件,如:
#    ~/xhs-corpus.json

# 2) 跑 server(可直接喂样本试试,无需导出)
node mcp/server.mjs --corpus mcp/sample-corpus.json

# 3) 可选：启用实时 CLI 工具
uv tool install xiaohongshu-cli
xhs login
xhs status

# 4) 配置 MCP 客户端,见仓库根 README 的「🔌 MCP 集成」段
```

语料参数(二选一):
- CLI:`node mcp/server.mjs --corpus <路径>`
- 环境变量:`XHS_CORPUS=<路径> node mcp/server.mjs`

CLI Bridge 参数（可选）:
- `--xhs-bin <路径>` 或 `XHS_CLI_BIN=<路径>`：指定 `xhs` 可执行文件，默认从 `PATH` 查找。
- `--xhs-timeout <毫秒>` 或 `XHS_CLI_TIMEOUT_MS=<毫秒>`：单次调用超时，默认 45000，范围 5000–120000。

> 每次工具调用都会重新读取语料文件——**重新导出后无需重启 server**,agent 立刻看得到新数据。

## 语料 schema 契约

每条记录字段(来自 `lib/storage.js` 的 post 对象,缺失一律做防御):

| 字段 | 类型 | 说明 |
|---|---|---|
| `noteId` | string | 唯一 ID(主键) |
| `title` | string | 笔记标题 |
| `content` | string | 正文全文 |
| `tags` | string[] | 话题标签(无 #) |
| `type` | `'normal'` \| `'video'` | 图文或视频 |
| `source` | string | 采集来源:`dom_feed`/`search`/`detail`/`profile` 等 |
| `authorId` / `authorName` | string | 博主信息 |
| `likedCount` / `collectedCount` / `commentCount` | number | 互动数 |
| `images` | string[] | 图片 URL(xhscdn,有时效/防盗链) |
| `videoUrl` | string | 视频地址(视频笔记) |
| `capturedAt` / `updatedAt` | number(ms) | 采集/更新时间戳 |

兼容 `{data:[...]}` / `{posts:[...]}` 包裹形态。

## 能力清单

### Tools

| 工具 | 作用 | 关键参数 |
|---|---|---|
| `search_notes` | 关键词/来源/类型/标签检索,按互动排序 | `query, limit, source, type, tag` |
| `get_note` | 取单条全字段 | `noteId` |
| `list_creators` | 博主聚合(数/总互动/最新笔记) | `limit` |
| `stats` | 总体统计(分布/时间范围/P95/Top 标签) | — |
| `trending_tags` | 标签频次+样本 | `top` |
| `recent_notes` | 按采集时间倒序 | `limit` |
| `xhs_status` | 检查本机 CLI 登录状态 | — |
| `xhs_search` | 实时搜索并归一化笔记 | `query, sort, type, page, limit` |
| `xhs_read` | 实时读取一条笔记详情 | `idOrUrl` |
| `xhs_comments` | 读取一页评论，不自动全量翻页 | `idOrUrl, cursor, limit` |
| `xhs_hot` | 读取分类热门内容 | `category, limit` |

实时工具返回插件统一字段，不返回 Cookie 或 `xsec_token`。建议先调用 `xhs_status`，再用 `xhs_search` 找笔记，最后按需调用 `xhs_read` / `xhs_comments`；不要批量读取所有详情和全部评论。

### Resources
- `xhs-corpus://stats` —— 整体统计
- `xhs-note://{noteId}` —— 单条笔记全文

### Prompts(复刻插件 `bridge.js` 的 `getSystemPrompt` 四视角)
`爆款拆解` / `仿写文案` / `标签建议` / `选题推荐` / `博主画像`。
每个模板指导 agent「先用 tools 取数据,再按对应分析师视角输出」,而非让 server 自己跑 AI。

## 本地调试(协议自测)

```bash
printf '%s\n%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node mcp/server.mjs --corpus mcp/sample-corpus.json
```

期望:依次返回 `initialize` 结果(`serverInfo: xhs-collector-mcp`)与 `tools/list` 的 11 个工具 schema。

运行自动化测试（仅使用 Node 内置测试模块，无需安装依赖）：

```bash
node --test mcp/server.test.mjs
```

调一个工具:
```bash
printf '%s\n' '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_notes","arguments":{"query":"防晒","limit":3}}}' \
  | node mcp/server.mjs --corpus mcp/sample-corpus.json
```

## 如何加一个新 tool

1. 在 `mcp/server.mjs` 写 `async function tool_xxx(args) { ... return 数据; }`(数据会被 `JSON.stringify` 成工具结果文本)。
2. 在 `TOOLS` 数组加元数据(`name`/`description`/`inputSchema`)。
3. 在 `tools/call` 的 `fn` 映射表里登记。

## 安全边界
- server **不**读取插件 API Key,也不会把 Key 写进语料;一切推理由宿主模型完成。
- 语料仅是本机采集的公开展示笔记;images/videos 是 CDN URL,可能失效。
- 本地语料工具不联网；`xhs_*` 工具通过本机 `xiaohongshu-cli` 访问小红书，并沿用 CLI 自身 Cookie、限速和验证码处理。
- 子进程不经过 shell，命令固定在只读白名单，并强制串行执行；输出会移除临时令牌。
- server 不开 socket，不写语料文件；实时结果只返回给当前 MCP 客户端。

## 协议
MCP `2024-11-05`,stdio(JSON-RPC 2.0,换行分隔)。
