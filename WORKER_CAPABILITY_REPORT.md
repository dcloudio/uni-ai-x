# Android 蒸汽模式 Worker 能力验证报告

## 结论

领导要求的目标链路是：

```text
Worker：uni.request -> onChunkReceived -> ArrayBuffer/TextDecoder -> SSE -> Markdown 预处理 -> CMark -> 渲染描述
主线程：接收批量渲染描述 -> 更新组件树
```

2026-07-30 Android 真机最终验证确认：Worker 内普通 `uni.request`、`RequestTask`、`onChunkReceived`、`ArrayBuffer` 和 `TextDecoder` 均可用。流式请求实际收到 3 个分块，累计解码 177 个字符。此前“`uni.request` 不返回”的结论是缺少 Worker 清单配置、旧编译缓存和跨层回调方式共同造成的无效中间结果，已撤销。

T01 仍未闭环，但当前只剩一个明确能力边界：Worker 脚本直接导入现有 `uni-cmark` UTS 插件时编译失败。需要框架开发工程师给出 Worker 调用项目内 UTS 原生插件的正式方式，或明确不支持时的替代架构。

## 保留的复现材料

- 页面：[`pages/repro-worker-capability/index.uvue`](pages/repro-worker-capability/index.uvue)
- Worker：[`workers/markdownWorkerTask.uts`](workers/markdownWorkerTask.uts)
- UTS 桥接插件：[`uni_modules/uni-ai-worker-probe`](uni_modules/uni-ai-worker-probe)
- CMark 编译失败样例：[`test-fixtures/worker-cmark-import-failure.uts.txt`](test-fixtures/worker-cmark-import-failure.uts.txt)
- 真机结果：[`test-results/android-worker-capability-results.txt`](test-results/android-worker-capability-results.txt)
- 真机截图：[`test-results/android-worker-capability.png`](test-results/android-worker-capability.png)

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
3. 页面依次执行 `local`、`request`、`stream`，每个场景使用新的 Worker，避免请求状态互相污染。
4. `local` 用 `Uint8Array([87,111,114,107,101,114])` 构造 ArrayBuffer，再用 `TextDecoder` 解码。
5. `request` 向 `https://request.dcloud.net.cn/api/http/method/get` 发起普通 GET，Worker 超时 8000ms，页面超时 12000ms。
6. `stream` 向 `https://request.dcloud.net.cn/api/http/contentType/eventStream?limit=3` 发起 `enableChunked: true` 的 POST，在 `onChunkReceived` 中逐块解码并累计数量和字符数。
7. 使用下列命令全量编译并运行：

```sh
/Applications/HBuilderX-Dev.app/Contents/MacOS/cli launch app-android \
  --project /Users/json/Desktop/code/uni-ai-x \
  --deviceId 192.168.2.5:5555 \
  --playground custom \
  --native-log true \
  --cleanCache true
```

8. 使用下列命令读取应用与 Worker 日志：

```sh
adb -s 192.168.2.5:5555 logcat -d -v threadtime | \
  rg 'WorkerCapabilityRepro|request-created|chunkCount|decodedLength'
```

9. 在开发机预检普通请求地址，排除服务端不可达：

```sh
curl -sS -o /dev/null \
  -w 'ordinary_http=%{http_code} total=%{time_total}s\n' \
  'https://request.dcloud.net.cn/api/http/method/get'
```

## 最终结果

HBuilderX 全量构建成功，`ready in 28286ms`。页面自动测试结果：

| 场景 | 页面结果 | 耗时 | 结果数据 |
| --- | --- | ---: | --- |
| local | `local` | 160ms | `textDecoder=Worker` |
| request | `request-success` | 422ms | 普通 GET 成功，`RequestTask` 已创建 |
| stream | `request-success` | 3481ms | `chunkCount=3`，`decodedLength=177` |

流式分块原始累计数据：

| 分块 | 累计解码字符数 |
| ---: | ---: |
| 1 | 59 |
| 2 | 118 |
| 3 | 177 |

页面最终打印 `[WorkerCapabilityRepro] complete`，没有 `host-timeout`。普通地址预检为 HTTP 200，耗时 0.130574s。应用日志没有 `AndroidRuntime`、`FATAL EXCEPTION` 或 `SIGABRT`；系统窗口管理器有一条与应用无关的 `ActivityRecordImpl` NPE，不计入应用异常。

把复现页移回 `pages.json` 末尾后又执行一次正常入口全量回归：8 个页面均编译成功，`ready in 27322ms`；设备顶层 Activity 为应用主 Activity，截图确认聊天页、公式、流程图和下方正文正常显示，异常扫描为空。

截图为 1440x3200 PNG，203213 字节，SHA-256：

```text
139dce9f575350fb00b814d19c6a91a84c1696a1aa1da4e9e00ba8f3d9e9acd6
```

## 能力矩阵

| 能力 | 本次结果 | 结论 |
| --- | --- | --- |
| 页面直接调用 `uni.createWorker` | 编译明确提示 `.uvue` 暂不支持，只能由 UTS 插件创建 | 已确认边界 |
| Worker 清单配置 | 缺少 `manifest.json` 的 `"workers": "workers"` 时提示路径不存在 | 必需配置 |
| Worker 消息收发 | 页面、插件和 Worker 三层消息均到达 | 已确认 |
| `ArrayBuffer` + `TextDecoder` | 解码得到 `Worker` 并回传 | 已确认 |
| Worker 内 `uni.request` | 普通 GET 成功，耗时 422ms | 已确认 |
| `RequestTask.onChunkReceived` | 3 次回调，累计解码 177 字符 | 已确认 |
| Worker 导入 `uni-cmark` | 编译期无法解析插件入口 | 待框架确认支持方式 |
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

## `uni-cmark` 编译证据

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

这只能证明“当前导入方式不可用”，不能扩大成“所有 UTS 插件都不能在 Worker 使用”。失败导入代码保存在不参与构建的 fixture 中，框架研发可直接复制到 Worker 文件复现。

## 应用层可以承担的部分

框架明确 `uni-cmark` 的 Worker 调用方式后，应用层负责：

- 用 UTS 插件封装 Worker 的创建、消息监听和销毁。
- 把 SSE 解码、Markdown 预处理、CMark 和渲染描述构建放在同一个 Worker 任务中。
- 每批输出带稳定 key、主题版本和请求版本的不可变渲染描述。
- 主线程按节流周期批量更新，不按每个 Markdown 标签逐个创建组件。
- 页面销毁或请求切换时同时执行 `RequestTask.abort()` 和 `Worker.terminate()`，并用请求版本丢弃迟到回调。
- 跨线程传递后不再修改共享数组和对象；需要修改时创建新批次，避免 Android 共享引用的数据竞争。

## 需要框架开发工程师确认

1. Worker 脚本应如何导入并调用项目内 `uni-cmark` 这类 UTS 原生插件？
2. 如果 Worker 设计上不能调用 UTS 插件，框架推荐如何保证“联网到 CMark 全部在同一子线程”？
3. Worker 源文件变化未触发其创建方 UTS 插件重编译，是否属于已知缓存问题？有无正式清理或依赖声明方式？
4. UTS 插件同一次强类型 callback 注册能否多次向 `.uvue` 页面回调？本次为何只有第一次稳定到达？
5. `RequestTask.abort()`、`Worker.terminate()` 与已经排队的回调之间是否有顺序保证？

## 参考文档

- [uni.createWorker](https://doc.dcloud.net.cn/uni-app-x/api/create-worker.html)
- [uni.request / RequestTask](https://doc.dcloud.net.cn/uni-app-x/api/request.html)
- 本机官方示例：`hello-uni-app-x/pages/API/create-worker/uts-create-worker.uvue`
- 本机官方示例：`hello-uni-app-x/uni_modules/uts-worker/utssdk/index.uts`
- 本机官方示例：`hello-uni-app-x/pages/API/request/requestTask.uvue`
