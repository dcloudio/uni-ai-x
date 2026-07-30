# Android 蒸汽模式 Worker 能力验证报告

## 结论

领导要求的目标链路是：

```text
Worker：uni.request -> onChunkReceived -> ArrayBuffer/TextDecoder -> SSE -> Markdown 预处理 -> CMark -> 渲染描述
主线程：接收批量渲染描述 -> 更新组件树
```

当前 HBuilderX 5.24 Android 蒸汽模式还不能直接据此开始应用层重构，原因有两项：

1. 官方文档说明 Worker 可调用 `uni.request`，但 Android 真机探针在 Worker 内调用 `uni.request` 后没有返回 `RequestTask`，也没有触发成功、失败或超时回调，调用后的代码不再执行。
2. Worker 脚本直接导入现有 `uni-cmark` UTS 插件时编译失败，当前没有得到可用的插件导入路径。

因此 T01/T02 暂时保持未完成。先由框架开发工程师确认或修复以上能力，再选择真实 Worker 方案；不应在能力未确认时把请求、解析和渲染职责拆成一套无法闭环的实现。

## 验证环境

- HBuilderX：`5.24.2026072917-dev`
- 编译器：uni-app x 5.24，蒸汽模式，字节码视图层
- 平台：Android 真机
- 包名：`io.dcloud.ai.x`
- 验证日期：2026-07-30

## 能力矩阵

| 能力 | 官方说明 | 本次结果 | 结论 |
| --- | --- | --- | --- |
| 页面直接调用 `uni.createWorker` | Android 蒸汽模式 `.uvue` 不能直接调用，需由 UTS 插件创建 | 按官方示例使用 UTS 插件后 Worker 可启动 | 已确认边界 |
| Worker 消息收发 | 支持 `postMessage`、`onMessage`、`terminate` | 真机收到 Worker 本地结果 | 已确认 |
| `ArrayBuffer` + `TextDecoder` | Worker 可使用非 UI API 和基础数据处理能力 | `Uint8Array` 解码得到 `Worker` 并回传 | 已确认 |
| Worker 内 `uni.request` | 官方文档列为可用示例，回调应在 Worker 线程执行 | 调用处不返回，回调均未触发 | 与文档不一致，待框架确认 |
| `onChunkReceived` 流式回调 | `RequestTask` 支持 | 因 `uni.request` 调用未返回，无法进入监听阶段 | 未确认 |
| Worker 导入 `uni-cmark` | 文档未给出当前项目此类插件的可用示例 | 编译期无法解析插件入口 | 待框架确认支持方式 |
| Android 消息对象传递 | 官方说明 Android/iOS 引用类型直接共享内存，不默认克隆 | 本次未做大对象压测 | 按官方边界设计，必须避免跨线程并发修改 |
| 请求和 Worker 取消 | `RequestTask.abort()`、`Worker.terminate()` 可用 | 未进入可取消的请求状态 | API 已有，完整链路仍待验证 |

## `uni.request` 真机证据

探针先在 Worker 内完成本地解码并回传，再安排 5 秒定时消息，随后调用单个普通 GET 请求：

```uts
this.postMessage({ phase: 'local', textDecoder: decoded } as UTSJSONObject)

setTimeout(() => {
  this.postMessage({ phase: 'watchdog' } as UTSJSONObject)
}, 5000)

this.requestTask = uni.request({
  url: 'https://request.dcloud.net.cn/api/http/method/get',
  method: 'GET',
  timeout: 15000,
  success: () => this.postMessage({ phase: 'request-success' } as UTSJSONObject),
  fail: (error) => this.postMessage({
    phase: 'request-fail',
    detail: error.errMsg
  } as UTSJSONObject)
})

this.postMessage({ phase: 'request-created' } as UTSJSONObject)
```

真机只收到：

```json
{"phase":"local","textDecoder":"Worker"}
```

以下消息均未收到：

- `request-created`
- `request-success`
- `request-fail`
- `watchdog`

补充排查结果：

- 使用 `--cleanCache true` 全量编译、同步并重启应用，确认设备加载的是更新后的 Worker 文件。
- Android 日志显示请求调用时创建了网络 socket，但没有 Java/Kotlin 崩溃栈。
- 同一测试地址从开发机访问返回 HTTP 200，不能用服务端不可用解释调用后的代码不执行。
- 先后测试了普通 GET、流式 POST，以及缩减为单个 GET；现象一致。

需要框架确认：这是当前开发版的已知限制、Worker 内请求实现缺陷，还是 Worker 调用 `uni.request` 还需要未写入文档的初始化方式。

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

这只能证明“当前导入方式不可用”，不能扩大成“所有 UTS 插件都不能在 Worker 使用”。需要框架给出 Worker 调用项目内 UTS 原生插件的正式支持方式；如果设计上不支持，也需要明确替代架构。

## 应用层可以承担的部分

框架能力闭环后，应用层负责：

- 用 UTS 插件封装 Worker 的创建、消息监听和销毁。
- 把 SSE 解码、Markdown 预处理、CMark 和渲染描述构建放在同一个 Worker 任务中。
- 每批输出带稳定 key、主题版本和请求版本的不可变渲染描述。
- 主线程按节流周期批量更新，不按每个 Markdown 标签逐个创建组件。
- 页面销毁或请求切换时同时执行 `RequestTask.abort()` 和 `Worker.terminate()`，并用请求版本丢弃迟到回调。
- 跨线程传递后不再修改共享数组和对象；需要修改时创建新批次，避免 Android 共享引用的数据竞争。

## 需要框架开发工程师确认

1. 为什么 Android 蒸汽模式 Worker 内 `uni.request` 没有返回，且所有回调均不触发？
2. `onChunkReceived` 在 Worker 内是否有已验证的 Android 示例和最低 HBuilderX 版本？
3. Worker 脚本应如何导入并调用项目内 `uni-cmark` 这类 UTS 原生插件？
4. 如果 Worker 设计上不能调用 UTS 插件，框架推荐如何保证“联网到 CMark 全部在同一子线程”的链路？
5. `RequestTask.abort()`、`Worker.terminate()` 与已经排队的回调之间是否有顺序保证？

## 参考文档

- [uni.createWorker](https://doc.dcloud.net.cn/uni-app-x/api/create-worker.html)
- [uni.request / RequestTask](https://doc.dcloud.net.cn/uni-app-x/api/request.html)
- 本机官方示例：`hello-uni-app-x/pages/API/create-worker/uts-create-worker.uvue`
- 本机官方示例：`hello-uni-app-x/uni_modules/uts-worker/utssdk/index.uts`
- 本机官方示例：`hello-uni-app-x/pages/API/request/requestTask.uvue`
