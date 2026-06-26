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
- 请求层：`sdk/requestAiWorker.uts` 负责真实模型请求、自定义 provider、开发期本地流式模拟、思考内容和正文分流。
- Markdown 解析：`sdk/parseMarkdownSimple.uts` 将流式文本节流解析为 Markdown AST，并补充代码高亮、表格宽度、数学公式和 Mermaid 渲染结果。
- Markdown 工具：`sdk/markdown-utils.uts` 放置数学公式预处理、表格宽度估算等纯函数，避免解析调度类继续膨胀。
- Markdown 渲染：`components/uni-ai-md-node` 渲染块级节点，`components/uni-ai-md-inline` 渲染行内节点，代码和表格分别交给专用组件。
- 聊天视图：`components/uni-ai-chat` 负责页面编排和滚动控制；顶部导航由 `uni-ai-chat-nav` 负责，用户消息气泡由 `uni-ai-user-msg` 负责，待发送图片由 `uni-ai-draft-images` 负责。
- Web 能力代理：`sdk/proxy-web.uts` 让 App 端通过隐藏 WebView 调用 Markdown、代码高亮、KaTeX、Mermaid 等 Web 生态能力。
- SSE 解析：`sdk/sse.uts` 只负责把流式接口返回的 chunk 文本解析为 `Chunk`、错误或完成事件。
- 本地持久化：`sdk/storage-manager.uts` 封装聊天列表、消息列表和消息内容的存取，并保留旧缓存迁移入口。

## 消息主链路

1. `uni-ai-chat` 调用 `uniAi.sendMsg()`。
2. `sdk/index.uts` 创建用户消息和 AI 占位消息，并启动 `RequestAiWorker`。
3. 开发期如果 `testMarkdownText` 非空，页面启动时会创建一条新的本地演示会话，`RequestAiWorker.streamDemoMarkdown()` 按固定间隔模拟流式输出；否则请求配置的模型 provider。
4. 每次正文变化调用 `ParseMarkdownSimple.runTask()`，结束时调用 `flush()`。
5. 解析结果通过 `setMarkdownElList` 回写当前 AI 消息。
6. `uni-ai-x-msg` 直接遍历 Markdown AST，并由 `uni-ai-md-node` 递归渲染。

## Markdown 渲染设计

- 列表不再拍平成普通节点：`list`/`tasklist` 保持父子结构，组件负责显示数字、圆点和任务标记。
- 列表 marker 与正文间距由组件样式控制，间距保持在约一个中文字宽以内，避免旧实现里固定宽度过大导致视觉断裂。
- 无序列表和任务列表 marker 使用 `uni-ai-icon` 承接历史 iconfont 字符，但不再通过 `treeToList` 往文本 token 中注入图标。
- 代码块渲染仍由 `uni-ai-msg-code` 负责，便于保留复制、换行、横向滚动等交互。
- 表格渲染由 `uni-ai-msg-table` 负责，组件内维护表格样式，符合蒸汽模式组件样式隔离。
- 数学公式和 Mermaid 在解析阶段生成可渲染结果，组件只消费 `html`、`href`、宽高等字段。

## 开发期本地 Markdown

`uni_modules/uni-ai-x/sdk/testMarkdownText.uts` 默认保留示例内容。这样启动项目就能走完整的“提问 -> 流式输出 -> Markdown 解析 -> 组件渲染”流程，不需要请求网络。需要切换真实请求时，再手动清空该文件中的测试文本。

## 当前复杂度检查结论

- 可删除：历史性能测试截图和日志不应作为源码长期提交，已经从 Git 跟踪中移除，后续只保留在历史记录或本地调试目录。
- 可简化：请求层已将开发期本地流式逻辑独立为 `streamDemoMarkdown()`，避免和真实请求混在一起。
- 可简化：代码高亮端的 grammar 映射已收敛为 `grammarMap`，避免新增语言时同时维护两份结构。
- 已优化：`parseMarkdownSimple.uts` 不再直接承载数学预处理和表格宽度估算，相关逻辑移动到 `markdown-utils.uts`。
- 已优化：开发期本地演示会话会在启动时自动重跑，便于每次验证都覆盖“流式输出 -> Markdown 解析 -> 组件渲染”全链路。
- 已优化：请求层类型命名去掉历史 `Bailian` 残留，统一使用 `RequestAiServerOptions` 等通用名称。
- 已优化：常规流式解析日志已收敛，避免开源使用者调试时被内部性能日志干扰。
- 已优化：SSE chunk 解析从 `requestAiWorker.uts` 拆到 `sse.uts`，请求 Worker 更聚焦于请求生命周期和消息状态。
- 已优化：`uni-ai-chat.uvue` 已拆出用户消息和待发送图片组件，聊天页减少一百多行样式和图片预览/删除细节。
- 已优化：聊天顶部导航拆为 `uni-ai-chat-nav`，标题计算和小程序导航适配不再堆在聊天主页面。
- 已优化：输入工具栏不再维护独立输入副本，改为通过 computed 直接读写当前会话的 `inputContent`。
- 已优化：图片选择、上传、进度和临时 URL 回写已从输入工具栏拆到 `sdk/image-upload.uts`，工具栏只负责触发动作。
- 可优化：`uni-ai-chat.uvue` 仍承担较多滚动和输入区编排逻辑，后续可继续拆为 `chat-scroll`、`chat-input` 等子组件。

## 验证方式

修改后应从项目根目录运行 Android：

```sh
/Applications/HBuilderX-Dev.app/Contents/MacOS/cli launch app-android --project /Users/json/Desktop/code/uni-ai-x --ui true
```

随后用 ADB 短轮询前台窗口和 logcat，避免长时间等待。
