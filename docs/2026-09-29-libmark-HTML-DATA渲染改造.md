# libmark 渲染改造：AST 通道切换为 HTML/DATA 流

修改日期：2026-09-29

## 一、任务目标

Android/鸿蒙平台的 libmark 渲染从 AST 通道切换为 HTML/DATA 通道，放弃基于 AST 的槽位适配与文本块渲染：

- 关闭 libmark AST 通道，只交付 HTML 与 DATA。
- 已闭合的连续 HTML 顶层块合并为一个 rich-text 渲染；未闭合的尾块单独用一个 rich-text 渲染。
- 未闭合尾块以 `<pre` 开头时按代码块预判，直接交给代码组件流式渲染。
- 尾块闭合后按内容类型分流：普通块并入前一个 rich-text；表格/代码/内联 SVG 交给现有专用组件；DATA 信封按内容类型（math/mermaid）交给现有组件。

## 二、实施方案

### 2.1 数据流

```
Worker: createSession('html') → feed/finish → ops(kind=html|data)
主线程: pendingLibmarkOps → runner 轮询 → libmarkStreamApply
适配层: LibmarkHtmlStreamAdapter（新增 libmark-html.uts）
  - 连续普通 HTML → kind='html' 条目（committed 合并 + 未闭合 tail 单列）
  - 闭合代码块 → kind='code'/'mermaid'（含未闭合 <pre 预判，isComplete=false）
  - 闭合表格 → kind='table'（prepareMarkdownTable 解析列宽）
  - 内联 SVG（mermaid 主载荷）→ kind='image'（data URI 图片）
  - DATA 信封 → kind='math'/'mermaid'/'data-text'
渲染: MarkdownTextRenderBlock 复用主链路；html/image 新增渲染分支
```

条目 key 按「条目序号」分配，tail 条目使用「下一个条目序号」：代码尾块 commit 后 key 不变，列表项复用不重建；普通尾块闭合时并入活跃 html 段后消失，由新尾块接续。

### 2.2 适配层规则（libmark-html.uts）

| op | kind | 处理 |
| --- | --- | --- |
| 4 reset | - | 清空全部条目 |
| 1 append | html | 扫描切分已闭合的 table / pre / svg；普通片段追加到活跃 html 段，特殊块切出后 html 段封口 |
| 1 append | data | 先闭合残留尾块，再插入 data 条目；mermaid DATA 按块序号替换同块的 svg 条目（合并组交付时退化为替换最近 svg 条目） |
| 2 tail | html | 记录未闭合内容；输出时以 `<pre` / `<svg` 开头分别产出 code / image 条目，其余产出 html 条目 |
| 3 commit | html | 按顶层标签路由：pre→代码、table→表格、svg→图片、其他→并入活跃 html 段 |
| 2/3 | data | math partial 更新 tail，complete 提交 math/mermaid 条目 |

DATA 信封字段：`type` / `status` / `source` / `format` / `svg`；svg 为 base64 data URI，尺寸解码根标签读取（信封不带尺寸）。

### 2.3 渲染层

- `uni-ai-libmark-html` 新组件：`prepareLibmarkHtml`（基础样式 + 段落/引用/链接/表格/图片中性色样式）后交给 `rich-text`。
- `uni-ai-x-msg.uvue` 新增 `html`（rich-text）/ `image`（SVG 图片）/ `data-text` 渲染分支。
- `uni-ai-chat.uvue`：`isRichTextListBlock` 增加 html/image（独占列表项）；删除 libmark AST 残留（`isLibmarkAst`、`libmarkStreamLoadFromAst`）。
- 表格 / 代码 / mermaid / math 沿用现有组件，渲染分派逻辑不变。

### 2.4 其他调整

- `workers/aiRequestWorkerTask.uts`：流式会话与重建会话均改为 `createSession('html')`。
- `uni-ai-worker/utssdk/libmark-ast.uts` 删除；`markdown-text.uts` 的 libmark AST 转换函数替换为 `libmarkHtmlBlocksToTextBlocks`。
- `libmark-stream-store.uts` 换用新适配器，删除 `libmarkStreamComplete`、`libmarkStreamLoadFromAst`；`libmarkStreamMarkComplete` 增加尾块收尾。
- `markdown-html.uts` 导出 `findOpenTag` / `decodeHtmlText` / `codeLanguage` 供切块复用，新增 `prepareLibmarkHtml`。

## 三、改动清单

| 文件 | 改动 |
| --- | --- |
| `workers/aiRequestWorkerTask.uts` | createSession('ast') → createSession('html')（2 处） |
| `uni_modules/uni-ai-worker/utssdk/libmark-html.uts` | 新增：HTML/DATA 流适配器 |
| `uni_modules/uni-ai-worker/utssdk/libmark-ast.uts` | 删除 |
| `uni_modules/uni-ai-worker/utssdk/index.uts` | 导出切换为 libmark-html |
| `uni_modules/uni-ai-worker/utssdk/markdown-html.uts` | 导出工具函数、新增 prepareLibmarkHtml |
| `uni_modules/uni-ai-x/sdk/libmark-stream-store.uts` | 换适配器、清理 AST 接口 |
| `uni_modules/uni-ai-x/sdk/markdown-text.uts` | 删除 libmark AST 转换、新增 HTML 块转换 |
| `uni_modules/uni-ai-x/components/uni-ai-chat.uvue` | libmark 分支清理、isRichTextListBlock 调整 |
| `uni_modules/uni-ai-x/components/uni-ai-x-msg/uni-ai-x-msg.uvue` | 新增 html / image / data-text 分支 |
| `uni_modules/uni-ai-x/components/uni-ai-libmark-html/` | 新增 rich-text 渲染组件 |

## 四、执行结果

- `launch app-android --compile true`：编译成功。
- `launch app-harmony --compile true`：UTS 编译完毕、HAP 制作成功。
- 修改文件经 `lsp lint` 检查，除与既有代码同风格的对象字面量断言告警（非编译错误）外无新增问题。
- 真机功能验证（流式渲染、公式/图表、表格、代码高亮、主题切换）需在自定义基座执行；本机自动化测试环境缺少 `@dcloudio/uni-5/lib/uni.automator.js` 依赖，未能运行自动化用例。

## 五、待验证清单（真机）

1. 完整 Markdown 示例流式渲染：标题/列表/任务列表/引用/链接/图片。
2. 代码块：围栏未闭合期间按代码组件流式高亮，闭合后就地转完成态。
3. mermaid：代码视图流式 → 闭合后切换图表；确认 DATA 补发到达（否则 SVG 图片兜底）。
4. display 公式：partial 显示源码 → complete 显示 SVG。
5. 表格：流式期间 rich-text 渲染 → 闭合后切换表格组件（列宽/横向滚动）。
6. 暗色主题切换、会话取消/错误、消息删除、重启后历史消息重建。

## 六、问题修复记录

### 块公式未能正常渲染（2026-09-30）

- 现象：display 公式流式结束后仍显示源码，或仅显示 1px 大小。
- 根因：`libmark-html.uts` 的 `buildDataEntry` 把 DATA 信封的 `svg` 字段当作 base64 data URI
  处理。实际 libmark 信封的 `svg` 是 `render_svg_buffer` 返回的明文 SVG 字节
  （`data:image/svg+xml;base64,` 前缀只用于 HTML 通道的行内公式与 AST 节点 payload）。
  明文直接作为 image `src` 无法加载，`readSvgDataUriSize` 前缀不匹配返回 0 尺寸。
- 修复：math / mermaid 分支改为 `svgToImageSource(svg)`（明文转 data URI）+
  `readSvgSize(svg)`（解析根标签尺寸），与 libmark 官方 demo 的 `setSvgImage` 一致；
  删除不再使用的 `readSvgDataUriSize` / `emptySvgSize`。
- 验证：app-android、app-harmony 编译通过；真机显示效果待复验。

### 化学公式源码与渲染结果同时显示（2026-09-30）

- 现象：完整示例中的块公式在流式结束后同时显示源代码与渲染后的公式。
- 分析：适配器两处处理与 libmark 的尾块语义不符，均可导致重复条目或源码残留：
  1. 稳定块（BLOCK/append）到达时，原实现把残留的未闭合尾块按「闭合」提交为正文内容；
     libmark 中尾块被插件输出替换时旧内容应作废（桥接层对 kind 切换的尾块同样丢弃）。
  2. DATA 信封的同一顶层块可能分两次提交（先 partial 后 complete）；原实现每次都追加新条目，
     形成「源码条目 + 公式条目」并存的重复渲染。
- 修复：
  1. append 到达时改为丢弃残留尾块（clearTail），不再提交；
  2. appendData 增加同块序号去重：已存在同块 data 条目时更新既有条目（保留原 key），
     不再追加，覆盖 partial→complete 升级与重复提交场景。
- 验证：app-android、app-harmony 编译通过；真机显示效果待复验。
