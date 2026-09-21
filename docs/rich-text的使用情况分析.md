# rich-text 组件使用情况与渲染颗粒度分析

分析日期：2026-09-21

分析对象：`origin/v3` 与 `origin/all-rich-text` 两个分支的 markdown 解析后渲染链路。

分析目标：确认 rich-text 组件在 markdown 渲染链路中的使用位置，以及用它渲染的内容如何划分颗粒度——连续的长内容是放在单一 rich-text 实例里，还是被切分，切分依据是什么。

说明：下文引用的文件行号对应各自分支对应工作区里的内容，两个分支行号不一致。

## 一、分析环境

| 分支 | 提交 | 子工作区路径 | 分析分支名 |
| --- | --- | --- | --- |
| `origin/v3` | c50fd22 | `D:\dev\.codex-worktrees\uni-ai-x\rich-text-granularity` | `analysis/rich-text-granularity` |
| `origin/all-rich-text` | d4748dc | `D:\dev\.codex-worktrees\uni-ai-x\all-rich-text-granularity` | `analysis/all-rich-text-granularity` |

两个分支的差异规模（`git diff --stat origin/v3..origin/all-rich-text`）：114 个文件、+3097/-3807 行，其中渲染相关的主要变化是删除了整条 Markdown AST/token 渲染通道。

## 二、链路总览（两分支共用部分）

流式阶段在 worker 里完成 markdown 解析，把解析结果写入消息对象，主线程组件再按块分发渲染：

```
markdown 源
  -> MarkdownPreprocessor
  -> cmark-gfm md2html
  -> prepareMarkdownHtml
  -> AI Worker 快照
  -> RequestAiRunner.onMarkdownHtml
  -> msg.markdownHtml
  -> 组件切块（buildMarkdown*Blocks）
  -> renderItemList 切成 list-item
  -> 各块组件渲染（rich-text / text / image / svg）
```

发送分发入口是 `uni-ai-x-msg.uvue`：表格交给 `uni-ai-msg-html-table`，代码与 mermaid 交给 `uni-ai-msg-code`，公式交给 `uni-ai-msg-math`，其余按分支不同交给 `uni-ai-md-text`（v3）或原生 rich-text（all-rich-text）。

---

## 三、origin/v3 分支的分析

### 3.1 渲染链路

worker 每个快照同时产出 html 和 ast 两份结果，组件侧 ast 优先、html 兜底：

```
markdown 源 -> preprocessor -> md2html + md2json -> snapshot{html, ast}
  -> msg.markdownHtml / msg.markdownAst            (workers/aiRequestWorkerTask.uts:241,265)
  -> getMarkdownBlocks                             (uni-ai-x/components/uni-ai-chat.uvue:148)
       ast 非空 -> buildMarkdownAstBlocks -> markdownRenderBlocksToTextBlocks
       ast 为空 -> buildMarkdownHtmlBlocks -> markdownHtmlBlocksToTextBlocks
  -> renderItemList 切成 list-item                  (uni-ai-x/components/uni-ai-chat.uvue:208)
```

### 3.2 rich-text 出现的位置

全仓只有三处真正的 rich-text 实例：

| 位置 | 承载内容 | 实例数 |
| --- | --- | --- |
| `uni_modules/uni-ai-x/components/uni-ai-msg-html-table/uni-ai-msg-html-table.uvue:6` | 一个表格（HTML 字符串） | 每表格 1 个 |
| `uni_modules/uni-ai-x/components/uni-ai-msg-code/uni-ai-msg-code.uvue:41` | 一个代码块 / mermaid 源码 | 每代码块 1 个 |
| `uni_modules/uni-ai-x/pages/select-text/select-text.uvue:3` | 整条消息纯文本（每行一个 text + br） | 选择文本页 1 个 |

`uni-ai-chat.uvue:203` 的注释即此约定：`isRichTextListBlock` 只对 table / code / mermaid 返回 true。

### 3.3 颗粒度：正文根本不进 rich-text

连续的长正文（段落、标题、列表、引用、分割线）不使用 rich-text 渲染，而是拆成两层：

1. 块级切分。`buildMarkdownAstBlocks`（`uni_modules/uni-ai-worker/utssdk/markdown-ast.uts:148`）遍历顶层节点，遇到 `table` / `code_block` 就 `flushRich` 切出去单独成块，其余节点只被攒成一个 `rich` 块。之后 `markdownRenderBlocksToTextBlocks`（`uni_modules/uni-ai-x/sdk/markdown-text.uts:520`）把它展开成逐个渲染块：`appendAstNode`（同文件 422 行）按 heading / paragraph / block_quote 子节点 / 列表每一项 / hr 各生成一个 `MarkdownTextRenderBlock`（列表项在 386 行）。一个块对应一个 `uni-ai-md-text` 组件实例。
2. 行内切分。每个块内部按 inline AST 拆成 span 数组（text / strong / em / del / code / link / image），`uni-ai-md-text.uvue:6-14` 用 `template v-for` 把每个 span 渲染成独立 `<text>`，图片则是独立 `<image>`。样式靠 class 叠加（`uni-ai-md-text-span-strong` 等），不是节点树嵌套。

list-item 的颗粒度再上一层：连续的正文块被合并进同一个 `AI_NORMAL` list-item（`normalParts` 攒批，`uni-ai-chat.uvue:231`），一旦遇到表格或代码块就 flush 并让该块独占一个 list-item（同文件 239 行）。消息在列表里的切分边界，就是"表格/代码围栏"的边界，而不是固定行数或字节数。

### 3.4 单个 rich-text 内部不再切分

每个 rich-text 实例内部是完整的一份内容，没有分片：

- 代码块：`codeChildren`（`uni_modules/uni-ai-worker/utssdk/markdown-rich-text.uts:332`）对外只返回一个外层 `span`，子节点是"每行的高亮 token span + 行间 `br`"。`markdownCodeTokenToRichTextNodes`（同文件 394 行）返回长度恒为 1 的数组，`codeContentNode` 包住全部行。3000 行代码即 1 个 rich-text，里面约 3000 个 `br` 加 N 个 token span。
- 表格：`markdownTableTokenToRichTextNodes` 同样返回单个 `table` 节点，thead / tbody / tr / th / td 全在一棵树里；AST 路径下则是 `prepareMarkdownTable` 生成 HTML 字符串直接给 `nodes`。
- 流式期间代码块靠宽度估算和 `codeLookaheadPadding` 预留空间（`uni-ai-msg-code.uvue:116`），块闭合时在 key 上加 `-c` 后缀并切换 itemType 强制 list-item 重建，规避 list-view 复用 item 时 props 更新丢失。

### 3.5 该分支的三点发现

- `markdownTokensToRichTextNodes`（`uni_modules/uni-ai-worker/utssdk/markdown-rich-text.uts:383`，整篇 markdown 转单个 rich-text）和 `tokenToNodes` 里的 heading / paragraph / list 分支都还在，但全仓已无调用方，只有 `markdownCodeTokenToRichTextNodes` 和 `markdownTableTokenToRichTextNodes` 被真正使用，前者还是经由 `uni-ai-x/sdk/markdown-rich-text.uts` 转发。这条整篇渲染路径属于遗留代码，与当前"按块拆分"的设计不一致。
- 代码组件把节点树先序列化成 HTML 字符串再交给 rich-text：`codeRichNodes` → `codeNodeHtml` → `codeRichHtml`（`uni-ai-msg-code.uvue:555`），多了一次序列化和解析，而 rich-text 本身接受节点数组。
- 长代码块是最脆的一环：单个 rich-text 承担全部行，没有按行数上限再切成多个实例的保护，节点数随代码长度线性增长，横向滚动容器高度按 `lines * 22 + 16` 静态估算。若要优化超长代码的稳定性，这里是唯一需要动的切分点；正文部分已经没有可切的 rich-text。

---

## 四、origin/all-rich-text 分支的分析

### 4.1 管线：AST 通道已被整体删除

```
markdown 源 -> MarkdownPreprocessor -> cmark md2html -> prepareMarkdownHtml -> 不可变 HTML 快照
  -> onMarkdownHtml -> msg.markdownHtml                     (workers/aiRequestWorkerTask.uts)
  -> buildMarkdownHtmlBlocks -> 切块                         (uni-ai-x/components/uni-ai-chat.uvue:119)
  -> renderItemList -> list-item                             (uni-ai-x/components/uni-ai-chat.uvue:171)
  -> 各块组件 -> 原生 rich-text
```

`ARCHITECTURE.md:15` 明确写了 "It does not transport, store, or render Markdown AST/token JSON"。证据链：

- worker 删除了 `md2json` 调用，只保留 `md2html`（`workers/aiRequestWorkerTask.uts`），快照里不再有 `ast` / `astLength` 字段。
- `uni_modules/uni-ai-worker/utssdk/markdown-ast.uts` 内容被清空删除，`uni_modules/uni-ai-x/sdk/markdown-text.uts` 删除，`uni-ai-md-text.uvue` 删除。
- `MsgItem` 只剩 `markdownHtml`，存储迁移里的 `markdownAst` 字段处理也一并删除（`sdk/storage-manager.uts`）。
- worker 快照调度从 `contentDelta || reasoningDelta` 收紧为仅 `contentDelta`，纯思考阶段不再发 html 快照。

### 4.2 rich-text 出现的位置

| 位置 | 承载内容 | 实例数 |
| --- | --- | --- |
| `uni-ai-x-msg.uvue:25` | `kind == 'rich'` 的正文 HTML | 每块 1 个（相对 v3 为新增，v3 这里由纯 text/image 拼装） |
| `uni-ai-msg-quote.uvue:5` | 引用块内部 HTML | 每引用块 1 个（新增组件） |
| `uni-ai-msg-html-table.uvue:6` | 一个表格 | 每表格 1 个 |
| `uni-ai-msg-code.uvue:36,41` | 一个代码块 / mermaid 源码 | 每代码块 1 个 |
| `uni-ai-msg-math.uvue:9` | 公式源码视图 | 每公式 1 个（新增） |
| `select-text.uvue:3` | 整条消息纯文本（一个大 `<p>` + `<br/>`） | 选择文本页 1 个 |
| `uni-ai-md-rich-text.uvue:12` | 组件内自行切块再分发 | 无调用方，见 4.7 |

### 4.3 颗粒度：正文按"顶层段落"切，每段一个 rich-text 实例

切分全部发生在 `buildMarkdownHtmlBlocks`（`uni_modules/uni-ai-worker/utssdk/markdown-html.uts:775`）。它先把 `<table>`、`<blockquote>`、`<pre>` 三类切成专用块，其余普通 HTML 交给 `contentBlocks`（同文件 611 行），后者靠 `isTopLevelParagraph`（同文件 590 行）判断段落是否被其他标签包裹，**在顶层 `<p>` 的起止处切割**。

验证方式：把 `contentBlocks` / `isTopLevelParagraph` / `findOpenTag` 的逻辑等价移植到临时 node 脚本执行（未改动仓库文件），输入输出如下：

```
"<p>a</p>\n<p>b</p>\n"
  -> ["<p>a</p>", "\n", "<p>b</p>", "\n"]
"<h1>T</h1>\n<p>a</p>\n<p>b</p>\n"
  -> ["<h1>T</h1>\n", "<p>a</p>", "\n", "<p>b</p>", "\n"]
"<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n"
  -> ["<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n"]        // 整体不切
"<p>a</p>\n<ul>\n<li>b</li>\n</ul>\n"
  -> ["<p>a</p>", "\n<ul>\n<li>b</li>\n</ul>\n"]
"<h2>x</h2>\n<ul><li>a</li></ul>\n<h3>y</h3>\n"
  -> ["<h2>x</h2>\n<ul><li>a</li></ul>\n<h3>y</h3>\n"]  // 无顶层 p，合并成一个
```

由此得到四条规则：

1. **每个顶层段落 = 一个 rich 块 = 一个 rich-text 实例**。切分颗粒度是"段落级"，与段落长短无关，一段几千字也不会再切。
2. **段落之间的换行空白本身也会成为一个 rich 块**（内容就是一个 `\n`），同样占一个实例和 list-item。cmark 的 HTML 在每个块级标签后输出 `\n`，而 `contentBlocks` 只对"整段全是空白"的输入才降级成 `text` 块，因此这些夹缝空白都落在 `rich` 上。
3. **列表、标题、分割线、图片等非段落顶层元素不会被逐一拆开**：连续的它们会合并成一个 rich 块；含 `<li><p>` 的列表因为 `<p>` 不是顶层，整份列表保持为一个块。
4. 表格、引用、代码、公式另走组件；引用块内部即使有多个 `<p>` 也不再切分，整段引用是一个 rich-text。

list-item 这一层同样是"一个原生 rich-text 一个 item"：`isRichTextListBlock`（`uni-ai-chat.uvue:163`）对 `rich` / `table` / `quote` / `code` / `mermaid` / `math` 全返回 true，注释写明 "a list item never contains multiple native rich-text renderers"；只有 think / error / plain / text 这些无原生富文本的部分会攒进同一个普通 item（`appendRichTextBlock`，同文件 202 行）。

### 4.4 为什么这么切：性能报告给出的约束

仓库内 `RICH_TEXT_PERFORMANCE_REPORT.md` 的实测结论：持续更新同一个原生 rich-text 的 nodes 会触发全量位图快照。

| 对照场景（各 5 秒，同尺寸 Rich Text） | FPS | 最大帧间隔 | `>32ms` 帧次数 |
| --- | ---: | ---: | ---: |
| nodes 固定，每 100ms 追加兄弟 View | 114.4 | 24.9ms | 0 |
| 每 100ms 更新同一 Rich Text nodes | 54.3 | 74.7ms | 51 |

更新阶段的 4.57 秒内 RGBA→Bitmap 拷贝累计约 625MB，`BuildTileSnapshotList` 累计约 444.54ms，单次快照最高 11.17ms。

按段落切成独立实例后，流式期间只有正在增长的最后一段会改 nodes，历史段落 html 字符串不变，配合 `markdownBlockCache`（`uni-ai-chat.uvue:90`，按 html + complete 命中）即可避免重建。这是该分支 "fix: 修复流式代码高亮和段落渲染抖动" 的落点。

代价：一条 N 段的回复会生成约 2N 个 list-item，每个 item 一个原生 rich-text 实例（其中包含大量只含一个换行的空实例）。

### 4.5 单个实例内部仍然不切分

- 代码块：`markdownCodeTokenToRichTextNodes`（`uni-ai-worker/utssdk/markdown-rich-text.uts:394`）仍返回长度恒为 1 的数组（外层一个 `span`，子节点是每行 token span + 行间 `<br>`），3000 行代码也只有一个 rich-text。与 v3 的区别是这里直接把 nodes 交给 rich-text（`codeRichNodes`，`uni-ai-msg-code.uvue:469`），不再先序列化成 HTML 字符串。
- 新增 `sdk/streaming-code-tokens.uts` 与 `tests/streaming-code-tokens.test.mjs`：用已高亮 token 前缀拼接未高亮后缀，流式期间保持整块 nodes 稳定，避免每帧重算全量高亮（`uni-ai-msg-code.uvue:461`）。
- 表格、引用、公式源码都是把 HTML 字符串直接给 `:nodes`，由 rich-text 自己解析。

### 4.6 该分支的注意点

- `uni-ai-md-rich-text.uvue` 内部逻辑（`buildMarkdownHtmlBlocks` + 分发 + rich-text）与 `uni-ai-x-msg` 实际走的链路几乎一致，但全仓没有任何页面或组件引用它，只有 `ARCHITECTURE.md` 把它写成主链路组件。实际生效的是 `uni-ai-chat` → `uni-ai-x-msg`，读文档容易被误导。
- `markdownTokensToRichTextNodes`、`markdownBlockquoteTokenToRichTextNodes`、`markdownTableTokenToRichTextNodes` 在本分支已无调用方（表格与引用改走 HTML），只剩 `markdownCodeTokenToRichTextNodes` 被代码块和公式源码使用。
- worker 快照只在 `contentDelta` 时调度，若后续要让思考内容也走富文本渲染，需要同步改回 `contentDelta || reasoningDelta`。

---

## 五、列表项与带 checkbox 文字的渲染

列表是一处两分支机制差异最大的内容：v3 在 JS 侧生成项目符号文本，all-rich-text 交给原生 rich-text 渲染列表标签，复选框在两边的最终形态也完全不同。

### 5.1 origin/v3：列表项拆成独立文本块，标记是纯文本字符

项目符号由 JS 生成文本标记。`appendListNode`（`uni_modules/uni-ai-x/sdk/markdown-text.uts:386`）为列表的每个 item 生成一个 `MarkdownTextRenderBlock`，标记文本来自 `listMarker`（同文件 340 行）：

- 无序列表 → `'• '`
- 有序列表 → `(list.start ?? 1) + index` 加 `'. '`
- 任务项 → `'☑ '` 或 `'☐ '`

标记作为 `block.marker` 传给 `uni-ai-md-text`，渲染成左侧一个固定宽度的独立 `<text>`（`.uni-ai-md-text-marker { width:20px; flex-shrink:0 }`），右侧是 inline span 的 flex 容器（`uni_modules/uni-ai-x/components/uni-ai-md-text.uvue:5-16`）。单个列表项的结构大致是：

```
<view class="uni-ai-md-text-block" style="margin-left:0px">   // indent * 18px
  <text class="uni-ai-md-text-marker">☑ </text>
  <view class="uni-ai-md-text-content"><text class="uni-ai-md-text-span">完成设计</text></view>
</view>
```

嵌套靠 `appendListNode` 递归时 `indent + 1`，视觉缩进为 `margin-left: indent * 18px`，层级之间没有不同符号区分。整条路径没有任何 rich-text 参与，列表项与相邻段落一起被攒进同一个 `AI_NORMAL` list-item。

复选框的勾选状态来自 AST 布尔值：v3 的 md2json 在 C 侧对任务项输出 `"tasklist":true,"checked":true|false`（`uni_modules/uni-cmark/native/md2html.c:298-303`，由 `json_buffer_put_bool` 输出真布尔值），`isTaskItem`（`uni_modules/uni-ai-x/sdk/markdown-text.uts:336`）据此判定，`listMarker` 取 `item.checked == true`。所以勾选框是纯文本字符，不是控件，也没有点击行为。

两个实现细节：

- 松散列表项（一个 item 含多个 paragraph）会对每个 paragraph 各调一次 `appendInlineBlock`，传入同一个 marker，标记在每个段落前重复出现。
- 有序列表序号渲染在 20px 固定宽度的栏里，两位数以上序号（如 `10. `）会偏挤。

HTML 兜底路径的表现完全不同。当 `markdownAst` 为空时走 `htmlToPlainText`（`uni_modules/uni-ai-x/sdk/markdown-text.uts:73`）：所有 `<li...>` 统一替换成 `'• '`，`</li>` 换成换行，其余标签整体剥离。结果是序号列表退化为圆点、嵌套缩进丢失、复选框丢失（此时它已被替换为 `<img>`，被标签剥离规则吃掉），同一条消息里的所有列表项合成一个文本块。

此外 `uni_modules/uni-ai-worker/utssdk/markdown-rich-text.uts:148-178` 中那套用 `'▣' / '□'` span 拼接 ul/ol/li 的实现，在 v3 同样已无调用方，只有 `normalizeTaskMarkers` 会清理它写下的历史数据。

### 5.2 origin/all-rich-text：整个列表交给一个 rich-text，复选框是内联 PNG

列表完全不参与正文的文本拆分：`<ul>` / `<ol>` / `<li>` 原样保留在 HTML 中（含嵌套列表），`contentBlocks` 只在顶层 `<p>` 处切割，而 `<li>` 内的 `<p>` 不算顶层，因此整个列表落在一个 rich 块中，由一个原生 rich-text 实例渲染。

- 项目符号与序号由原生 rich-text 渲染 `<ul>` / `<ol>` 得到，代码中没有任何标记文本注入。
- 缩进与行高来自 `prepareRichMarkdownHtml`（`uni_modules/uni-ai-worker/utssdk/markdown-html.uts:428`）注入的样式：`ul` / `ol` 为 `margin:4px 0;padding-left:24px`，`li` 为 `margin:2px 0;line-height:26px`；`<ol start="3">` 之类的属性天然生效。

复选框走图片替换链路，全部在 worker 的 HTML 预处理里完成：

1. `replaceTaskInputs`（`uni_modules/uni-ai-worker/utssdk/markdown-html.uts:229`）把 cmark 输出的 `<input type="checkbox" checked="">` 换成内联图片节点：

```
<img data-uni-ai-task="1" data-uni-ai-task-checked="1"
     src="data:image/png;base64,..." width="16" height="16"
     style="width:16px;height:16px;vertical-align:middle;" />&nbsp;
```

选中与未选中是两张 32x32 的 base64 PNG（同文件 15-16 行），按 16px 显示。

2. `styleTaskListItems`（同文件 375 行）给含任务项的 `<li>` 追加 `list-style-type:none`，避免原生圆点与图片重复；`normalizeTaskItemHtml` 去掉松散任务项的外层 `<p>`，让图片与文字保持同一行，同时保留嵌套列表块。
3. `normalizeTaskImages` 重写已有 task 图片的属性；`normalizeTaskMarkers`（同文件 281 行）兼容旧版 token 渲染留下的 `<span data-uni-ai-task="1">▣ / ☑</span>`，同样转成图片。

这段 task 预处理代码两分支完全一致（`git diff origin/v3..origin/all-rich-text -- uni_modules/uni-ai-worker/utssdk/markdown-html.uts` 在 219-430 行区间无改动），差别在于 v3 不会把列表 HTML 交给 rich-text，因此这段处理的成果在 v3 只作用于表格、代码块与兜底文本路径。

最终形态：

```
<li class="task-list-item" style="margin:2px 0;line-height:26px;list-style-type:none;margin:2px 0;line-height:26px;">
  <img data-uni-ai-task="1" data-uni-ai-task-checked="1" src="data:image/png;base64,..." ...>&nbsp;完成设计
</li>
```

### 5.3 列表渲染对比

| 维度 | origin/v3 | origin/all-rich-text |
| --- | --- | --- |
| 渲染单元 | 每个列表项一个 `uni-ai-md-text` | 整个列表一个 rich-text 实例 |
| 项目符号 | JS 生成 `'• '` / `'N. '` 文本，固定 20px 栏 | 原生 rich-text 渲染 `<ul>` / `<ol>` |
| 嵌套缩进 | `margin-left: 18px × depth` | `ul` / `ol` 的 `padding-left:24px` |
| 复选框标记 | `'☑ '` / `'☐ '` 文本字符 | 16x16 内联 PNG 图片 |
| 勾选状态来源 | md2json 的 `checked` 布尔值 | cmark HTML 的 `<input checked>` |
| 可点击性 | 纯文本，无交互 | `<img>` 会进 `@itemclick`，点击勾选框可能触发 `uni.previewImage` |
| 松散项多段 | marker 在每个段落前重复 | 外层 `<p>` 被移除，标记只出现一次 |
| AST / html 双路 | 兜底路径退化为 `'• '` 前缀纯文本，序号、嵌套、复选框全部丢失 | 只有 html 一条路，不存在该退化 |

---

## 六、两分支对比

| 维度 | origin/v3 | origin/all-rich-text |
| --- | --- | --- |
| 数据源 | ast 优先，html 兜底 | 仅 html |
| 正文渲染者 | `uni-ai-md-text`，`<text>` / `<image>` 拼装 | 原生 rich-text |
| 正文切分单位 | 块级 AST 节点（标题 / 段落 / 列表项 / 引用各一块），再拆 inline span | 顶层 `<p>` 段落；连续的标题 / 列表合并为一块 |
| 段落之间的空白 | 无独立实例（span 拼接在块内） | 独立 rich 块，占一个实例和 list-item |
| 长代码块 | 单实例，内部按行 span + br | 单实例，内部按行 span + br（同） |
| 长段落 | 按块切，块内不再切 | 单实例，整段不切 |
| 表格 / 引用 | 表格走组件；引用拆成 spans | 表格、引用各有组件，各 1 实例 |
| 列表 / 任务项 | 每项一个文本块，标记为文本字符 | 整个列表 1 个 rich 块，复选框为内联 PNG |
| 每消息 list-item 数 | 正文块攒批成 1 个 item，仅表格 / 代码独占 | 每个 rich / table / quote / code / mermaid / math 块都独占 item |
| 代码块 nodes 交付 | nodes → HTML 字符串 → rich-text | 直接 nodes → rich-text |

## 七、结论

1. 两个分支都不存在"整条消息塞进一个 rich-text"的渲染方式。v3 里能整篇渲染的 `markdownTokensToRichTextNodes` 已无调用方，all-rich-text 里连 AST 通道都被删除。
2. rich-text 实例的颗粒度上限就是"一个块"：v3 是表格块 / 代码块，all-rich-text 是顶层段落 / 表格 / 引用 / 代码 / 公式。实例内部不再做行数或字节数分片，长代码块与长段落都会完整落在单个实例里。
3. all-rich-text 把 rich-text 从"只服务表格和代码"扩展成正文的唯一渲染手段，颗粒度从"块级 AST 节点"变成"顶层段落"，并强制每个原生 rich-text 独占一个 list-item。这是为了规避原生 rich-text 更新 nodes 触发全量位图快照的卡顿。
4. 列表与任务项是两分支实现差异最集中的内容：v3 用文本字符模拟项目符号与勾选框（多项拆块、兜底路径会退化），all-rich-text 保留列表语义交给原生 rich-text（整块一个实例、勾选框为图片）。
5. 后续若要继续优化，可动的点集中在：长代码块是否按行数切分多实例、段落之间空白 rich 块是否可以合并到相邻块以减少空实例、任务项图片是否需要拦截 `@itemclick`、以及清理两分支中均已无调用方的 token 渲染遗留代码。
