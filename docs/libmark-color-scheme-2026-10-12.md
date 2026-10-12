# libmark 配色接入（2026-10-12）

## 任务目标

上游 libmark 仓库（`D:\dev\DOM2-dev\libmark`）最新提交 `cd21307 插件与两个示例接入系统
深浅色配色` 为原生插件增加了宿主配色能力，本次同步构建产物并参考其 `demo/uni-app-x`
的做法把配色接入 uni-ai-x。

上游本次相关提交：

- `cd21307`：`include/libmark/plugin.h` 新增 `libmark_color_scheme`（浅色 0 / 深色 1）；
  math 选项追加 `color_scheme` 与 `color`（公式墨迹），mermaid 选项追加 `color_scheme`，
  两个插件各自按深浅色切换默认前景色；画布底色只由宿主显式给出（默认透明），
  `createSession` 增加 `darkMode` 与 `background` 两个参数透传；
- 该提交顺带修复 flowchart 标签从不套用主题文字色的问题（深色底上原本不可见）。

本项目现状：桥接源码与 UTS 封装停留在甘特图时期的基线（无配色参数），mermaid 底色
硬编码亮灰 `#f5f5f5`、math 无底色；libmark 解析会话在 Worker 中创建，主题信息未传递。

## 实施方案

### 1. 重新构建上游产物（libmark 仓库）

```powershell
pwsh -File scripts/build-ohos.ps1         # arm64-v8a + x86_64，门禁通过
pwsh -File scripts/build-android.ps1      # arm64-v8a（NDK 29.0.14206865），门禁通过
```

### 2. 同步产物并重编桥接层（uni-ai-x）

```powershell
pwsh -File native/prepare-lib.ps1 -RepoRoot D:\dev\DOM2-dev\libmark
pwsh -File native/prepare-lib.ps1 -Platform android -RepoRoot D:\dev\DOM2-dev\libmark
pwsh -File native/build-harmony.ps1       # 重编双 ABI 桥接并重打 HAR
pwsh -File native/build-android.ps1       # 重编 JNI 桥接并复制 so
```

头文件同步包含新版 `include/libmark/plugin.h`、`math_plugin.h`、`mermaid_plugin.h`。

桥接源码 `native/android/libmark_bridge_jni.cpp`、`native/harmony/libmark_bridge.cpp`
（含 `.h`）按上游 `demo/uni-app-x/native` 最新版更新，与上游逐字节一致：

- `createSession(mode, locales, darkMode, background)` 增加两个参数；
- 新增 `NormalizePluginBackground`（只接受 `#rrggbb`，否则按 `#f5f5f5` 兜底），
  Harmony 侧新增 `ReadBoolArg`（非布尔按浅色处理）；
- mermaid 与 math 的 `options` 都设置 `color_scheme`，底色都改由 `background` 参数给出
  （math 由原透明改为宿主指定底色）。

| 产物 | 路径 | SHA-256 前缀 |
| --- | --- | --- |
| Android 引擎 | `utssdk/app-android/libs/arm64-v8a/libmark-full.so` | `280FA1E4…` |
| Android 桥接 | `utssdk/app-android/libs/arm64-v8a/libmark_bridge.so` | `0E499DCA…` |
| HarmonyOS HAR（双 ABI） | `utssdk/app-harmony/libs/libmark.har` | `C99FAF32…` |

### 3. UTS 封装对齐 demo

- `utssdk/app-android/LibmarkBridge.kt`：`createSession(mode, languageTags, darkMode, background)`；
- `utssdk/app-android/index.uts`、`app-harmony/index.uts`：
  `createSession(mode?, languageTags?, darkMode?, background?)`。

### 4. 解析会话配色贯通（参考 demo 的参数透传方式）

libmark 会话在解析 Worker 中创建，主题由主线程按当前 UI 主题随消息携带：

- Worker 协议（`uni-ai-worker-runtime`）：`AiWorkerStartOptions`、
  `AiWorkerMarkdownStartOptions`、`AiWorkerRebuildRequest` 增加 `darkMode`/`background`；
  `postStart`、`postMarkdownStart`、`postRebuildRequest` 透传，
  `requestAiWorkerMarkdownRebuild` 签名增加两个参数；
- 解析 Worker（`workers/aiRequestWorkerTask.uts`）：保存启动/重建消息里的配色，
  `ensureLibmarkSession` 与 `rebuildMarkdown` 创建会话时传给插件；
- 主线程：
  - `uni-ai-x/sdk/requestAiRunner.uts`：`RequestAiStartOptions` 增加字段，
    Android 直连路径与 Markdown 流路径都透传；
  - `uni-ai-x/sdk/index.uts` 的 `answerQuestion` 按 `uiTheme.value` 传参；
  - `uni-ai-x/sdk/libmark-stream-store.uts` 的 `libmarkStreamRequestRebuild` 按模块内
    当前展示主题传参；
  - `demo/markdown/markdown-demo-runner.uts` 同步传参；
- 新增 `uni-ai-x/sdk/plugin-theme.uts` 统一定义插件画布底色：浅色 `#ffffff`、
  深色 `#25282c`（与 webview 重渲染 mermaid/math 的底色、消息卡片底色一致，
  不使用 demo 调色板的 `#f5f5f5/#1f2937`）。

最终绘制仍由展示层按主题重渲染（webview + 主题化 SVG 缓存），libmark 侧配色使解析
中间态 SVG（如行内公式在 webview 替换前）与主题保持一致。

### 5. 附带修复：Android Kotlin 编译失败

验证 Android 编译时发现既有提交 `f36ff11`（修 iOS 自定义基座编译）为 Swift 数值桥接
引入的 `Number(...)` 在 Kotlin 上非法（`Number` 是抽象类），导致 Android 整项目编译
失败。按 UTS 文档与项目内既有用法（`sse.uts`）改为平台条件编译：

- Android：`Number.from(...)`；
- 其他平台：保留 `Number(...)`（Harmony/JS 与 iOS/Swift 均合法）。

涉及 `uni-ai-worker` 的 `stream-request.uts`、`markdown-html.uts`、`libmark-html.uts`
共 7 处。

## 执行结果

### 产物门禁

- 上游 HarmonyOS：arm64-v8a 与 x86_64 的 ELF 架构、NEEDED（仅 libc.so）、导出符号集合
  全部通过；Android：AArch64、NEEDED 白名单、导出符号集合全部通过；
- 本项目桥接重编通过：Harmony 双 ABI NEEDED 为 `libmark-full.so`、`libace_napi.z.so`、
  `libc++_shared.so`、`libc.so`；Android NEEDED 为 `libmark-full.so` + libc/libdl/libm；
- 插件目录内 `libmark_bridge.so`、`libmark-full.so` 与构建输出哈希一致；HAR 内含
  `arm64-v8a`、`x86_64` 两套桥接库与引擎库。

### 编译验证（HBuilderX 5.33 蒸汽模式 CLI）

- `launch app-android --compile true`：编译成功（仅既有告警与 libmark 需自定义基座的提示）；
- `launch app-harmony --compile true`：编译生成鸿蒙工程并制作运行包成功；
- 修复前后的 Harmony 跨平台差异（`Number.from` 与 `Number(...)`）由条件编译隔离，
  两端各自通过。

### 遗留事项

- Android 改动含原生库与 Kotlin/UTS，需要重新制作自定义基座后做真机验证；
- HarmonyOS 需要安装新 HAP；
- 两侧真机深浅色观感验证记 `PENDING`（上游 demo 同样标注为未实机验证）。
