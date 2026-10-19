# 上游 uni-ai-md 更名同步（2026-10-19）

## 任务目标

同步上游 `libmark` 仓库最近一次提交（`a20ac7d`，产品全面更名为 `uni-ai-md`）：
更新原生构建产物与桥接层，调整本项目 UTS 插件、Worker 和页面侧接入代码。

## 实施方案

### 原生产物与桥接层

- 完整引擎库改用 `libuni-ai-md.so`，桥接库改用 `libuni-ai-md_bridge.so`；
  HarmonyOS 交付 `uni-ai-md.har`（arm64-v8a / x86_64）。
- 公开头文件目录改为 `include/uni-ai-md/`；桥接源码改名为
  `native/android/uni_ai_md_bridge_jni.cpp`、`native/harmony/uni_ai_md_bridge.cpp/.h`。
- 构建脚本、CMake 工程、HAR 骨架和 `native/README.md` 切换到新产物名；
  仓库路径环境变量改为 `UNI_AI_MD_REPO`。
- 修正上游机械改名的遗留问题：CMake 输出名统一为 `libuni-ai-md_bridge`、
  Harmony N-API 模块名与 so 文件名一致、JNI 符号与 Kotlin 包名一致、
  `System.loadLibrary` 使用实际 so 名。

### UTS 插件与接入代码

- 插件目录、`package.json` 的 `id` 与 `displayName` 均为 `uni-ai-md`。
- 对外类型改为 `UniAiMdOp` / `UniAiMdEvent`，Kotlin 包装类改为
  `UniAiMdBridge`，包名为 `uts.sdk.modules.uniAiMd`。
- 平台入口内直接定义事件类型，避免仅存在于 `interface.uts` 的类型在平台编译时
  被擦除（UTS 已知问题 error3）。
- Worker 从平台入口导入插件；`uni-ai-worker-runtime` 的依赖声明由
  `libmark` 改为 `uni-ai-md`，使 Worker Kotlin 编译能正确带入插件及其手写
  Kotlin 类。
- 更新 `workers`、`uni-ai-x`、`uni-ai-worker`、`demo/markdown` 与测试脚本中的
  插件路径和类型名。

### 关于含连字符的插件 id

UTS 插件 id 本身允许连字符，编译器会将其 camelize 成合法 Kotlin 包名：
`uni-ai-md` 对应 `uts.sdk.modules.uniAiMd`，`uni-highlight` 对应
`uts.sdk.modules.uniHighlight`。因此其它含连字符的插件可以正常工作。

Worker 直接调用该插件时，`uni-ai-worker-runtime` 的 `uni_modules.dependencies`
必须声明 `uni-ai-md`。声明后 Worker 会把插件作为依赖编译，并带入手写
`UniAiMdBridge.kt`；否则 Worker 会按源码直接导入平台入口，导致插件未同步或
手写 Kotlin 类未进入 Kotlin 源集。当前目录名、插件 id 与依赖声明均已统一为
`uni-ai-md`。

## 执行结果

- `native/prepare-lib.ps1` 同步新头文件与 3 份 `libuni-ai-md.so`。
- `native/build-android.ps1`、`native/build-harmony.ps1` 构建成功：
  - Android 桥接库 NEEDED：`libuni-ai-md.so`、`libm.so`、`libdl.so`、`libc.so`；
  - Harmony 双 ABI 桥接库 NEEDED：`libuni-ai-md.so`、`libace_napi.z.so`、
    `libc++_shared.so`、`libc.so`。
- Android JNI 导出符号为
  `Java_uts_sdk_modules_uniAiMd_UniAiMdBridge_native*`。
- HBuilderX 编译验证：
  - App-Android clean 编译成功；
  - App-Harmony clean 编译成功，运行包制作完成。
- `tests/check-markdown-static.cjs`：107 个文件 × 5 平台，0 错误。
- `node --test tests/*.test.mjs`：60/68 通过；8 个失败在改动前的 HEAD 基线上
  同样失败（测试运行环境与既有用例问题，与本次更名无关）。
