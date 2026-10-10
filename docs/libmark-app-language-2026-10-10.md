# libmark 语言偏好接入应用语言（2026-10-10）

## 任务目标

把 libmark 会话的文本字体语言偏好从"设备语言兜底"升级为"应用语言优先"：
主线程读取 `uni.getAppBaseInfo().appLanguage`（BCP-47，如 `zh-Hans`/`zh-Hant`），
随 worker 请求传给 libmark `createSession`，用于集合字体（ttc/otc）的 CJK
face 选择；读取失败或平台不支持时保持原有设备语言兜底行为。

## 调研结论

- `uni.getLocale()` / `uni.setLocale()` 在 App 端不支持（仅 Web / 部分小程序）；
  App 端应使用 `uni.getAppBaseInfo().appLanguage`。
- `appLanguage` 取值格式即 BCP-47（正式版修复过"无法区分繁简"），可直接作为
  libmark 的 `languageTags`；Android 3.91+ / iOS 4.11+ 支持，**HarmonyOS 文档
  标注不支持（appLanguage 兼容性为 x）**，因此需要 try/catch 防御并允许退回。
- worker 线程仅支持"界面无关 API"，`getAppBaseInfo` 是否可用未明确，且
  HarmonyOS 兼容性存疑；因此取值放在主线程（uni-ai-worker-runtime 模块）完成，
  随消息传入 worker，而非 worker 内直接调用。
- 项目当前没有 `locale/` 国际化配置，Android 上 `appLanguage` 大概率等于系统
  语言，与原有兜底基本等价；用户在 Android 13+ 给 App 单独设语言、或未来接入
  i18n 后，该接入才有额外增量。

## 实施方案

### 1. 主线程取值并随消息透传（uni-ai-worker-runtime/utssdk/index.uts）

- 新增 `resolveAppLanguage()`：读取 `uni.getAppBaseInfo().appLanguage`，
  模块内缓存一次；空值或异常返回 null（HarmonyOS 平台静默退回）。
- 三处 worker 消息附加 `language` 字段：
  - `postStart`（Android SSE 请求）
  - `postMarkdownStart`（HarmonyOS 等 start-markdown 路径）
  - `postRebuildRequest`（历史消息重建）
- MP-WEIXIN 路径（走 uni-cmark）不涉及，未改动。

### 2. worker 读取并传入 createSession（workers/aiRequestWorkerTask.uts）

- 新增字段 `libmarkLanguage: string | null`；`resetState` 时重置。
- `startRequest` / `startMarkdown` 读取 payload 的 `language`（空串归一为 null）。
- `ensureLibmarkSession`：`createSession('html', this.libmarkLanguage)`。
- `rebuildMarkdown`：读 payload 的 `language` 并传入独立重建 session。

### 数据流

```text
主线程 resolveAppLanguage()（缓存一次）
  → start / start-markdown / rebuild-markdown 消息携带 language
    → worker 记录到 libmarkLanguage
      → createSession('html', language)
        → Android composeLocales：应用语言在前，设备语言追加兜底
        → HarmonyOS 透传 N-API（候选字体为单面 SC，基本无差异）
```

调用方（requestAiRunner、libmark-stream-store）、`interface.uts` 与 libmark
插件本身均未改动；language 是 worker 消息 payload 里的动态字段。

## 执行结果

- `tests/check-markdown-static.cjs`：87 个 UTS/UVue/ETS 文件 × 5 平台预处理
  解析，0 错误。
- `launch app-android --compile true`：编译成功。
- `launch app-harmony --compile true`：编译成功，运行包制作成功。
- `lsp lint` 本机不可用（项目未导入 HBuilderX 项目列表），以真实编译为准。

## 遗留事项

- 运行时生效需重新制作自定义基座（Android）/ 安装新 HAP（HarmonyOS），
  运行验证记为 `PENDING`。
- HarmonyOS 上 `appLanguage` 的实际返回值待真机确认：若不可用，行为
  静默退回设备语言兜底（与本次改动前一致）。
- 若后续希望"AI 回复内容语言"比"应用语言"更准，可在 worker 首片段或
  主线程对话内容上增加轻量 CJK 检测覆盖，本次未做。
