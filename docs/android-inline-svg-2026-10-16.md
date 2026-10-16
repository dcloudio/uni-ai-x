# Android 行内公式接入内联 SVG 交付（2026-10-16）

## 任务目标

同步上游 libmark 仓库提交 `1fd5d95`（Android 公式改用内联 SVG 交付）：Android 平台由 libmark 直接把行内公式以 HTML 内联 `<svg>` 片段写入输出，取代此前的 `<img src="data:image/svg+xml;base64,...">` 交付，使 Android 的 rich-text 不再经过图片加载与落盘链路即可渲染行内公式。

## 实施方案

### 原生桥接层

- `native/android/libmark_bridge_jni.cpp`：创建 session 时把 `math_options.inline_output` 由 `LIBMARK_MATH_INLINE_OUTPUT_IMAGE` 改为 `LIBMARK_MATH_INLINE_OUTPUT_SVG`（与上游改动一致）。
- 构建准备：先执行 `native/prepare-lib.ps1 -Platform android -RepoRoot <libmark 仓库>` 同步公开头文件与 `libmark-full.so`，再执行 `native/build-android.ps1` 重编 JNI 桥接库；产物更新到 `uni_modules/libmark/utssdk/app-android/libs/arm64-v8a/`（`libmark_bridge.so` 更新，引擎 `libmark-full.so` 内容无变化）。

### 业务层（UTS）

- `uni_modules/uni-ai-x/sdk/inline-math-presentation.uts`：`prepareNativeInlineMathBlocks` 的条件编译由 `APP-ANDROID || APP-HARMONY` 收窄为 `APP-HARMONY`。Android 不再输出公式 `<img>`，无需落盘替换；Harmony 桥接仍输出 `<img>` data URI，本地 SVG 文件路径方案保留。
- `uni_modules/uni-ai-x/sdk/libmark-stream-store.uts`：删除 Android 增量展示路径（`sendAndroidEntry`）中对 `prepareNativeInlineMathBlocks` 的调用；`refreshEntry` 中的调用保留（Harmony 流式路径使用）。
- 快照链路无需改动：资产持久化只处理 `<img src>`，内联 `<svg>` 随 HTML 文本原样保存与恢复。

## 执行结果

- 桥接库编译成功：`libmark_bridge.so` 的 NEEDED 依赖为 `libmark-full.so`，产物已更新。
- 多平台静态检查：107 个文件、5 个平台、0 错误。
- Node 测试：与本次改动相关的 `render-snapshot`、`code-presentation` 等用例通过；其余既有失败（`task-list`、`table-presentation` 等文件的 `Number.from` 等环境问题）经改动前后对照确认与本次无关。
- Android 编译验证通过，编译器按预期提示「uts 插件 [libmark] 依赖的原生配置或三方 SDK 发生变化，需要重新打包自定义基座」。

## 注意事项

- 本次改动涉及 uts 插件原生库（`libmark_bridge.so`），需重新制作自定义调试基座后才会生效。
- 行内公式的最终显示效果取决于 rich-text 对内联 `<svg>` 的渲染支持情况，以平台版本能力为准。
