# libmark 产物同步与桥接层调整（2026-10-10）

## 任务目标

上游 libmark 仓库（`D:\dev\DOM2-dev\libmark`）更新到最新提交
`c4f8394 集合字体按语言选面，Android 接入系统字体引擎` 后，同步更新 uni-ai-x 中
`uni_modules/libmark` 的构建产物，并把桥接层代码调整到与新产物一致的接口。

上游该提交的主要内容：

- 新增 `libmark_render_select_face` 公开 API：集合字体（ttc/otc）按内容语言在
  SC/TC/JP/KR/HK face 中选面，匹配不到回落 index 0；
- Android 桥接新增系统字体引擎接入：Android 10+ 经 `dlsym` 调用 `AFontMatcher`
  （按 `android-24` 构建），取「文件 + 集合内 face 序号」，失败退回候选字体列表；
- HarmonyOS 桥接按语言偏好选面；math 插件接收同一份文本字体；
- 桥接接口变化：`createSession(mode?, languageTags?)` 新增语言偏好参数
  （BCP-47，内容语言在前，Android 由 Kotlin 侧追加设备语言兜底）。

## 实施方案

### 1. 重新构建上游产物（libmark 仓库）

上游 demo/uni-app-x 目录内的既有产物（11:59 构建）早于该提交（14:02），
必须重新构建：

```powershell
# Android（NDK 29.0.14206865）
$env:ANDROID_NDK_HOME='D:\ProgramFiles\AndroidSDK\ndk\29.0.14206865'
pwsh -File scripts/build-android.ps1
pwsh -File demo/uni-app-x/native/prepare-lib.ps1 -Platform android
pwsh -File demo/uni-app-x/native/build-android.ps1

# HarmonyOS（DevEco Native SDK）
pwsh -File scripts/build-ohos.ps1
pwsh -File demo/uni-app-x/native/prepare-lib.ps1
pwsh -File demo/uni-app-x/native/build-harmony.ps1
```

### 2. 同步产物到 uni-ai-x

| 产物 | 路径 | SHA-256 |
| --- | --- | --- |
| Android JNI 桥接库 | `utssdk/app-android/libs/arm64-v8a/libmark_bridge.so` | `2F299072…3F92F` |
| Android 单库 | `utssdk/app-android/libs/arm64-v8a/libmark-full.so` | `F579CB96…38A594` |
| HarmonyOS HAR（双 ABI） | `utssdk/app-harmony/libs/libmark.har` | `AF3C6541…73A276` |

HAR 内含 arm64-v8a / x86_64 两套 `libmark_bridge.so` + `libmark-full.so`，
NEEDED 为 `libmark-full.so` / `libace_napi.z.so` / `libc++_shared.so` / `libc.so`。

### 3. 桥接层调整

- `utssdk/app-android/index.uts`：`createSession(mode?, languageTags?)`，
  languageTags 透传给 Kotlin；
- `utssdk/app-android/LibmarkBridge.kt`：新增 `LocaleList` 接入与
  `composeLocales()`（内容语言在前、设备语言在后），
  `nativeCreateSession(mode, locales)` 签名对齐新 JNI；
- `utssdk/app-harmony/index.uts`：`createSession(mode?, languageTags?)` 透传给
  N-API 桥接；
- `workers/aiRequestWorkerTask.uts`：
  - 两处 `createSession('html')` 改为 `createSession('html', null)`——
    UTS 可选参数编译到 Kotlin 后无默认值，跨文件调用必须显式全参；
    null 表示不指定内容语言，由桥接按设备语言兜底；
  - `sourceTail.feed/finish(feedChunk/finishSession(...))` 两处补 `?? null`——
    HarmonyOS 桥接返回 `LibmarkEvent | undefined`，而 tail 参数类型为
    `LibmarkEvent | null`，写法归一后两平台类型契约一致（运行时行为不变）。

## 执行结果

### 产物构建门禁

- Android：AArch64 ELF、NEEDED 白名单（libc/libdl/libm）、导出符号集合全部通过；
- HarmonyOS：arm64-v8a 与 x86_64 的 ELF 架构、NEEDED（仅 libc.so）、
  导出符号集合全部通过；设备 smoke 因设备禁止 `/data/local/tmp` 执行记
  `PENDING`（与上游 demo 记录一致，不属于代码问题）；
- 特征验证：新 `libmark-full.so` 含字体选面特征（`zh-hant-mo` 等），
  新 `libmark_bridge.so`（Android/Harmony 双 ABI）均引用新符号
  `libmark_render_select_face`，旧产物无此符号。

### 编译验证

- `lsp lint` 本机不可用（项目未导入 HBuilderX 项目列表，Failed to read
  platform settings），以真实编译结果为准；
- `cli.exe launch app-android --compile true`：编译成功；
- `cli.exe launch app-harmony --compile true`：编译成功，运行包制作成功。

### 遗留事项

- Android 侧本次同时改动了 UTS、Kotlin 与 .so，需要重新制作自定义基座
  （或替换基座内同名 .so 并重装）后才能做真机运行时验证；
- HarmonyOS 侧需要安装新 HAP 做运行时验证；两侧设备运行时验证均记为
  `PENDING`；
- 本次产物已包含 CJK 字体选面能力，业务侧如需按内容语言精确选面，
  可后续在 `createSession` 第二参数传入内容语言（当前传 null，使用设备语言兜底）。
