# Android 平台接入 libmark

修改日期：2026-09-22

## 一、背景与目标

Android 平台的 Markdown 解析从 cmark（Worker 内 snapshot：html/ast）切换到 libmark 流式解析，与鸿蒙链路对齐：Worker 内 libmark session、ops 增量 + 状态对象投递、主线程 schema 分派渲染、完成时 AST 持久化。mermaid、代码块、表格等沿用现有渲染组件（经 `libmark-ast.uts` 适配为现有 block 模型），其他平台（iOS/Web/微信小程序/鸿蒙）不受影响。

## 二、设计选择

### 2.1 架构对齐鸿蒙，传输按平台分叉

数据流与鸿蒙一致，但 Worker→主线程的承载形态按平台分叉：

| 维度 | 鸿蒙 | Android |
| --- | --- | --- |
| ops 承载 | `@Sendable LibmarkOpBatch`（harmonySendable 直发） | 普通对象批次（共享引用直发） |
| state 承载 | `@Sendable AiWorkerState` | 普通对象 |
| 接收方式 | Sendable 访问器函数 | UTSJSONObject 动态字段读取 |
| SSE 位置 | 主线程收流 | Worker 内直连（默认 provider）+ 主线程喂入（自定义 provider） |
| 收流节流 | 主线程 runner（100ms 窗口） | Worker 内（100ms 窗口，两条输入路径统一） |

选择理由：Android 没有 Sendable；官方文档说明 Android/iOS 主线程与 Worker 传输引用类型数据直接共享使用（不克隆），普通对象直发即可实现"无序列化"，无需引入额外机制。协议 tag 与字段保持与鸿蒙一致，消费端逻辑（runner/runtime）按平台宏隔离、语义共用。

### 2.2 无序列化：普通对象共享引用

- Worker 侧不经 `JSON.stringify`，直接 `postMessage` 普通 `UTSJSONObject`；主线程 runtime 直接存引用、按字段读取
- 约定：消息对象**发送后不再修改**（每次新建），单生产者单消费者，规避跨线程共享可变对象的并发问题
- 缓释：若运行时发现对象实际被克隆，协议仍然成立（只是失去无序列化收益），适配点集中在 runtime 收发层，可回退 JSON 字符串
- 边界：libmark 插件内部（`feedChunk` 返回值）的 JSON 属于 JNI 边界，与 Worker→主线程通道无关

### 2.3 协议：ops 批次与 state 对象

| 消息 | tag | 字段 | 用途 |
| --- | --- | --- | --- |
| ops 批次 | `libmark-op-batch` | requestVersion、ops[]（op/kind/content/index/unchanged） | 渲染增量，一次 feed 一条消息 |
| state | `ai-worker-state` | requestVersion、snapshotVersion、phase（snapshot/complete/error）、msgBody、thinkContent、统计、errCode/errMsg | 状态机 + 会话数据 |

主线程侧：runtime 接收后暂存（`pendingLibmarkOps` / `latestLibmarkState`），runner 沿用 50ms 轮询消费（`takeAiWorkerOps` / `readAiWorkerState` / `pollLibmarkState`），渲染与持久化完全复用鸿蒙链路。

### 2.4 snapshot 简化：不再生成 cmark html/ast

Android 与鸿蒙相同：`publishSnapshot`/`publishErrorSnapshot` 不再执行 preprocessor 与 `md2html`/`md2json`，只直发纯状态对象；Worker `entry()` 不再初始化 cmark（鸿蒙/Android 直接就绪）。渲染完全由 ops 驱动，其他平台保持 snapshotJson + cmark 链路不变。

### 2.5 SSE 收流节流放在 Worker 内

Android 的 SSE 在 Worker 内接收，节流实现于 Worker（100ms 窗口：空闲首条立即 feed、活跃期内合并、整窗口无数据退出活跃），两条输入路径 `handleSseEvent` 与 `appendExternalMarkdown` 统一走 `queueLibmarkContent`；`complete` 前 flush、`fail`/`cancel` 清理。鸿蒙的节流仍在主线程 runner（其 SSE 在主线程），两处节流语义一致。

### 2.6 Android 产物重建后同步

Android 产物不沿用旧构建，由上游构建链重建后同步：

```
scripts/build-android.ps1 → native/prepare-lib.ps1 -Platform android → native/build-android.ps1
```

确保 `libmark-full.so`（5130256 字节）包含最新的 pmatrix 竖直定界符拉伸修复；`libmark_bridge.so` 重新编译并通过 NEEDED 门禁；仅 arm64-v8a。

### 2.7 abi 收窄与运行前提

`manifest.json` 的 `app-android.distribute.abiFilters` 由 `["armeabi-v7a", "arm64-v8a"]` 收窄为 `["arm64-v8a"]`（libmark 仅提供 arm64-v8a）。插件带原生 so，运行到标准基座时原生库不生效，需自定义基座；`minSdkVersion` 为 24（Android 7.0+）。

### 2.8 Worker 编译兼容修复

- `onMessage(message: ESObject)` → `any`：`ESObject` 仅在鸿蒙可用，鸿蒙分支内改用 `message as ESObject`
- `event!.ops` → 显式类型转换：Android 后端对非空断言的解析异常
- `appendLibmarkOps` 参数类型放宽为 `LibmarkEvent | null | undefined`：鸿蒙/Android 插件分别返回 `undefined`/`null`

## 三、改动清单

| 模块 | 文件 | 内容 |
| --- | --- | --- |
| 产物 | `uni_modules/libmark/utssdk/app-android/` | `index.uts`、`LibmarkBridge.kt`、`config.json`、`libs/arm64-v8a/*.so` |
| Worker | `workers/aiRequestWorkerTask.uts` | libmark 会话/发送/收尾逻辑扩展到 Android、Worker 内节流、state 直发、编译兼容修复 |
| runtime | `uni-ai-worker-runtime/utssdk/index.uts` | 接收 ops 批次与 state、接口扩展、清理点 |
| SDK | `uni-ai-x/sdk/requestAiRunner.uts`、`sdk/index.uts` | 平台宏扩展、`pollLibmarkState` 接入 |
| UI | `uni-ai-x/components/uni-ai-chat.uvue` | libmark blocks 优先渲染 + 旧 schema 分派 |
| demo | `demo/markdown/markdown-demo-runner.uts` | 状态对象 + ops 转发 |
| 配置 | `manifest.json`、`uni_modules/libmark/package.json` | abiFilters 收窄、补 Android 声明 |

`libmark-ast.uts`、`libmark-stream-store.uts`、`markdown-text.uts` 平台无关，零改动复用。

## 四、验证结果

- `launch app-android --compile true` 编译通过（含 `--cleanCache true` 全量编译）
- `launch app-harmony --compile true` 回归编译通过（UTS 编译完毕、HAP 制作成功）
- 运行时行为（共享对象传输、双路径渲染、节流时序）需自定义基座真机验证
