# uni-ai-x 项目指南

> 面向二次开发者的完整参考文档，涵盖目录结构、各文件职责说明及二开指引。

---

## 一、目录结构

```
uni-ai-x/
├── App.uvue                          # 应用入口，注册生命周期与 OpenClaw 插件
├── main.uts                          # Vue 应用挂载入口
├── manifest.json                     # 平台配置（AppID、权限、证书等）
├── pages.json                        # 页面路由注册
├── uni.scss                          # 全局样式变量
├── index.html                        # Web 端 HTML 模板
│
├── pages/
│   └── test-cmark/                   # ⚠️ 已废弃的测试页面（未注册，可删除）
│
├── uni_modules/
│   ├── uni-ai-x/                     # ★ 核心业务模块
│   │   ├── config.uts                # AI 提供商配置（模型列表、Token 获取）
│   │   ├── types.uts                 # 全局类型定义
│   │   ├── sdk/                      # 业务逻辑层
│   │   │   ├── index.uts             # UniAi 主类（会话/消息/存储/请求编排）
│   │   │   ├── requestAiRunner.uts   # 请求生命周期管理（SSE/自定义 Provider/Demo）
│   │   │   ├── parseMarkdown.uts     # 流式 Markdown 增量解析调度核心
│   │   │   ├── markdown-utils.uts    # Markdown 辅助纯函数（表格宽度估算）
│   │   │   ├── parseCode.uts         # 代码语法高亮解析
│   │   │   ├── sse.uts               # SSE chunk 解析（ArrayBuffer → Chunk）
│   │   │   ├── message-builder.uts   # 消息列表 → 模型请求体转换（多模态）
│   │   │   ├── storage-manager.uts   # 会话 / 消息本地持久化
│   │   │   ├── proxy-web.uts         # App 端 WebView 桥接（KaTeX / Mermaid）
│   │   │   ├── model-capabilities.uts # 模型能力扫描（深度思考 / 联网 / 图片）
│   │   │   ├── provider-registry.uts # 自定义 AI Provider 注册表
│   │   │   ├── text-width.uts        # 文本宽度同步估算（代码块 / 表格列宽）
│   │   │   ├── image-upload.uts      # 图片选择 / 上传 / 进度回写
│   │   │   ├── demo-chat.uts         # Demo 模式判断与演示 Prompt
│   │   │   └── testMarkdownText.uts  # ⚠️ Demo 测试文本（非空时绕过真实请求）
│   │   │
│   │   ├── components/               # UI 组件层
│   │   │   ├── uni-ai-chat.uvue          # 聊天主容器（滚动编排 / 消息列表）
│   │   │   ├── uni-ai-chat-nav.uvue      # 顶部导航栏（标题 / 新建会话 / 切换）
│   │   │   ├── uni-ai-chat-input/        # 底部输入区（输入框 + 发送）
│   │   │   ├── uni-ai-x-msg/             # AI 消息气泡（Think 折叠 / MD 渲染）
│   │   │   ├── uni-ai-user-msg.uvue      # 用户消息气泡
│   │   │   ├── uni-ai-md-node/           # Markdown 块级节点渲染器
│   │   │   ├── uni-ai-md-inline/         # Markdown 行内节点渲染器
│   │   │   ├── uni-ai-msg-code/          # 代码块（语法高亮 / 复制 / 横滚）
│   │   │   ├── uni-ai-msg-table/         # 表格组件
│   │   │   ├── uni-ai-msg-mermaid/       # Mermaid 流程图图片预览
│   │   │   ├── katex-el/                 # KaTeX 数学公式组件
│   │   │   ├── uni-ai-draft-images/      # 待发送图片预览区
│   │   │   ├── uni-ai-menu.uvue          # 左侧会话列表抽屉
│   │   │   ├── add-chat.uvue             # 新建会话按钮
│   │   │   ├── add-chat-btn.uvue         # 悬浮新建会话按钮
│   │   │   ├── msg-tool-bar.uvue         # 消息底部工具栏（复制 / 重新生成）
│   │   │   ├── input-tool-bar.uvue       # 输入区工具栏（能力图标入口）
│   │   │   ├── uni-ai-icon/              # AI 专属图标组件
│   │   │   ├── uni-rotate-icon/          # 旋转 Loading 图标
│   │   │   └── fps/                      # FPS 帧率面板（Demo 模式下显示）
│   │   │
│   │   └── pages/
│   │       ├── index/index.uvue          # 聊天主页面（挂载 uni-ai-chat）
│   │       ├── select-text/              # 文本选择页面
│   │       └── common/webview/           # 隐藏 WebView（代理 Web 生态能力）
│   │
│   ├── uni-cmark/                    # ★ Markdown 原生解析插件
│   │   └── utssdk/
│   │       ├── interface.uts         # 平台无关类型定义（MarkdownToken / ParseMdRes）
│   │       ├── app-android/          # Android：同步 md2json + 异步 asyncMd2json
│   │       ├── app-ios/              # iOS：同步 md2json（返回 string，接口差异点）
│   │       ├── app-harmony/          # HarmonyOS：同步 md2json（返回 ParseMdRes）
│   │       ├── web/                  # Web：WebAssembly 实现
│   │       └── mp-weixin/            # 微信小程序：WebAssembly 实现
│   │
│   ├── uni-highlight/                # 代码语法高亮插件
│   ├── uni-ai-x-openClaw/            # 可选扩展：OpenClaw WebSocket 自定义 Provider
│   │   ├── install.uts               # 注册入口（在 App.uvue 中调用）
│   │   └── websocket-manager.uts     # WebSocket 连接 / 消息处理
│   ├── uni-icons/                    # uni 官方图标组件
│   ├── uni-popup/                    # uni 官方弹窗组件
│   ├── uni-id-common/                # uni-id 公共模块
│   └── uni-config-center/            # 配置中心
│
├── uniCloud-alipay/                  # uniCloud 云函数（支付宝）
│
└── harmony-configs/                  # 鸿蒙端额外配置
    └── build-profile.json5
```

---

## 二、核心文件职责说明

### 业务逻辑层（`sdk/`）

| 文件 | 职责 | 关键导出 |
|---|---|---|
| `index.uts` | 全局单例 `uniAi`，管理会话 CRUD、消息增删、设置持久化、请求编排 | `uniAi`, `uiTheme`, `testMarkdownText` |
| `requestAiRunner.uts` | 封装单次 AI 对话的完整生命周期：SSE 请求、流式接收、解析触发、错误处理、Abort | `RequestAiRunner` |
| `parseMarkdown.uts` | 流式 Markdown 增量解析的核心调度类，包含：防抖分段、数学公式预处理、代码高亮、Mermaid / KaTeX 渲染、平台分支路由 | `ParseMarkdown` |
| `config.uts` | 定义所有支持的 AI 提供商（baseURL、模型列表、getToken 函数） | `llmModelMap`, `defaultLLM` |
| `types.uts` | 项目全局类型，包含 `MsgItem`、`ChatItem`、`Chunk`、`CustomProviderAdapter` 等 | 所有类型 |
| `storage-manager.uts` | 封装聊天列表、消息 ID 列表、消息内容的 `uni.storage` 读写，分 key 存储防止单次读取过大 | `StorageManager` |
| `proxy-web.uts` | App 端通过隐藏 WebView 调用 Web 生态能力（KaTeX 渲染、Mermaid 渲染），维护回调 Map | `proxyWeb` |
| `provider-registry.uts` | 管理自定义 AI Provider 的注册与查询 | `registerCustomProvider`, `getCustomProvider` |
| `demo-chat.uts` | Demo 模式开关查询、演示 Prompt 常量 | `isDemoMarkdownEnabled`, `demoPrompt` |
| `testMarkdownText.uts` | ⚠️ Demo 测试文本，**非空时所有发送操作改为本地流式回放，不发起真实网络请求** | `testMarkdownText` |

### UI 组件层（`components/`）关键组件

| 组件 | 层级 | 职责 |
|---|---|---|
| `uni-ai-chat` | 页面级 | 聊天主容器：消息列表渲染、滚动跟随、会话状态响应 |
| `uni-ai-x-msg` | 消息级 | AI 消息气泡：深度思考折叠、Markdown 节点遍历渲染 |
| `uni-ai-md-node` | 节点级 | 块级 Markdown Token 渲染（标题、段落、代码块、表格、列表等） |
| `uni-ai-md-inline` | 节点级 | 行内 Markdown Token 渲染（加粗、斜体、链接、代码、数学） |
| `uni-ai-msg-code` | 节点级 | 代码块展示：语法高亮、复制按钮、横向滚动 |
| `uni-ai-chat-input` | 交互级 | 底部输入框，直接读写当前会话的 `inputContent` |
| `input-tool-bar` | 交互级 | 输入区工具图标（深度思考、联网搜索、图片上传） |

---

## 三、消息流转主链路

```
用户点击发送
    │
    ▼
uni-ai-chat.uvue
    │  调用
    ▼
uniAi.sendMsg()                       ← sdk/index.uts
    │  创建用户消息 + AI 占位消息
    │  创建 RequestAiRunner
    ▼
RequestAiRunner.start()               ← sdk/requestAiRunner.uts
    │
    ├─ [Demo 模式] streamDemoMarkdown()   逐批输出 testMarkdownText
    │
    └─ [真实模式] requestRemoteAi()
           │  SSE 流式接收 chunk
           ▼
       onChunkFn()  →  msgBody 累积
           │
           ▼
       ParseMarkdown.runTask(msgBody)  ← sdk/parseMarkdown.uts
           │  分段解析（防抖 + 节流）
           │  enrichToken（高亮 / KaTeX / Mermaid）
           ▼
       onMarkdownElList(tokenList)     ← 回调回写 aiMsgItem
           │
           ▼
uni-ai-x-msg → uni-ai-md-node         ← 组件层渲染 Token 树
```

---

## 四、二次开发指南

### 4.1 接入新的 AI 提供商

**方式一：标准 HTTP 提供商**（推荐）

在 `uni_modules/uni-ai-x/config.uts` 的 `llmModelMap` 中添加配置：

```typescript
llmModelMap.set('your-provider', {
    baseURL: 'https://api.your-provider.com/v1/chat/completions',
    models: [
        { name: 'your-model-name' },
        { name: 'your-model-v2', thinking: true }   // thinking: 支持深度思考
    ],
    getToken: async () => {
        // 返回 Bearer Token 字符串
        // 可调用 uniCloud 云函数或自建服务获取临时 token
        return 'Bearer sk-xxxx'
    }
})
```

同时设置默认提供商：

```typescript
export const defaultLLM: DefaultLLM = {
    provider: 'your-provider',
    model: 'your-model-name'
}
```

**方式二：自定义协议提供商**（WebSocket、私有协议等）

继承 `CustomProviderAdapter` 并注册：

```typescript
// 新建 uni_modules/uni-ai-x-yourprovider/index.uts
import { CustomProviderAdapter, RequestAiCoMessage, CustomProviderCallbacks } from '@/uni_modules/uni-ai-x/types.uts'
import { registerCustomProvider } from '@/uni_modules/uni-ai-x/sdk'

class YourProviderAdapter extends CustomProviderAdapter {
    supportsTitleUpdate = false

    async request(
        messages: RequestAiCoMessage[],
        model: string,
        chat_id: string,
        callbacks: CustomProviderCallbacks
    ): Promise<boolean> {
        // 实现你的请求逻辑
        // 通过 callbacks.onChunk / onDone / onError 上报结果
        return true
    }
}

// 在 App.uvue 的 onLaunch 中调用
export function installYourProvider() {
    registerCustomProvider('your-provider', new YourProviderAdapter())
}
```

参考实现：`uni_modules/uni-ai-x-openClaw/`

---

### 4.2 开启 / 关闭 Demo 演示模式

`uni_modules/uni-ai-x/sdk/testMarkdownText.uts` 第 104 行：

```typescript
// 关闭 Demo，使用真实 AI 请求：
testMarkdownText = ''

// 开启 Demo（默认）：保持字符串非空即可
```

Demo 模式下所有发送操作均为本地流式回放，不消耗 Token，适合开发调试 Markdown 渲染效果。

---

### 4.3 添加新的 Markdown 块级元素渲染

1. 在 `uni-cmark` 原生插件层确认该 Token 类型已被解析输出（查看 `interface.uts` 中的 `MarkdownToken.type`）
2. 在 `uni_modules/uni-ai-x/components/uni-ai-md-node/uni-ai-md-node.uvue` 中添加对应的 `v-if` 分支或子组件引用
3. 如需行内节点，同步修改 `uni-ai-md-inline/uni-ai-md-inline.uvue`

---

### 4.4 调整 Markdown 解析间隔 / 性能参数

在 `uni_modules/uni-ai-x/sdk/requestAiRunner.uts` 顶部：

```typescript
const MARKDOWN_PARSE_INTERVAL = 120   // 解析节流间隔（毫秒），越大越流畅但延迟越高
const DEMO_STREAM_BATCH_SIZE = 10     // Demo 模式每次输出字符数
const DEMO_STREAM_INTERVAL = 100      // Demo 模式输出间隔（毫秒）
```

---

### 4.5 切换 UI 主题

主题通过 `uniAi.setting.theme` 控制（`'light'` / `'dark'` / `'auto'`），会自动持久化到 storage。

在 `uni_modules/uni-ai-x/static/css/variables.scss` 中可以修改各主题的颜色变量。

---

### 4.6 本地持久化说明

`StorageManager` 采用分 key 存储策略，避免单次 storage 读写数据量过大：

| Storage Key 模式 | 内容 |
|---|---|
| `uni-ai-chats` | 会话列表（不含消息，只有 id / title / update_time）|
| `uni-ai-chat-msg-ids_{chatId}` | 某会话的消息 ID 列表 |
| `uni-ai-chat-msg_{msgId}` | 单条消息完整内容（含 markdownElList）|
| `uni-ai-setting` | 用户设置（主题 / 语言 / 当前模型）|

---

### 4.7 扩展 Web 能力代理（KaTeX / Mermaid）

`proxy-web.uts` 通过隐藏 WebView（`pages/common/webview/webview.uvue`）在 App 端调用 Web 生态库。添加新能力步骤：

1. 在 `webview.uvue` 的页面 JS 中实现新的 `action` handler
2. 在 `proxy-web.uts` 中添加对应的调用方法
3. 在需要使用的 SDK 或组件中调用 `proxyWeb.callMethod({ action: 'yourAction', ... }, callback)`

---

## 五、已知注意事项与待办

| 类型 | 位置 | 说明 |
|---|---|---|
| ⚠️ 上线前确认 | `sdk/testMarkdownText.uts` | Demo 文本默认非空，正式发布前须清空以启用真实请求 |
| 🧹 可清理 | `pages/test-cmark/` | 已废弃的测试页面目录，未注册到 pages.json，建议删除 |
| 🔊 调试日志 | `App.uvue` | 生命周期 console.log 可在发布前删除 |
| 🔊 调试日志 | `uni-ai-x-openClaw/websocket-manager.uts` | 多处活跃 console.log，handleMessage 每条消息都打印，生产噪声较大 |
| 📋 TODO | `sdk/parseCode.uts:159` | uni-highlight 下个版本需传入上一次解析 state 以提升性能 |
| 🔧 接口不统一 | `uni-cmark/utssdk/app-ios/index.uts` | iOS 的 `md2json` 返回 `string`，其他平台返回 `ParseMdRes`，如统一可简化上层分支 |
