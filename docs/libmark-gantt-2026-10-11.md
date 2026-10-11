# libmark 产物同步与甘特图接入（2026-10-11）

## 任务目标

上游 libmark 仓库（`D:\dev\dcloud\libmark`）在 `c4f8394`（集合字体选面）之后又推进了
甘特图能力，最新提交为 `199fa24 在两个演示项目中接入甘特图并修复重复渲染`。本次同步
`uni_modules/libmark` 的构建产物，并把甘特图接入 uni-ai-x。

上游本次相关提交：

- `45512ee` 修复 Mermaid 背景色配置和 HarmonyOS smoke 架构检测；
- `bf09064` 新增甘特图对比报表与验证夹具；
- `e54a6b5` 按 Mermaid.js 逻辑实现甘特图并接入对比报表——新增
  `plugins/mermaid/gantt/*`（parser / layout / renderer）与 `libmark_gantt_diagram_register`，
  mermaid 插件在运行时注册 `gantt` 图表类型；同一提交修复了 core 在 progressive tail
  提交时丢弃 secondary DATA 的问题；
- `199fa24` 在两个演示项目中接入甘特图并修复重复渲染。

关键行为变化：修复前，顶层块以未闭合 tail（如流式中的 ` ```mermaid ` fence）起步再提交时，
core 的 progressive `commit_tail` 只交付 HTML 主输出，伴随的 DATA 信封被丢弃；修复后
HTML 与 DATA 同时交付。解析成功前 `gantt` 只会回退为代码块，现由新版插件生成 SVG。

## 实施方案

### 1. 重新构建上游产物（libmark 仓库）

```powershell
# Android（NDK 29.0.14206865）
$env:ANDROID_NDK_HOME='D:\ProgramFiles\Android\Sdk\ndk\29.0.14206865'
pwsh -File scripts/build-android.ps1      # 门禁通过（复核，产物已最新）
pwsh -File scripts/build-ohos.ps1         # arm64-v8a + x86_64，门禁通过
```

### 2. 同步产物到 uni-ai-x

```powershell
pwsh -File native/prepare-lib.ps1 -RepoRoot D:\dev\dcloud\libmark            # Harmony 双 ABI
pwsh -File native/prepare-lib.ps1 -Platform android -RepoRoot D:\dev\dcloud\libmark
pwsh -File native/build-harmony.ps1       # 重新打包 HAR
pwsh -File native/build-android.ps1       # 重新复制 Android so
```

| 产物 | 路径 | SHA-256 前缀 |
| --- | --- | --- |
| Android 单库 | `utssdk/app-android/libs/arm64-v8a/libmark-full.so` | `8BBEADA0…` |
| Android JNI 桥接库（未变） | `utssdk/app-android/libs/arm64-v8a/libmark_bridge.so` | `4A10096C…` |
| HarmonyOS HAR（双 ABI） | `utssdk/app-harmony/libs/libmark.har` | `BEFB3CCA…` |

桥接层源码未变，Android/Harmony 桥接库的字节不变；变化集中在引擎 `libmark-full.so`
（含 gantt 渲染与 progressive tail DATA 修复）与重新打包的 HAR。

### 3. 甘特图接入

接入方式与上游 `demo/uni-app-x` 对齐，但业务侧无需为图表类型特判：

- **渲染管线本就与图表类型解耦**。`LibmarkHtmlStreamAdapter`（
  `uni_modules/uni-ai-worker/utssdk/libmark-html.uts`）只按 `kind`/`op` 处理 HTML 通道与
  DATA 信封：HTML 内联 `<svg>` 转成图片块，`{"type":"mermaid",...}` 的 DATA 用来把同块
  的图片条目升级为带 `source` 的 `mermaid` 条目。稳定块与流式提交都遵循该规则，因此
  `gantt` 与 `flowchart` / `sequenceDiagram` / `stateDiagram-v2` 走同一路径，无需白名单。
- **原生 SVG 优先，WebView 兜底**。`mermaid-presentation.uts` 在 `svgSource` 非空时直接
  展示原生 SVG；为空（旧库或解析失败）时回退到 WebView 的 `mermaid.min.js`，该脚本本就
  包含 gantt 渲染。
- **DATA 与 HTML 同行交付时的去重**。修复后 HTML 与伴随 DATA 同时到达，适配器用 DATA
  替换同一块的 SVG 图片条目，只保留一个 `mermaid` 条目，避免重复显示。
- **演示场景**。`demo/markdown/demo-markdown.uts` 新增 `ganttBlock`（覆盖多前置任务依赖、
  周末排除、done/active/crit 与 milestone），并在 `createDemoMarkdownBlock` 分派；
  `demo/markdown/demo-chat.uts` 新增“甘特图”场景项。完整 Markdown 示例中的甘特图
  （`testMarkdownText.uts`）沿用同一生成路径。

## 执行结果

### 产物构建门禁

- Android：AArch64 ELF、NEEDED 白名单（libc/libdl/libm）、导出符号集合全部通过；
- HarmonyOS：arm64-v8a 与 x86_64 的 ELF 架构、NEEDED（仅 libc.so）、导出符号集合全部通过；
  设备 smoke 因当前无设备记 `PENDING`；
- 引擎端到端：上游 host `mermaid_end_to_end_test.exe`（含
  `test_gantt_fixtures_all_channels` 与 gantt 的 `progressive_tail_delivers_plugin_data`）
  退出码 0。

### 测试与静态检查

- `node --test tests/libmark-stream.test.mjs`：6 项通过，新增“Gantt native SVG absorbs the
  paired DATA envelope instead of rendering twice”，验证稳定块下 HTML `<svg>` 与伴随 DATA
  合并为单个 `mermaid` 条目（保留 `source` 与尺寸，不重复）；
- `node --test tests/libmark-stream.test.mjs tests/code-presentation.test.mjs
  tests/mermaid-presentation.test.mjs`：22 项通过；
- `node tests/check-markdown-static.cjs` 与 Android/Harmony 真机渲染复核见后续验证。

### 遗留事项

- Android 侧本次改了 `libmark-full.so`，需要重新制作自定义基座后才能做真机运行时验证；
- HarmonyOS 侧需要安装新 HAP；两侧设备运行时验证均记为 `PENDING`；
- 甘特图的原生渲染能力已在引擎端到端测试中确认，设备上的最终视觉与交互验证仍待重建基座后进行。
