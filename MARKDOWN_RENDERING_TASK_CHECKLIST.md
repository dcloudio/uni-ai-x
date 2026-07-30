# Markdown 渲染整改与框架问题检查单

> 用途：作为领导批示的整改检查单、应用层后续开发清单，以及向框架开发工程师上报问题的依据。

- 当前分支：`dev-vapor-richTextNative`
- 首次整理：2026-07-29
- 最近更新：2026-07-30
- 维护规则：每解决一项，必须同步更新状态、实现说明、验证结果和 Git 提交号。

## 状态说明

- `已完成`：实现完成，并已有明确的真机验证或验收结论。
- `已实现，待验收`：代码已完成，但还缺领导/产品验收或完整主题回归。
- `部分完成`：应用层已缓解，仍有明确剩余问题。
- `未完成`：尚未达到批示要求。
- `待上报`：已有证据指向框架层，材料尚未正式提交。
- `待确认能力`：需要框架开发工程师先确认平台能力边界，不直接按 Bug 上报。

## 批示拆解

1. 联网、ArrayBuffer/SSE 解码、Markdown 解析应形成真正的子线程链路。
2. 子线程输出解析结果，主线程只负责根据稳定的渲染描述创建界面。
3. 修复流程图底部显示不完整，以及滚动到流程图时的卡顿。
4. 修复侧滑菜单与表格/代码横向滚动的手势冲突、闪动和垂直滚动误触。
5. 修复表格、代码块、引用、分割线、列表和任务列表的视觉问题。
6. 所有样式需要兼容暗黑模式，降低公式和流程图切换主题时的闪烁。
7. RichText 能通过节点 CSS 完成的样式，应优先通过 `attrs.style` 实现。
8. 应用层能够解决的问题不提交框架；只有确认超出应用层能力的问题才上报。

## 总体检查单

| 编号 | 任务 | 当前状态 | 归属 | 验证/提交 |
| --- | --- | --- | --- | --- |
| T01 | 联网到 Markdown 的完整子线程链路 | Android/七牛范围已完成 | 应用层 | 生产 `RequestAiRunner` 真机通过；证据见 `android-worker-production-qiniu-results.txt` |
| T02 | 子线程输出渲染描述，主线程批量创建组件 | 部分完成 | 应用层 | Worker 已输出 CMark token 快照；稳定 key、渲染富化与组件更新仍在主线程 |
| T03 | 流程图底部完整显示 | 已完成 | 应用层 | Android 隔离截图确认结束节点、容器底边和下方正文完整可见 |
| T04 | 滚动到流程图时不卡顿 | 部分完成 | 应用层缓解，框架层仍有瓶颈 | `14445cf`，剩余证据见性能报告 |
| T05 | 侧滑菜单不抢占表格/代码横滑，不误触垂直滚动 | 已实现，待验收 | 应用层 | 已实现方向锁、左缘起手、拖动禁用动画、速度吸附及横向 ScrollView 让权 |
| T06 | 表格和代码块圆角内容不溢出 | 应用层规避完成 | 应用层规避，框架根因待上报 | `2c3eb96`，暂时取消外层圆角 |
| T07 | 引用样式正确 | 已完成 | 应用层 | `a73eca6`，Android 明暗主题截图通过 |
| T08 | 代码空格与缩进不丢失 | 已完成 | 应用层 | `790e6fd`，Android 隔离验证通过 |
| T09 | 分割线样式正确 | 已完成 | 应用层 | `73d200e`，使用主题化 1px 原生 View |
| T10 | 表格外框、宽窄表、均分列、空白、底边及左右边线 | 已完成并验收 | 应用层 | `5115f53`、`28ec2c5`、`3c6336b` |
| T11 | 无序、有序、嵌套和任务列表使用 RichText + CSS | 已完成 | 应用层 | `c766134`，Android 明暗主题隔离截图通过 |
| T12 | 普通 Markdown 样式完整适配暗黑模式 | 已完成 | 应用层 | Android 隔离截图覆盖列表、引用、分割线、表格、代码、公式和流程图 |
| T13 | 公式和流程图切换暗黑模式不闪烁 | 已完成 | 应用层 | 双 Image 缓冲；Android 连续 24 帧明暗切换截图无空白帧 |
| T14 | 明确 RichText/Image 与外围容器的职责 | 已完成 | 架构结论 | 不能把整个界面简化成只有 RichText 和 Image |
| T15 | 公式位于 fenced code 之前时仍能被解析 | 已完成 | 应用层 | Android 隔离截图覆盖代码块前后公式及代码内 `$` 文本 |

## 任务详情

### T01 完整子线程链路

领导要求的目标链路是：

```text
子线程：发起请求 -> 接收 ArrayBuffer -> TextDecoder/SSE -> 累积正文 -> Markdown 预处理 -> CMark -> 渲染描述
主线程：接收批量渲染描述 -> 更新稳定 key 的组件树
```

当前 Android 内置模型生产链路已经达到本轮约定的七牛范围：

- [`requestAiRunner.uts`](uni_modules/uni-ai-x/sdk/requestAiRunner.uts) 仅在主线程取得提供商配置和短期令牌，随后把实际流式 AI 请求交给生产 Worker。
- Worker 内完成 `enableChunked` 请求、ArrayBuffer/UTF-8/SSE 解码、正文与思考内容累积、公式预处理和 CMark。
- UTS 运行时桥只保存最新不可变 JSON 快照；主线程每 50ms 轮询，不按标签逐条回调和追加 View。
- 主线程继续负责稳定 key/节点复用、表格宽度、代码高亮、公式/流程图 SVG 等依赖 UI 能力的渲染富化；这部分归入 T02，不能据此宣称“整个界面只有 RichText 和 Image”。
- 自定义提供商与非 Android 平台保持原路径；百炼按用户要求未测试。短期令牌的云端预取也没有迁入 Worker，因此 T01 的完成结论严格限定为 Android/七牛的 AI 热链路。

能力探针已经完成，结论见 [`WORKER_CAPABILITY_REPORT.md`](WORKER_CAPABILITY_REPORT.md)。Android 真机已确认真实 Worker 内普通 `uni.request`、`RequestTask.onChunkReceived`、`ArrayBuffer`、`TextDecoder` 和 `uni-cmark` JNI 解析可用；流式请求收到 3 个分块并累计解码 177 个字符，CMark 在 143ms 内返回 2 个 token。模块根别名导入失败已通过“声明插件依赖 + 导入 Android 平台入口”在应用层解决。该阶段确认 T01 不受框架能力阻塞，后续生产迁移结果见下方第六阶段。

第一阶段生产基础已完成：新增纯 UTS `SSEStreamDecoder`，在一个响应周期内保留 UTF-8 尾字节、未完成文本行和 SSE 事件。Android Worker 把 93 个原始 UTF-8 字节切成 11 段，分片点跨越中文字符、CRLF、`data:` 和事件空行，149ms 无损返回两条中文 JSON，`[DONE]` 一次，字节/文本残留均为 0；同时通过无终止空行的 `finish()` 刷出与多行 `data:` 合并断言。测试代码、命令、线程、构建和截图见 [`test-results/android-worker-sse-fragments-results.txt`](test-results/android-worker-sse-fragments-results.txt)。

第二阶段生产基础已完成：新增 `WorkerStreamRequest`，在 Worker 内执行真实 `enableChunked` POST，把每个 ArrayBuffer 直接交给上述有状态 SSE 核心。Android 真机收到 3 个网络分块、177 字节和 3 条 SSE JSON，首尾中文内容无损，核心耗时 3425ms；执行线程为 `pool-5-thread-1`，不是页面主线程。请求 generation 会丢弃旧请求/abort 后迟到回调；取消时序与 HTTP 失败仍待专项测试。完整方式、断言、线程和截图见 [`test-results/android-worker-stream-core-results.txt`](test-results/android-worker-stream-core-results.txt)。本阶段尚未把生产 `RequestAiRunner` 切换到该核心，因此 T01 仍是部分完成。

关于自定义基座的证据边界：以上两阶段均为纯 UTS，HBuilderX 跳过自定义基座 2.1.4 更新时，设备仍执行了最终源码新增字段和 `stream-core` 场景，证明纯 UTS 调试内容生效。当前只明确 `.so` 变化仍需重打基座；Kotlin/Java 桥接和原生配置未做独立控制变量，不笼统判定。

第三阶段可行性闸门已通过：隔离 `full-chain` 场景用真实网络取得 6 个分块、354 字节，在 Worker 内逐段完成 SSE、Markdown 累积、CMark 与最小 `rich/image` 描述构建。插件保存最新不可变累计快照，页面每 50ms 轮询，实际观察到 `1,2,3,4,5,6` 六个严格递增版本；终态为 6 个 token、6 个稳定 key 描述，首尾中文无损。Worker/plugin 和 CMark JNI 均不在页面主线程。测试代码、命令、原始终态、线程和截图见 [`test-results/android-worker-full-chain-feasibility-results.txt`](test-results/android-worker-full-chain-feasibility-results.txt)。本阶段只证明机械链路，后续取消重启和真实七牛 AI 闸门也已分别通过。

第四阶段取消闸门已通过：页面观察到请求 A 的第一批结果后向 Worker 发 `restart-request`，Worker 对 A 执行 `abort()` 后在 0-1ms 内启动请求 B，并在 B 完成后继续观察 1500ms。三次 Android 冷启动均观察到 `A:1,B:1,B:2,B:3`；B 均为 3 块、177 字节，A 取消后的应用层数据和终态回调均为 0，页面到 Worker 控制投递为 5-6ms。测试代码、逐轮数据、命令、线程、截图和证据边界见 [`test-results/android-worker-cancel-restart-results.txt`](test-results/android-worker-cancel-restart-results.txt)。

第五阶段真实七牛闸门已通过：续费后的七牛网关在 1060ms 返回 67 字符临时令牌；`deepseek-v3` 真实流式请求在 Worker 内收到 210 个网络分块、109955 字节和 482 条 SSE 事件，以真实 `[DONE]` 终止。最终正文 1873 字符，Worker 生成 8 批快照，CMark 返回 24 个 token 且无解析错误，覆盖标题、段落、列表、代码块、引用和表格；页面明确完成 `1/1`。完整测试代码、命令、线程、原始数据、失败扫描、正常入口回归和截图见 [`test-results/android-worker-real-ai-qiniu-results.txt`](test-results/android-worker-real-ai-qiniu-results.txt)。按用户确认，本阶段只要求七牛，百炼不在当前范围；未改动或部署云端资源。

第六阶段生产接入已完成：Android 内置提供商的 `RequestAiRunner` 已切换到生产 Worker。最终七牛真机回归先在请求 A 首批 42 字符后取消，59ms 后启动请求 B；B 以真实 `[DONE]` 完成 224 个网络分块、115574 字节、506 条 SSE、61 批不可变快照和 24 个顶层 CMark token。CMark TID 为 20353，主线程 TID 为 16395；标题、列表、引用、表格、代码块、两张公式 SVG 和 JavaScript 高亮均通过，A 取消后的回调为 0，且无 dead-thread、`IllegalStateException`、`TypeError` 或崩溃。完整命令、边界、数据和截图见 [`test-results/android-worker-production-qiniu-results.txt`](test-results/android-worker-production-qiniu-results.txt)。

因此，T01 在当前约定的 Android/七牛范围内已完成。这里不扩大结论：临时令牌仍由主线程预取，百炼未测，iOS/Harmony/Web 未迁移，完整渲染描述与组件创建职责仍属于 T02。

### T02 渲染职责边界

当前渲染类型为：

```text
rich / quote / divider / table / code / mermaid / math
```

领导所说“只有 RichText 和 Image”只描述了主要内容载体，不是完整组件树。以下外围结构仍然必需：

- 表格和代码块的横向 `scroll-view`。
- 代码块标题、复制按钮和流程图/源码切换。
- 引用边线、内边距和背景。
- 分割线。
- 数学公式和流程图的加载态、尺寸占位、失败态与预览交互。

建议子线程输出粗粒度、带稳定 key 的渲染描述，并按节流周期批量通知主线程。不要每发现一个标签就立即追加一个 View，否则会放大主线程 `appendViewTasks` 卡顿。

### T03-T04 流程图完整性与性能

应用层已经完成：

- 为流程图预留稳定尺寸，避免图片加载造成布局跳变。
- Image 预挂载，加载完成后通过透明度切换显示。
- 流式阶段限制超宽临时 RichText，避免生成超宽位图。

Android 隔离回归结果：

- 仅保留一张流程图及下方参照文字时，结束节点、容器底边和下方正文均完整可见。
- 回归期间 Android 日志未发现 `AndroidRuntime`、`CSSParser` 或 `RichTextRenderer` 相关错误。

仍需处理：

- 复测首次滚入可见区、离屏后回屏、连续多张流程图三个场景。
- 若仍卡顿，引用 F01-F03 的框架证据，不再继续通过应用层反复调整延时。

### T05 侧滑菜单手势

当前问题属于应用层，暂不报框架。已完成：

- 记录 `startX/startY`，移动超过 10px 后再锁定方向；纵向位移不小于横向位移时放弃侧栏手势。
- 菜单关闭时，只接受屏幕左侧 32px 内起手；打开状态只接受向左关闭手势。
- 表格、代码块和公式的横向 ScrollView 在触摸阶段阻止冒泡，优先消费横滑。
- 拖动期间关闭 transition，取消手势时恢复原状态，松手后再启用吸附动画。
- 使用 80px 位移或 0.35px/ms 速度决定打开/关闭，降低闪回并改善短促滑动响应。

验证结果：

- HBuilderX 5.24 蒸汽模式 Android 全量编译、启动和 logcat 通过，页面截图无布局回归。
- 设备系统同时拒绝 `adb input swipe` 和 Monkey 脚本注入触摸事件（缺少 `INJECT_EVENTS`，注入事件数为 0），仍需人工执行表格横滑、代码横滑、垂直滚动、左缘短滑和侧栏关闭五个手势场景。

### T06-T11 Markdown 样式

- 表格：ScrollView 绘制外框，RichText 表格只绘制内部网格；窄表等分铺满，宽表保持自然宽度横滑。已验收。
- 代码块：暂时取消外层圆角；空格和制表符转换为不可折叠空白，复制内容仍使用原始代码。
- 引用：外围 View 负责边线、背景和内边距，内部 RichText 负责文本、链接和图片。
- 分割线：使用独立的主题化 1px View，不再用字符模拟。
- 列表：在同一个 RichText 中生成 `ul/ol/li/span`，缩进、行距和任务标记通过 `attrs.style` 传入。

### T12-T13 暗黑模式

已完成的基础工作：

- RichText 根节点按主题设置文字和背景。
- 表格、引用、分割线使用主题变量或明暗色值。
- 公式和流程图 SVG 按主题重新生成，并保持尺寸稳定。

Android 暗黑真机回归已覆盖：

- 无序列表、有序列表、嵌套列表和任务列表。
- 引用、分割线、短表格、宽表格和代码块。
- 行内公式、超宽块级公式和流程图；文字、边线和 SVG 内容均可辨识。

T13 已完成：

- 公式和流程图均使用两个 Image 槽位：旧图保持可见，新主题图片在隐藏槽位加载，收到 `load` 后再交换活动槽位。
- 公式 Image 不再使用 `flatten`。Android 上扁平化图片从透明状态恢复时存在不重绘现象，取消扁平化后独立图层可稳定切换。
- Android 每 2 秒切换一次明暗主题，连续采集并检查 24 张截图；每一帧中的公式和流程图均完整可见，无空白帧。
- 本项已由应用层解决，暂不补充到 F03；F03 继续只跟踪 SVG 首次显示和回屏时的解码、纹理上传性能。

### T15 公式与代码块顺序

根因是公式预处理只从最后一个三反引号之后开始搜索。整段 Markdown 一次进入解析器时，代码块之前的公式会被直接跳过；流式逐段解析通常先收到公式，所以此前没有稳定暴露。

应用层已改为分段扫描 fenced code，只在代码块外寻找公式，并能跨过代码块继续处理后续公式。Android 隔离回归确认：

- fenced code 前后的两条块级公式均正常渲染。
- 代码块中的 `$not_math$` 保持原始代码文本，没有被识别为公式。
- 后续 Mermaid 流程图仍能正常生成和显示。

## 框架问题上报清单

| 编号 | 问题 | 状态 | 优先级 | 当前证据 |
| --- | --- | --- | --- | --- |
| F01 | RichText `nodes` 更新触发全量位图快照和大规模拷贝 | 待上报 | P0 | 已补最小复现与汇总脚本；4 轮精确对照 fixed 113.5~114.7 FPS、updating 52.2~60.1 FPS；每轮更新阶段 196 次拷贝、98 次快照，完整日志轮次各拷贝 4.068 GiB |
| F02 | 原生布局和 View 追加产生主线程长任务 | 待上报 | P0 | 已补最小复现；RichText 追加最大 37.89ms，普通 View 最大 2.15ms；布局尖峰仅真实链路复现 |
| F03 | SVG 大图首次显示/回屏可能重复解码和上传纹理 | 待上报 | P1 | 已补最小复现；动态挂载 append 最大 50.82ms，预挂载切换为 0；是否重复解码/上传待框架 Trace |
| F04 | flatten 容器中的原生 RichText 不服从父容器圆角裁剪 | 待上报 | P1 | Android 配对最小复现：2 个非 flatten 对照均正确，3 个 flatten 用例均失败；原始 1440x3200 截图、SHA-256、命令与结果已归档 |
| F05 | 蒸汽模式真实 Worker 的网络与插件能力边界 | 已由应用层解决，不上报 | - | 普通请求 388ms；流式请求 3 块/177 字符/3476ms；CMark 2 token/143ms |

F01-F03 的完整数据、对照实验和建议见 [`RICH_TEXT_PERFORMANCE_REPORT.md`](RICH_TEXT_PERFORMANCE_REPORT.md)。

F04 的最小复现、条件矩阵和当前规避方案见 [`RICH_TEXT_RADIUS_CLIPPING_REPORT.md`](RICH_TEXT_RADIUS_CLIPPING_REPORT.md)。结论不是“所有 RichText 都不能圆角”，而是 Android 蒸汽模式下 `flatten` 父 View 与原生 RichText 的组合不能正确执行父级圆角裁剪。RichText 节点 CSS 只能处理内容自身的首尾边缘，不能替代宽内容外层 ScrollView 的视口裁剪。

F05 的真机探针、测试代码、逐项耗时、流式分块数据、CMark 线程证据、截图和导入对照见 [`WORKER_CAPABILITY_REPORT.md`](WORKER_CAPABILITY_REPORT.md)。网络、解码和 CMark 均已确认；“请求不返回”和“CMark 不能导入”都已证明是应用配置/路径问题，不提交框架。

### F05 已确认的边界

- Android 蒸汽模式 `.uvue` 页面不能直接调用 `uni.createWorker`，必须由 UTS 插件封装创建。
- `manifest.json` 必须声明 `"workers": "workers"`，否则会误报 Worker 路径不存在或未正确实现。
- Worker 本地消息收发、普通 `uni.request`、`RequestTask`、`onChunkReceived`、`ArrayBuffer` 和 `TextDecoder` 已在 Android 真机通过。
- 探针插件声明 `uni-cmark` 依赖，Worker 导入 Android 平台入口后，CMark JNI 在非主线程解析成功。
- 最终真机数据：本地解码 174ms；普通 GET 388ms；流式 POST 3476ms，3 个分块，累计 177 个字符；CMark 143ms，2 个 token，首个类型 `heading`。
- Android/iOS 的引用类型按官方说明直接共享内存，不默认克隆；传递渲染描述后必须避免两线程继续修改同一对象。
- `transferable` 只支持鸿蒙和 Web，Android 方案不能依赖所有权转移。
- `RequestTask.abort()` 和 `Worker.terminate()` 有公开 API，但仍需用请求版本主动丢弃迟到结果。

### F05 暂不上报的工程注意项

1. Worker 的模块根别名不能解析时，使用平台入口的显式相对路径，并在桥接插件中声明依赖。
2. Worker 源文件缓存曾未自动失效；当前通过插件依赖变更和全量构建解决，未形成生产阻塞。
3. 跨层过程消息不逐条回调页面；插件记录过程，每个场景只批量回传一次终态，符合主线程批处理设计。
4. 生产迁移已经用请求 generation、取消后 59ms 重启和 `lateA=0` 完成专项验证；后续修改仍必须保留版本隔离。

## 已由应用层处理、不提交框架的问题

- 侧滑菜单误触：方向锁、左缘起手、速度吸附和横向 ScrollView 让权均已实现，待人工手势验收。
- 公式/流程图主题闪烁：双 Image 缓冲已通过 Android 连续明暗切换验证。
- 表格左右边线：应用层前景边线方案已经验收。
- 列表和引用视觉：RichText CSS 与外围容器方案已经完成 Android 明暗主题验收。

## 后续处理顺序

按改动大小和风险从低到高：

1. 人工验收 T05：表格/代码横滑、垂直滚动、左缘短滑和侧栏关闭。
2. 将 F04 最小复现和圆角裁剪报告正式提交框架，并记录 issue/负责人。
3. 继续 T02：把可脱离 UI 的渲染描述构建移入 Worker，主线程只做必要富化和批量组件更新。
4. 将 F01-F03 连同性能报告正式提交框架，并记录对应 issue/负责人。

## 更新记录

| 日期 | 编号 | 更新内容 | 提交/报告 |
| --- | --- | --- | --- |
| 2026-07-30 | T01 | 生产 `RequestAiRunner` 接入 Android Worker；七牛真实流完成 224 块/115574 字节/506 条 SSE/61 批快照，取消后重启无迟到回调和 dead-thread 警告 | 本提交（`feat: 将七牛流式解析接入 Worker`） |
| 2026-07-30 | T01 | 七牛网关真实 `deepseek-v3` 在 Worker 内完成 210 块/109955 字节/482 条 SSE、8 批快照和 24 个 CMark token；页面 1/1，通过后允许生产接入 | 本提交（`test: 验证 Worker 七牛真实链路`） |
| 2026-07-30 | T01 | 三次冷启动验证 A 取消后立即启动 B；B 完整有序且 A 迟到应用回调为 0，尚未接生产 | 本提交（`test: 验证 Worker 取消重启隔离`） |
| 2026-07-30 | T01 | 隔离验证真实网络到 CMark/渲染描述的完整机械链路；页面无损观察 1..6 六批稳定快照，尚未接生产 | 本提交（`test: 验证 Worker 完整链路可行性`） |
| 2026-07-30 | T01 | 新增 Worker 生产流式 POST 核心；真机确认 3 块/177 字节/3 条 SSE 中文事件，保留线程、命令、断言和截图 | 本提交（`fix: 在 Worker 中执行流式请求`） |
| 2026-07-30 | T01 | 新增有状态 UTF-8/SSE Worker 核心；保留 11 段边界测试，Android 返回两条无损中文事件且无残留 | 本提交（`fix: 增加有状态 SSE 分片解码`） |
| 2026-07-30 | F05 | 声明 `uni-cmark` 依赖并导入 Android 平台入口；真机确认 Worker 中 CMark 返回 2 个 token，线程、耗时和截图已归档 | 本提交（`test: 验证 Worker 调用 CMark`） |
| 2026-07-30 | F05 | 保留 Worker 自动探针、逐项耗时、流式分块原始数据、截图及 CMark 失败 fixture；撤销请求不返回的假阴性结论 | 本提交（`test: 验证 Worker 流式网络能力`） |
| 2026-07-30 | F04 | 改为仅切换 flatten 的配对用例，归档原始截图、测试命令和逐项结果 | 本提交（`test: 完善 RichText 圆角裁剪证据`） |
| 2026-07-30 | F01 | 补齐阶段日志边界，保留自动汇总脚本，连续四轮记录页面与原生结果 | 本提交（`test: 补齐 RichText 性能采集边界`） |
| 2026-07-30 | F01-F03 | 统一记录真机环境、复现代码、控制变量、运行命令、采样算法和日志口径 | 本提交（`docs: 补充性能测试复现方法`） |
| 2026-07-30 | F03 | 新增同源 800x640 SVG 预挂载与动态挂载的自动对照最小复现页 | 本提交（`test: 新增 SVG Image 挂载性能复现`） |
| 2026-07-30 | F02 | 新增普通 View 与原生 RichText 逐个追加的自动对照最小复现页 | 本提交（`test: 新增原生 View 追加性能复现`） |
| 2026-07-30 | F01 | 恢复固定 RichText 与持续更新 nodes 的自动对照最小复现页 | 本提交（`test: 新增 RichText 更新性能复现`） |
| 2026-07-30 | T05 | 确认 ADB 与 Monkey 均被系统拒绝注入手势；修正检查单中的过期问题归属 | 本提交（`docs: 修正 Markdown 整改剩余状态`） |
| 2026-07-30 | F05 | 完成 Android Worker 网络、解码、消息和插件导入能力探针；记录当前阻塞项 | 本提交（`docs: 明确蒸汽模式 Worker 能力边界`） |
| 2026-07-30 | F04 | 完成 flatten + 原生 RichText 圆角裁剪最小复现和框架报告 | 本提交（`test: 新增 RichText 圆角裁剪复现`） |
| 2026-07-29 | T15 | 修复整段 Markdown 中代码块之前的公式被跳过 | 本提交（`fix: 修复代码块前公式解析遗漏`） |
| 2026-07-29 | T13 | 公式和流程图使用双 Image 缓冲；Android 连续 24 帧明暗切换无空白帧 | 本提交（`fix: 使用双 Image 缓冲切换 SVG 主题`） |
| 2026-07-29 | T05 | 完成侧栏方向锁、左缘起手、速度吸附和横向 ScrollView 手势让权 | 本提交（`fix: 修复侧栏与横向滚动手势冲突`） |
| 2026-07-29 | T07/T11/T12 | Android 明暗主题隔离截图完成普通 Markdown 样式验收 | 本提交（`docs: 完成 Markdown 暗黑模式验收`） |
| 2026-07-29 | T03 | Android 隔离截图确认流程图结束节点、容器底边和下方正文完整显示 | 本提交（`docs: 完成流程图底部显示验收`） |
| 2026-07-29 | T04 | 预挂载流程图 Image，降低动态插入开销 | `14445cf` |
| 2026-07-29 | F01-F03 | 完成 RichText 与 SVG 剩余性能问题报告 | `f5ed673` |
| 2026-07-29 | T06 | 暂停使用代码块外层圆角 | `2c3eb96` |
| 2026-07-29 | T08 | 修复代码空格和缩进折叠 | `790e6fd` |
| 2026-07-29 | T09 | 分割线改为主题化原生 View | `73d200e` |
| 2026-07-29 | T07 | 引用改为外围容器 + RichText 内容 | `a73eca6` |
| 2026-07-29 | T10 | 完成表格宽窄布局、空白、底边和左右边线修复，并由用户验收 | `5115f53`、`28ec2c5`、`3c6336b` |
| 2026-07-29 | T11 | 列表恢复为 RichText，并通过节点 CSS 设置样式 | `c766134` |

## 单项完成后的更新模板

```markdown
### YYYY-MM-DD - Txx/Fxx

- 状态：未完成 -> 已完成
- 实现/结论：
- 应用层或框架层归属：
- 验证平台与场景：
- Git 提交：
- 框架 issue/负责人（如有）：
- 剩余风险：
```
