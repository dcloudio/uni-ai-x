# Android 蒸汽模式 Worker 能力验证报告

## 结论

领导要求的目标链路是：

```text
Worker：uni.request -> onChunkReceived -> ArrayBuffer/TextDecoder -> SSE -> Markdown 预处理 -> CMark -> 渲染描述
主线程：接收批量渲染描述 -> 更新组件树
```

2026-07-30 Android 真机最终验证确认：Worker 内普通 `uni.request`、`RequestTask`、`onChunkReceived`、`ArrayBuffer`、`TextDecoder` 和 `uni-cmark` JNI 解析均可用。流式请求实际收到 3 个分块，累计解码 177 个字符；CMark 在 143ms 内返回 2 个 token，首个类型为 `heading`。

此前“`uni.request` 不返回”和“Worker 不能调用 `uni-cmark`”都是无效中间结论，已经撤销。前者由 Worker 清单、旧缓存和跨层回调方式造成；后者只是模块根别名在 Worker 编译单元中不能解析，改为声明插件依赖并导入 Android 平台入口后成功。F05 已由应用层闭环，不上报框架。T01 仍未完成的原因是生产链路尚未迁移，不再是平台能力阻塞。

## 保留的复现材料

- 页面：[`pages/repro-worker-capability/index.uvue`](pages/repro-worker-capability/index.uvue)
- Worker：[`workers/markdownWorkerTask.uts`](workers/markdownWorkerTask.uts)
- UTS 桥接插件：[`uni_modules/uni-ai-worker-probe`](uni_modules/uni-ai-worker-probe)
- CMark 编译失败样例：[`test-fixtures/worker-cmark-import-failure.uts.txt`](test-fixtures/worker-cmark-import-failure.uts.txt)
- 真机结果：[`test-results/android-worker-capability-results.txt`](test-results/android-worker-capability-results.txt)
- 真机截图：[`test-results/android-worker-capability.png`](test-results/android-worker-capability.png)
- CMark 真机结果：[`test-results/android-worker-cmark-results.txt`](test-results/android-worker-cmark-results.txt)
- CMark 真机截图：[`test-results/android-worker-cmark.png`](test-results/android-worker-cmark.png)
- 有状态 UTF-8/SSE 真机结果：[`test-results/android-worker-sse-fragments-results.txt`](test-results/android-worker-sse-fragments-results.txt)
- 有状态 UTF-8/SSE 真机截图：[`test-results/android-worker-sse-fragments.png`](test-results/android-worker-sse-fragments.png)
- Worker 生产流式请求核心结果：[`test-results/android-worker-stream-core-results.txt`](test-results/android-worker-stream-core-results.txt)
- Worker 生产流式请求核心截图：[`test-results/android-worker-stream-core.png`](test-results/android-worker-stream-core.png)
- Worker 完整机械链路可行性结果：[`test-results/android-worker-full-chain-feasibility-results.txt`](test-results/android-worker-full-chain-feasibility-results.txt)
- Worker 完整机械链路可行性截图：[`test-results/android-worker-full-chain-feasibility.png`](test-results/android-worker-full-chain-feasibility.png)
- Worker 取消重启隔离结果：[`test-results/android-worker-cancel-restart-results.txt`](test-results/android-worker-cancel-restart-results.txt)
- Worker 取消重启隔离截图：[`test-results/android-worker-cancel-restart.png`](test-results/android-worker-cancel-restart.png)

## 验证环境

- HBuilderX：`5.24.2026072917-dev`
- 编译器：uni-app x 5.24，蒸汽模式，字节码视图层
- 平台：Android 14 / API 34
- 设备：Xiaomi `M2102K1AC`
- 物理屏幕：1440x3200，density 560
- 包名：`io.dcloud.ai.x`
- 验证日期：2026-07-30

## 测试方式

1. 在 `manifest.json` 顶层配置 `"workers": "workers"`。
2. 由 UTS 插件创建 `workers/markdownWorkerTask.uts`；Android 蒸汽模式 `.uvue` 页面不能直接调用 `uni.createWorker`。
3. 页面依次执行 `local`、`sse-fragments`、`stream-core`、`request`、`stream`、`cmark`，每个场景使用新的 Worker，避免请求状态互相污染。
4. `local` 用 `Uint8Array([87,111,114,107,101,114])` 构造 ArrayBuffer，再用 `TextDecoder` 解码。
5. `request` 向 `https://request.dcloud.net.cn/api/http/method/get` 发起普通 GET，Worker 超时 8000ms，页面超时 12000ms。
6. `stream` 向 `https://request.dcloud.net.cn/api/http/contentType/eventStream?limit=3` 发起 `enableChunked: true` 的 POST，在 `onChunkReceived` 中逐块解码并累计数量和字符数。
7. `cmark` 场景在探针插件 `package.json` 声明 `uni-cmark` 依赖；Worker 直接导入 `../uni_modules/uni-cmark/utssdk/app-android/index.uts`，解析标题与两项列表，回传 token 数和首个 token 类型。
8. 使用下列命令全量编译并运行：

```sh
/Applications/HBuilderX-Dev.app/Contents/MacOS/cli launch app-android \
  --project /Users/json/Desktop/code/uni-ai-x \
  --deviceId 192.168.2.5:5555 \
  --playground custom \
  --native-log true \
  --cleanCache true
```

9. 使用下列命令读取应用与 Worker 日志：

```sh
adb -s 192.168.2.5:5555 logcat -d -v threadtime | \
  rg 'WorkerCapabilityRepro|request-created|chunkCount|decodedLength'
```

10. 在开发机预检普通请求地址，排除服务端不可达：

```sh
curl -sS -o /dev/null \
  -w 'ordinary_http=%{http_code} total=%{time_total}s\n' \
  'https://request.dcloud.net.cn/api/http/method/get'
```

## 最终结果

加入 CMark 场景后的 HBuilderX 全量构建成功，`ready in 31319ms`。页面自动测试结果：

| 场景 | 页面结果 | 耗时 | 结果数据 |
| --- | --- | ---: | --- |
| local | `local` | 174ms | `textDecoder=Worker` |
| request | `request-success` | 388ms | 普通 GET 成功，`RequestTask` 已创建 |
| stream | `request-success` | 3476ms | `chunkCount=3`，`decodedLength=177` |
| cmark | `cmark-success` | 143ms | `tokenCount=2`，`firstType=heading`，`detail` 为空 |

流式分块原始累计数据：

| 分块 | 累计解码字符数 |
| ---: | ---: |
| 1 | 59 |
| 2 | 118 |
| 3 | 177 |

页面最终打印 `[WorkerCapabilityRepro] complete`，没有 `host-timeout` 或 `cmark-fail`。CMark JNI 日志显示输入 32 字符、输出 JSON 299 字符。页面主线程 TID 为 10546，Worker 消息线程 TID 为 13284，CMark JNI 日志 TID 为 13304，CMark 没有在页面主线程执行。普通地址预检为 HTTP 200，耗时 0.130574s。应用日志没有 `AndroidRuntime`、`FATAL EXCEPTION` 或 `SIGABRT`。

把复现页移回 `pages.json` 末尾后又执行一次正常入口全量回归：8 个页面均编译成功，`ready in 25366ms`；设备顶层 Activity 为应用主 Activity，截图确认聊天页、公式、完整流程图、分割线和下方正文正常显示，异常扫描为空。

最终四场景截图为 1440x3200 PNG，244897 字节，SHA-256：

```text
d364af5ac62976c60e614cc436e2ebd7322cbb274d3602a5474f521b392f8c4a
```

## 有状态 UTF-8/SSE 分片回归

生产迁移前新增 `uni-ai-worker` 纯 UTS 核心 `SSEStreamDecoder`。它在同一个响应周期内保留未完成的 UTF-8 字节、文本行和 SSE 事件，不再假定一次 `onChunkReceived` 就是一条完整事件。

Android Worker 用 93 个真实 UTF-8 字节构造两条中文 JSON 事件和 `[DONE]`，固定切成 `4,8,3,17,3,10,3,18,11,15,1` 共 11 段。分片点覆盖中文三字节字符中间、CRLF 中间、`data:` 字段中间和 SSE 空行中间。最终 149ms 返回两条无损中文 JSON，`doneCount=1`、`pendingBytes=0`、`pendingText=0`；无结尾空行的 `data: tail` 被 `finish()` 刷出，多行 `data:` 合并为 `first\nsecond`。

同轮回归结果为：本地解码 168ms、普通请求 521ms、网络流 3362ms（3 块/177 字符）、CMark 142ms（2 token）。页面主线程 TID 13799，Worker/plugin TID 18803，CMark JNI TID 18825。完整测试方式、断言、编译路径、失败对照与截图哈希见上述独立结果文件。

本次只修改纯 UTS，没有 `.so`、Kotlin/Java 或原生 `config.json`。HBuilderX 明确提示自定义基座 2.1.4 已是最新并跳过更新，但设备返回了最终版本才新增的 `multilineEvent` 字段，证明纯 UTS 随应用调试内容更新生效。这个结论只覆盖已测的纯 UTS；当前工程流程中 `.so` 变化仍须重打自定义基座，Kotlin/Java 桥接和原生配置变化本轮没有单独做控制变量，不作一概而论。

## Worker 生产流式请求核心回归

新增纯 UTS `WorkerStreamRequest`，把 `enableChunked` POST、`RequestTask.onChunkReceived`、ArrayBuffer 字节统计、有状态 `SSEStreamDecoder` 和终态收敛封装在 Worker 所在线程。鉴权 token 仍由主线程按供应商配置取得，只把已经序列化的 URL、Authorization 和 JSON 请求体交给 Worker，避免把 `uniCloud.importObject` 回调与供应商闭包跨线程传递。

Android 真机向真实 event-stream 地址发起 POST，Worker 核心耗时 3425ms，收到 3 个网络分块、177 字节并解出 3 条 SSE JSON；首条为“这是第1条消息”，末条为“这是第3条消息”，终态来源为 `request-success`。页面主线程 TID 17254，执行 Worker/插件回调的 TID 23355，线程名 `pool-5-thread-1`。同轮另外五个回归场景全部成功，页面最终显示“全部完成”。

请求类通过递增 generation 丢弃旧请求或 abort 后迟到的 chunk、success、fail 和 complete 回调；HTTP 状态码先判断，再 flush SSE。本轮成功链路已真机验证，HTTP 失败和取消竞态仍保留为后续专项用例，不能写成已验收。完整命令、断言、原始终态、线程名、截图与哈希见独立结果文件。

本轮再次明确：HBuilderX 跳过自定义基座更新，而新增纯 UTS `stream-core` 场景已在设备执行，证明纯 UTS 生效。这里只能据实区分“纯 UTS 已验证”和“`.so` 仍需重打”；没有单独验证的 Kotlin/Java 桥接或原生配置不扩大结论。

恢复聊天页为启动页后再次全量构建，8 个页面编译成功，`ready in 33864ms`；应用主 Activity 为 `RESUMED`，截图确认超宽公式、完整流程图、分割线和后续正文正常。启动日志仍有基座既存的 `UniAppConfig` 反射探针异常，但应用继续完成绘制，本轮没有 Worker 类加载失败或崩溃。

## 完整机械链路可行性闸门

在接入 `RequestAiRunner` 之前，新增隔离的 `full-chain` 场景验证组合能力，而不是只根据各零件分别通过就开始改生产代码。真实 event-stream 返回 6 个网络分块、354 字节；Worker 逐段完成 SSE JSON、Markdown 累积、CMark 和最小 `rich/image` 渲染描述构建。6 次结果的 key 从 `0:heading` 稳定增长到 `0:heading...5:heading`，旧 key 始终保持不变。

针对此前“UTS 插件连续 success 回调页面不稳定”的风险，探针改为让插件保存最新不可变累计快照，页面每 50ms 按版本轮询。页面实际观察到 `1,2,3,4,5,6` 六个严格递增版本，没有缺失或重复；最终为 6 个 token、6 个描述，首尾中文正确。Worker/plugin TID 为 27392，CMark JNI TID 为 27432，均不是页面主线程 TID 23239。

这证明 Android 蒸汽模式下“真实网络 -> ArrayBuffer/SSE -> Markdown -> CMark -> 稳定渲染描述 -> 主线程多批消费”的机械链路可行，但 T01 仍不能进入生产实施：取消后立即重启、真实七牛/百炼响应格式与鉴权、`reasoning_content`、`[DONE]` 和长 Markdown 仍是实施前闸门。本阶段没有修改生产 `RequestAiRunner`。

不带 `--pagePath` 恢复正常入口后再次全量回归：8 个页面编译成功，`ready in 31038ms`；应用主 Activity 为 `topResumedActivity`，截图确认超宽公式、完整流程图、分割线和下方正文均正常显示，启动时间窗没有 AndroidRuntime 或 libc 致命记录。截图尺寸、哈希和检查命令保存在完整链路结果文件中。

## 取消重启与迟到结果隔离闸门

隔离探针让请求 A 先取得首批结果，页面轮询到 `A:1` 后发出带时间戳的 `restart-request`。Worker 收到控制后先对 A 调用 `abort()`，随即创建并启动独立标识的请求 B；B 完成后继续观察 1500ms 才做终态断言。三次冷启动均完整观察到 `A:1,B:1,B:2,B:3`，B 每次都是 3 块、177 字节且中文顺序正确；A 在取消后的应用层数据回调与成功/失败回调均为 0。

三轮页面到 Worker 的控制投递为 5ms、5ms、6ms，Worker 内 A 取消到 B 启动为 0ms、1ms、0ms。第三轮页面主线程 TID 为 28318，Worker/plugin TID 为 31126（`pool-5-thread-1`）；没有 `host-timeout`、隔离断言失败、类加载失败或崩溃。完整协议、逐轮数据、命令、线程及证据边界见独立结果文件。

该结果证明迟到 A 结果不会越过 `WorkerStreamRequest` 的 generation 防线污染应用层 B 结果，不等价于宣称 Android 网络栈没有产生被丢弃的底层回调。取消闸门通过后，T01 实施前只剩真实七牛/百炼 AI 的鉴权和协议闸门；本阶段仍未修改生产 `RequestAiRunner`。

取消探针完成后不带 `--pagePath` 再做正常入口回归：8 个页面编译成功，`ready in 28466ms`；应用主 Activity 为 `topResumedActivity`，截图确认公式、完整流程图、分割线和后续正文正常，致命错误扫描为空。

## iOS 兼容修改后的 Android 防回归

2026-07-31 为解决 Xcode 26.3 云打包生成 Swift 时 `Int` 与 `NSNumber` 不兼容、正则重载冲突和未处理异常，对公共 Worker UTS 源码增加显式 `number` 桥接，并把公式起始匹配改为 `RegExp.exec`。修改后在 Android 14 真机先以 `--cleanCache true --compile true` 强制重新生成 Kotlin，6 个页面编译成功，`ready in 50281ms`；生成代码保留 `Number` 转换、`exec` 和 `slice`，没有 UTS/Kotlin 类型错误。

随后运行保留的八场景自动探针：SSE 11 段/93 字节边界返回 2 个事件且无残留；流核心为 3 块/177 字节/3 事件；CMark 为 2 token；完整链路为 6 块/354 字节/6 事件/6 快照/6 token/6 描述，页面观察版本 `1..6` 严格递增；取消重启完整观察 `A:1,B:1,B:2,B:3`，A 迟到数据和终态均为 0。页面最终打印 `complete`，失败、超时、崩溃和类型异常扫描为空。

完整命令、设备、生成文件路径、逐项耗时和断言保存在 [`test-results/android-worker-ios-compat-regression-results.txt`](test-results/android-worker-ios-compat-regression-results.txt)。该结果只证明提交 `69528b3` 未破坏 Android；iOS 仍以 Xcode 26.3 云端编译结果为最终判据。

## 能力矩阵

| 能力 | 本次结果 | 结论 |
| --- | --- | --- |
| 页面直接调用 `uni.createWorker` | 编译明确提示 `.uvue` 暂不支持，只能由 UTS 插件创建 | 已确认边界 |
| Worker 清单配置 | 缺少 `manifest.json` 的 `"workers": "workers"` 时提示路径不存在 | 必需配置 |
| Worker 消息收发 | 页面、插件和 Worker 三层消息均到达 | 已确认 |
| `ArrayBuffer` + `TextDecoder` | 解码得到 `Worker` 并回传 | 已确认 |
| Worker 内 `uni.request` | 普通 GET 成功，最新耗时 388ms | 已确认 |
| `RequestTask.onChunkReceived` | 3 次回调，累计解码 177 字符 | 已确认 |
| Worker 生产流式请求核心 | 3 块/177 字节/3 条 SSE 事件，中文 JSON 无损 | 已确认，尚未接入生产聊天链路 |
| Worker 调用 `uni-cmark` | 声明插件依赖并导入 Android 平台入口后解析成功 | 已确认，应用层解决 |
| UTS 插件回调多次跨层转发 | 同一次注册中只有第一次事件稳定到达页面；最终探针改为插件记录全部事件、只回传一次终态 | 待框架确认语义 |
| 请求和 Worker 取消 | API 存在，本轮未验证回调顺序 | 待专项验证 |

## 诊断过程与无效中间结果

这些记录用于说明最终结论如何排除了测试工具和架构噪音。

1. 初始编译报 `Worker[workers/markdownWorkerTask.uts]路径不存在或未正确实现`。把 Worker 缩减为官方最小实现、改名后仍失败；对照官方示例发现根因是缺少 `manifest.json` 的 Worker 目录配置。
2. 加配置后仍命中旧文件名，报 `ENOENT ... workers/markdownWorkerProbe.uts`。`--cleanCache true` 没有清掉该插件缓存；只删除对应插件的三处生成目录后全量编译成功。
3. 只改 Worker 文件时，HBuilderX 曾输出 `uts插件[uni-ai-worker-probe]文件未发生变化，跳过编译`。同步修改桥接插件后才重新生成。因此 Worker 源文件是否参与插件缓存失效需要框架确认。
4. 页面直接调用 `uni.createWorker` 的对照编译明确失败：`当前平台 uvue 页面中暂不支持使用 uni.createWorker 创建 worker，目前仅 uts 插件中支持`。最终实现遵循官方示例，从 UTS 插件创建。
5. 使用普通函数保存页面回调时，Worker 和网络事件只到达插件日志，没有到达页面；改成官方示例同类的强类型 options callback 后才建立跨层桥接。
6. 同一个强类型回调连续转发多个 Worker 事件时，页面只稳定收到第一次。最终测试让插件记录所有原始事件，每个场景只向页面回传一次终态，排除了多次回调桥接对能力结果的干扰。

因此早期的“`uni.request` 不返回”是回调桥接与构建配置的假阴性，不能作为框架缺陷上报。

## `uni-cmark` 失败路径与成功路径

Worker 脚本尝试直接导入当前项目的 Markdown 插件：

```uts
import { md2json } from '@/uni_modules/uni-cmark'
import { ParseMdRes } from '@/uni_modules/uni-cmark/utssdk/interface.uts'
```

Android 编译失败：

```text
[plugin:uts] load_transformed failed
failed to resolve ../uni_modules/uni-cmark from
unpackage/dist/dev/.uvue/app-android/workers/markdownWorkerProbe.uts
index not found
```

这只能证明模块根别名在 Worker 编译单元中不可用，不能扩大成“Worker 不能使用 UTS 插件”。失败导入代码保存在不参与构建的 fixture 中，作为负面对照。

应用层成功方案包含两部分：

```json
"uni_modules": {
  "dependencies": ["uni-cmark"]
}
```

```uts
// #ifdef APP-ANDROID
import { md2json } from '../uni_modules/uni-cmark/utssdk/app-android/index.uts'
import { ParseMdRes } from '../uni_modules/uni-cmark/utssdk/interface.uts'
// #endif
```

Android 真机结果为 `cmark-success`，`tokenCount=2`、`firstType=heading`、`detail=""`。因此该问题不提交框架。

## 应用层可以承担的部分

能力已经闭环，下一阶段由应用层负责：

- 用 UTS 插件封装 Worker 的创建、消息监听和销毁。
- 已完成 Worker 内流式请求和 SSE 解码核心；继续把生产聊天请求接入，并把 Markdown 预处理、CMark 和渲染描述构建放在同一个 Worker 任务中。
- 每批输出带稳定 key、主题版本和请求版本的不可变渲染描述。
- 主线程按节流周期批量更新，不按每个 Markdown 标签逐个创建组件。
- 页面销毁或请求切换时同时执行 `RequestTask.abort()` 和 `Worker.terminate()`，并用请求版本丢弃迟到回调。
- 跨线程传递后不再修改共享数组和对象；需要修改时创建新批次，避免 Android 共享引用的数据竞争。

## 暂不上报的观察项

- Worker 源文件变化曾未触发创建方 UTS 插件重编译；当前通过修改插件依赖和全量构建解决，尚未形成生产阻塞。
- 同一次强类型 callback 连续转发多个事件时页面只稳定收到第一次；当前改为插件记录过程、每个场景只回传一次终态，满足批量结果设计。
- `RequestTask.abort()`、`Worker.terminate()` 与排队回调的顺序尚未专项验证；生产迁移时用请求版本丢弃迟到结果，不依赖隐含顺序。

以上均有应用层规避方式，当前不提交框架；只有生产链路仍能稳定复现且无法规避时再升级。

## 参考文档

- [uni.createWorker](https://doc.dcloud.net.cn/uni-app-x/api/create-worker.html)
- [uni.request / RequestTask](https://doc.dcloud.net.cn/uni-app-x/api/request.html)
- 本机官方示例：`hello-uni-app-x/pages/API/create-worker/uts-create-worker.uvue`
- 本机官方示例：`hello-uni-app-x/uni_modules/uts-worker/utssdk/index.uts`
- 本机官方示例：`hello-uni-app-x/pages/API/request/requestTask.uvue`
