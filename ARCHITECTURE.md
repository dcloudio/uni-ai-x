# uni-ai-x 架构说明

本文面向二次开发者，说明当前蒸汽模式版本的代码组织、主要功能与实现链路。项目已经移除非蒸汽模式下为性能做的视图拍平和触摸暂停渲染逻辑，优先保持 Vue 组件结构直观。

## 设计目标

- 以 Vue 常规组件树表达界面，避免逻辑层拼接完整视图结构。
- 开发期默认使用本地 `testMarkdownText.uts` 模拟流式回答，减少网络请求和调试成本。
- 组件样式按 uni-app x 蒸汽模式样式隔离 2.0 编写，组件内部自带必要样式，不依赖页面穿透覆盖。
- App 端 CSS 避免使用不支持的简写属性，例如文本修饰使用 `text-decoration-line`，不使用 `text-decoration`。
- SDK 只负责状态、请求、解析调度；Markdown 节点怎么展示交给组件。

## 功能组成

- 聊天会话：`sdk/index.uts` 管理会话、消息、输入内容、存储同步和发送流程。
- 请求层：`sdk/requestAiRunner.uts` 负责请求生命周期编排；开发期本地流、远程请求、自定义 provider、chunk 绑定等逻辑以直接方法调用串联，不再保留历史伪 Worker 消息转发。
- Markdown 解析：`sdk/parseMarkdown.uts` 将流式文本节流解析为 Markdown AST，并补充代码高亮、表格宽度、数学公式和 Mermaid 渲染结果。
- Markdown 工具：`sdk/markdown-utils.uts` 放置数学公式预处理、表格宽度估算等纯函数，避免解析调度类继续膨胀。
- Markdown 渲染：`sdk/markdown-render-blocks.uts` 将 Markdown AST 分组成可组合块，`uni-ai-md-renderer` 按块分发；简单正文使用 RichText，复杂块由原生组件提供滚动、工具栏、状态和图片能力。
- 聊天视图：`components/uni-ai-chat` 负责页面编排和滚动控制；顶部导航由 `uni-ai-chat-nav` 负责，用户消息气泡由 `uni-ai-user-msg` 负责，待发送图片由 `uni-ai-draft-images` 负责。
- Web 能力代理：`sdk/proxy-web.uts` 让 App 端通过隐藏 WebView 调用 Markdown、代码高亮、KaTeX、Mermaid 等 Web 生态能力。
- SSE 解析：`sdk/sse.uts` 只负责把流式接口返回的 chunk 文本解析为 `Chunk`、错误或完成事件。
- 消息转换：`sdk/message-builder.uts` 将会话消息转换为模型请求消息，集中处理图片多模态内容。
- 模型能力：`sdk/model-capabilities.uts` 扫描配置中的模型能力，供输入工具栏展示深度思考、联网搜索和图片理解入口。
- 文字宽度：`sdk/text-width.uts` 提供统一的同步宽度估算，代码块和表格共用；uni-app x 也有 `createCanvasContextAsync` + `CanvasRenderingContext2D.measureText()`，但该能力依赖 canvas 生命周期，不适合放进流式 Markdown 解析主链路。
- 本地持久化：`sdk/storage-manager.uts` 封装聊天列表、消息列表和消息内容的存取，并保留旧缓存迁移入口。

## 消息主链路

1. `uni-ai-chat` 调用 `uniAi.sendMsg()`。
2. `sdk/index.uts` 创建用户消息和 AI 占位消息，并创建 `RequestAiRunner`。
3. 开发期如果 `testMarkdownText` 非空，页面启动时会创建一条新的本地演示会话，`RequestAiRunner.streamDemoMarkdown()` 按固定间隔模拟流式输出；否则请求配置的模型 provider。
4. 每次正文变化调用 `ParseMarkdown.runTask()`，结束时调用 `flush()`。
5. 解析结果通过 `onMarkdownElList` 回调直接回写当前 AI 消息。
6. `uni-ai-x-msg` 将 Markdown AST 交给 `uni-ai-md-renderer`，渲染器按块组合 RichText 与原生组件。

## Markdown 组合渲染设计

RichText 只承担文本内容排版，不承担滚动、工具栏、复制、选项卡、生成状态或图片生命周期。页面仍只消费一份 `MarkdownToken[]`，但展示层按 token 类型组合组件。

| Markdown 类型 | 内容渲染 | 原生外层与交互 |
| --- | --- | --- |
| 标题、段落、强调、删除线、行内代码、链接、普通 HTML | `uni-ai-md-rich-text` | 无 |
| 有序、无序、任务列表 | 递归 `uni-ai-md-renderer`，列表项正文仍是 RichText | 原生 marker 和列表布局，允许列表项中嵌套复杂块 |
| 引用 | 递归 `uni-ai-md-renderer` | 原生引用边框和背景，允许内部嵌套复杂块 |
| 表格 | 原生行列布局中的单元格 RichText | `uni-ai-msg-table` 用原生 `view` 负责表格布局和边框，外层横向 `scroll-view` 负责宽表滚动 |
| 普通代码块 | RichText `pre/code` nodes | `uni-ai-msg-code` 提供语言栏、复制按钮和横向 `scroll-view` |
| Mermaid 源码 | RichText `pre/code` nodes | `uni-ai-msg-code` 永久保留“流程图/代码”选项卡、复制按钮和生成状态 |
| Mermaid 图片 | 不使用 RichText，原生 `image` | 未生成时默认代码；用户强切流程图时显示“图片正在生成中”；图片到达后自动切图一次，之后尊重用户选择 |
| 数学公式源码 | RichText `pre/code` nodes | `katex-el` 提供横向 `scroll-view` |
| 数学公式图片 | 不使用 RichText，原生 `image` | `href` 到达后立即卸载源码 RichText，并支持图片预览 |
| 独占一段的图片 | 不使用 RichText，原生 `image` | 宽度约束和图片预览 |
| 分隔线 | 不使用 RichText | 原生 1px 分隔视图 |

- `sdk/markdown-render-blocks.uts` 是唯一的块分类入口；连续简单 token 会合并后交给一个 RichText，减少流式更新时的组件数量。
- `components/uni-ai-md-renderer` 使用显式 `v-if` 分发，并递归处理列表和引用，所以嵌套表格、代码、公式或 Mermaid 不会退回普通文本。
- `sdk/markdown-rich-text.uts` 负责生成 RichText nodes；代码和表格分别暴露内容级转换函数，由原生外壳调用。
- `components/uni-ai-msg-code` 不再逐行创建原生 `<text>`，语法高亮 span 全部属于同一个 RichText 内容树。
- `sdk/parseMarkdown.uts` 继续负责流式 AST、代码高亮、表格宽度估算和异步公式/Mermaid 图片生成，展示组件只根据 token 当前字段切换状态。

## 开发期本地 Markdown

`uni_modules/uni-ai-x/sdk/testMarkdownText.uts` 默认保留示例内容。这样启动项目就能走完整的“提问 -> 流式输出 -> Markdown 解析 -> 组件渲染”流程，不需要请求网络。需要切换真实请求时，再手动清空该文件中的测试文本。

## 当前复杂度检查结论

- 可删除：历史性能测试截图和日志不应作为源码长期提交，已经从 Git 跟踪中移除，后续只保留在历史记录或本地调试目录。
- 可简化：请求层已将开发期本地流式逻辑独立为 `streamDemoMarkdown()`，避免和真实请求混在一起。
- 可简化：代码高亮端的 grammar 映射已收敛为 `grammarMap`，避免新增语言时同时维护两份结构。
- 已优化：`parseMarkdown.uts` 不再直接承载数学预处理和表格宽度估算，相关逻辑移动到 `markdown-utils.uts`。
- 已优化：开发期本地演示会话会在启动时自动重跑，便于每次验证都覆盖“流式输出 -> Markdown 解析 -> 组件渲染”全链路。
- 已优化：请求层类型命名去掉历史 `Bailian` 残留，统一使用 `RequestAiServerOptions` 等通用名称。
- 已优化：常规流式解析日志已收敛，避免开源使用者调试时被内部性能日志干扰。
- 已优化：SSE chunk 解析从请求运行器拆到 `sse.uts`，请求层更聚焦于请求生命周期和消息状态。
- 已优化：`uni-ai-chat.uvue` 已拆出用户消息和待发送图片组件，聊天页减少一百多行样式和图片预览/删除细节。
- 已优化：聊天顶部导航拆为 `uni-ai-chat-nav`，标题计算和小程序导航适配不再堆在聊天主页面。
- 已优化：输入工具栏不再维护独立输入副本，改为通过 computed 直接读写当前会话的 `inputContent`。
- 已优化：图片选择、上传、进度和临时 URL 回写已从输入工具栏拆到 `sdk/image-upload.uts`，工具栏只负责触发动作。
- 已优化：聊天输入框也改为 computed 直接读写当前会话输入，移除本地副本和双向 watch 同步。
- 已优化：底部输入区拆为 `uni-ai-chat-input`，聊天主组件不再维护键盘高度、演示问题点击提示和输入区样式。
- 已优化：SDK 设置初始化、监听、Web 代理同步和本地保存拆为独立方法，构造函数只保留启动编排。
- 已优化：请求运行器的状态重置、错误处理和完成收尾拆为独立方法，主请求流程更接近“准备 -> 选择本地/真实请求 -> 绑定回调”。
- 已优化：会话消息到模型请求体的转换拆到 `message-builder.uts`，SDK 主类不再关心多模态结构拼装细节。
- 已优化：代码块组件移除未使用的 token 缓存，并将旧版本行宽计算改为每次按当前文本直接计算，避免增量状态残留。
- 已优化：输入工具栏的模型能力扫描拆到 `model-capabilities.uts`，组件不再在 setup 中遍历整份模型配置。
- 已优化：表格和代码块宽度统一走 `text-width.uts`，删除旧的隐藏 DOM 异步测量入口，避免不同端宽度策略不一致。
- 已优化：输入工具栏对异常 provider 增加兜底，不再在弹窗提示后继续强制解包导致潜在崩溃。
- 已优化：`requestAiRunner.uts` 删除历史伪 Worker 的 `postMessage/onMessage` 转发，改为 `start()` 和具名回调直接调用，并把远程请求、provider 配置、token 获取、请求成功处理、stream chunk 绑定拆成独立方法。
- 已优化：`parseCode.uts` 删除未使用的旧 grammar 文件读取逻辑，减少二开时对历史实现的误解。
- 已优化：`uni-ai-chat.uvue` 收敛滚动 timer 清理逻辑，保留当前滚动跟随行为但减少重复代码。
- 已优化：Markdown 展示层收敛为一条组合渲染链路；删除旧块级/行内自绘组件，代码和表格只保留“原生外壳 + RichText 内容”。
- 可优化：`uni-ai-chat.uvue` 仍承担较多滚动编排逻辑，后续若继续拆分，建议先补足 Android 截图和滚动回归验证。

## 验证方式

没有设备时可先执行 Android 仅编译：

```sh
/Applications/HBuilderX-Dev.app/Contents/MacOS/cli launch app-android --project /Users/json/Desktop/code/uni-ai-x --compile true
```

连接设备后再运行：

```sh
/Applications/HBuilderX-Dev.app/Contents/MacOS/cli launch app-android --project /Users/json/Desktop/code/uni-ai-x --ui true
```

随后用 ADB 短轮询前台窗口和 logcat，避免长时间等待。
