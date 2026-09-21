# uni-ai x 鸿蒙 libmark 接入设计

日期：2026-09-20
分支：feat/introduce-libmark
状态：设计已确认，待实施

## 1. 背景与目标

uni-ai x 当前全平台（Android/iOS/Web/微信小程序/鸿蒙）使用 `uni-cmark`（cmark-gfm）
在 Worker 中把 Markdown 转换为 HTML 与 AST，主线程轮询 snapshot 渲染。

本设计把**鸿蒙平台**的解析与渲染切换到 libmark（纯 C 流式
Markdown 库，本地仓库位于 `D:\dev\DOM2-dev\libmark`）：

- libmark 以增量事件（append/tail/commit/reset）交付结构化 AST（`libmark.ast/1`），
  公式以 SVG payload 内嵌，不再依赖 WebView
- 参考 `libmark/demo/uni-app-x` 的 AST 渲染实现（槽位表 + 拍平渲染行）
- **仅鸿蒙先行**：Android/iOS/Web/小程序保持 cmark 链路不变，接口按可扩展设计

约束与范围外事项：

- mermaid：libmark 尚未提供 flowchart 插件，继续使用 proxyWeb（WebView）渲染
- 代码高亮：继续使用 proxyWeb 的 `highlightCodeLines`
- 历史消息：`markdownAst` 存在 cmark/libmark 两种 schema，按 schema 分派解析
- 通信：**要求无序列化**（不使用 JSON 字符串快照协议）

## 2. 已确认决策

| 决策点 | 结论 |
| --- | --- |
| 平台范围 | 仅鸿蒙切换 libmark，其他平台保持 cmark，条件编译隔离 |
| 解析位置 | Worker 内调用 libmark（复用现有 Worker 基础设施） |
| 数据流 | Worker → 主线程改为**增量 ops**（非全量 snapshot） |
| 通信方式 | 无序列化：主线程创建共享 Sendable 队列，Worker 写入，轻量通知读取 |
| 渲染接入 | 适配到现有 `MarkdownTextRenderBlock` 模型，UI 组件基本不动 |
| 数学公式 | libmark 原生 SVG（AST payload）；受控降级时显示源码（复用现有源码模式） |
| mermaid | 继续 proxyWeb 渲染；libmark 下识别为 `code_block(info=mermaid)` |
| 代码高亮 | 继续 proxyWeb `highlightCodeLines`，输入 libmark `code_block.literal` |
| 表格 | libmark AST table → 生成 HTML → 复用现有表格组件与列宽测量 |
| 旧消息 | 双 schema 共存，按 `schema` 识别分派；cmark 解析器因其他平台保留 |
| preprocessor | 鸿蒙分支停用（math/mermaid 标记不再需要）；其他平台保留 |

## 3. 总体架构

```
鸿蒙（新链路）
主线程 SSE 增量
  → uni-ai-worker-runtime 发送 Sendable chunk 给 Worker（无序列化）
  → Worker 内 libmark session：createSession('ast') / feedChunk / finishSession
      → ops {op, kind:'ast', content, index} // append/tail/commit/reset
  → Worker 把 ops 写入共享 Sendable 队列，发轻量通知
  → 主线程 LibmarkStreamAdapter：槽位表 + 增量拍平 → MarkdownTextRenderBlock[]
  → 完成时拼完整 AST 写入 msg.markdownAst（持久化）
  → 现有 UI 组件渲染（uni-ai-md-text / msg-code / msg-html-table / msg-math）

其他平台（不变）
主线程 SSE → Worker(cmark) → snapshot(html+ast) → 现有渲染路径
```

## 4. 通信层：无序列化 Sendable 队列

### 4.1 预研结论（2026-09-18 鸿蒙真机验证）

**Worker 侧创建 Sendable（路径 B）不可行，属于 uni-app x 工具链限制，而非
HarmonyOS 限制**：

- Worker 编译时，深路径导入的 `.uts` 文件会被**内联**（cmark 即如此：
  Worker 产物中直接内联其 JS 函数，仅保留 `import cmark from 'libcmark.so'`）
- `.ets`（ArkTS 原生 Sendable 类文件）**不会被内联**，import 被原样保留为
  `../uni_modules/.../sendable`，而 hvigor 工程 `entry/src/main/ets/uni_modules/`
  下不存在该文件（插件实体在 ohpm 模块目录），ArkTS 报 `Cannot find module`
- 结论：Worker 无法引用插件的 `.ets`，也就无法 `new` Sendable 实例；
  官方示例 `uts-worker-sendable-transfer` 同样只支持"主线程创建、Worker 读写"

**共享队列（路径 A）已验证可行**（真机日志）：

```
Worker:  [sendable-probe][A] notify sent: method-ok;scalar-mode-ok;scalar-seq-ok;
主线程:  [sendable-probe][main][A] notified | queueLength=9 count=9 mode=scalar seq=7
```

证明：主线程创建含 `collections.Array` 的 `@Sendable` 容器并
`postMessage(queue, { harmonySendable: true })` → Worker 通过 ESObject
动态调用容器方法、写标量字段 → 主线程读取到 Worker 写入后的状态，全程无序列化。

### 4.2 队列协议设计

- 主线程（`uni-ai-worker-runtime` 插件）为每个请求创建一个 `LibmarkOpQueue`
  （`@Sendable`，定义在插件 `utssdk/sendable.ets`）：
  - `ops: collections.Array<LibmarkOpData>`：预分配固定槽位（如 64 个）
  - `count: number`：本次写入的有效 op 数
  - `seq: number`：批次序号，用于主线程判断是否有新数据
  - Sendable 类方法封装所有集合操作（`pushOp`/`clear`/`read` 等）
- 主线程发送 chunk 同样用 Sendable 对象承载（`LibmarkChunk`，含 content、
  reasoningContent、requestVersion）
- Worker：`feedChunk` 产出 ops → 写入共享队列（方法调用）→ 更新 `seq` →
  `postMessage` 轻量通知（普通对象，仅控制信号）
- 主线程：收到通知后读取队列（`seq`/`count`/逐条读 op）并 `clear`；
  读取顺序与写入一致（单生产者单消费者）
- 每次批次的写入长度有限（槽位容量），超出时分批

### 4.3 工具链避坑清单（实施必须遵守）

1. Worker 里禁止集合索引访问（`items[0]` 触发 `arkts-no-any-unknown`），
   集合读写必须封装为 Sendable 类方法
2. UTS→ArkTS 编译器缺陷：连续的 ESObject 动态语句会被拼接成非法代码
   （`x.m = 'a'(x as ESObject).n = 1`），每条动态操作需用普通语句或独立
   try 块隔开
3. `uni.createWorker` 参数必须是字符串字面量
4. Worker 不触发插件收集：新插件必须被已引用插件的 `uni_modules.dependencies`
   声明，且入口需引用相关文件（`.ets` 才会进入产物）
5. 插件内自定义 `WorkerPostMessageOptions` 类型（同官方示例）
6. Worker 的 `onMessage` 参数用 `ESObject`（`Object as ESObject` 会触发 any 错误）

### 4.4 遗留优化项

见项目 README「遗留事项」：待 uni-app x 工具链支持 Worker 引用插件 `.ets`
后，可切换到 Worker 侧创建 Sendable 直接发送（路径 B），简化队列协议。

## 5. Worker 侧改造

- `workers/aiRequestWorkerTask.uts`（`#ifdef APP-HARMONY` 分支）：
  - `start-markdown`：创建 libmark session（`createSession('ast')`），
    创建/关联共享队列
  - `append-markdown`：`feedChunk`，产出 ops 写入共享队列
  - `complete-markdown`：`finishSession` 收尾 ops，随后可销毁 session
  - `cancel`：立即 `destroySession`，`requestVersion` 过滤滞后消息
  - 错误：libmark status/异常编码后经通知回传，走现有错误 UI
- Worker 内不引入 `MarkdownPreprocessor`（鸿蒙分支）；其他平台分支不动
- ops 语义：`1=append`、`2=tail`（未闭合块整块快照，覆盖槽位）、
  `3=commit`、`4=reset`（清空重放）

## 6. 渲染适配层

新增 `uni-ai-worker/utssdk/libmark-ast.uts`：

- 解析 ops 的 `content`（`{"schema":"libmark.ast/1","blocks":[...]}`），按
  `index` 维护槽位表；RESET 清空；tail/commit 覆盖对应槽位
- 槽位变化时增量拍平/转换为现有 `MarkdownTextRenderBlock`：
  - `paragraph/heading` → 对应 kind，`runs` → spans（styles → className：
    strong/em/strikethrough；`kind=code` → code class；`link` → href；
    `image` → image span；`break` → `\n`）
  - `list/item` → 列表块（marker：任务项 `[x]/[ ]`、有序 `n.`、无序 `•`，
    indent 层级）
  - `block_quote` → quoteDepth+1
  - `thematic_break` → hr
  - `code_block` → `kind=code`（language=info、text=literal）；
    `info == 'mermaid'` → `kind=mermaid`
  - `table` → 按 `align` 生成 HTML → `prepareMarkdownTable` 计算列宽 →
    `kind=table`（复用现有组件）
  - `plugin_block`（math）→ `kind=math` + SVG payload（data/width/height）；
    无 payload → 源码模式
  - 行内 `plugin` run → 有 payload 转 image span（SVG data URI），
    无 payload 转等宽源码 span
  - `html_block` → 纯文本（安全模式省略提示）
- 对外接口：`applyOps(ops)`、`getBlocks()`、`getCompleteAstJson()`（完成时
  拼接完整 `libmark.ast/1` 文档用于持久化）

## 7. UI 侧改动

- `uni-ai-chat.uvue` 的 `getMarkdownBlocks`：按 schema 分派——
  libmark AST（新）→ cmark AST（旧/其他平台）→ HTML 兜底
- 流式期间：ops 到达后适配层更新槽位并产出 blocks，经消息字段/缓存驱动
  `renderItemList` 重算（不再每 300ms 全量重建）
- `uni-ai-msg-math.uvue`：增加「libmark SVG 直显」分支（块公式 payload），
  保留源码模式用于降级；行内公式作为 image span 随文本流渲染
- `uni-ai-msg-code.uvue`、`uni-ai-msg-html-table.uvue`、`uni-ai-md-text.uvue`：
  不改（数据由适配层保证与现有模型一致）
- 消息持久化：鸿蒙完成态把完整 libmark AST 写入 `markdownAst`；
  `markdownHtml` 新消息留空（HTML 兜底只在其他平台/旧消息中使用）

## 8. 构建与集成

- 移植 `uni_modules/libmark` UTS 插件（来自 libmark demo）：
  - `utssdk/interface.uts`（ops 类型/常量）
  - `utssdk/index.uts`（跨平台入口，鸿蒙实现）
  - `utssdk/app-harmony/index.uts`（createSession/feedChunk/finishSession/destroySession）
  - `utssdk/sendable.ets`（队列/chunk 的 `@Sendable` 类 + 集合方法）
  - `utssdk/app-harmony/libs/libmark.har`（构建产物，不入库）
  - `package.json`（dcloudext.type = uts）
- 在 `uni-ai-x` 或 `uni-ai-worker-runtime` 的 `uni_modules.dependencies` 中声明
  libmark 插件
- HAR 产物准备流程参考 libmark demo 的 `native/prepare-lib.ps1` +
  `native/build-harmony.ps1`，在 libmark 仓库构建后拷入
- 非鸿蒙平台：插件空实现 / `isSupported()` 返回 false

## 9. 兼容与降级

- 旧消息与其他平台：cmark 解析器与 HTML 兜底完整保留，零行为变化
- 公式降级：libmark 无 payload 时显示源码（复用现有 `uni-ai-msg-math`
  源码模式）；不调用 proxyWeb 兜底
- mermaid 流式未闭合：由 tail/commit 状态判断 `isComplete`，不再依赖
  preprocessor 的 `mermaid-pending`
- 主题：libmark math SVG 使用 `currentColor`，深色模式显示效果需在验证阶段
  重点确认（风险项）

## 10. 验证方案

1. 编译验证：HBuilderX 5.32 编译 app-harmony 通过
2. Worker 内加载 libmark 桥接（create/feed/finish 闭环）——在正式改造前先做；
   该结论与预研共享（cmark 同形态，风险中低）
3. 鸿蒙真机场景对齐（对 libmark demo 的 12 个场景）：
   完整 Markdown、标题、列表、表格、引用、代码、链接、公式、流程图、
   分割线、长文本、混合
4. 边界：中止/错误、切换会话、历史消息混排（旧 cmark + 新 libmark）、
   深浅主题切换、长文档流式性能
5. 回归：其他平台（至少 Web/Android）行为不变

## 11. 风险与待验证项

| 风险 | 说明 | 应对 |
| --- | --- | --- |
| Worker 内加载 libmark 桥接 | 与 cmark 同形态，但 NEEDED 依赖 libmark-full.so | 实施前编译+设备验证 |
| libmark SVG 深色主题 | `currentColor` 在 image 显示下的解析 | 验证阶段实测，必要时后处理 |
| 行内公式 baseline | payload 有 baseline，demo 未做对齐 | 实施时按 baseline 调整或记录差距 |
| math 覆盖率 | MathJax 子集，超出范围降级源码 | 接受降级，记录表现 |
| 表格列宽一致性 | AST→HTML 与 cmark HTML 的测量差异 | 复用 prepareMarkdownTable 验证 |
| ops 高频写入 | tail 事件在长文档流式时频繁 | 队列分批 + 只重拍变化槽位 |
| 历史消息 schema 分派 | 两套 AST 格式并存 | 按 schema 字段识别，双解析器 |

## 12. 实施顺序（概要）

0. 前置验证：Worker 内 libmark 桥接闭环（编译 + 设备）
1. 插件引入：`uni_modules/libmark` + Sendable 队列 + 依赖声明
2. Worker 改造：libmark session + ops 写入队列 + 通知
3. 主线程管道：runtime 消费通知/队列 → 适配层（槽位/增量拍平/转换）
4. UI 接入：schema 分派、math SVG 分支、持久化
5. 回归：旧消息/其他平台/取消与错误
6. 场景验证与性能观测
