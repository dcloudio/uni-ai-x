## 1.0.1 (2026-11-06)
- 新增 iOS 平台支持：`utssdk/app-ios` 通过 Swift 包装类调用 `UniAiMdBridge.xcframework`（CoreText 提供 mermaid 文本字形），事件协议与 Android / HarmonyOS 一致。

## 1.0.0 (2026-11-05)
- 首个版本。面向 uni-app x 的流式 Markdown 解析 UTS 插件，支持 Android 与 HarmonyOS。
- 提供 progressive session 接口：`createSession`、`feedChunk`、`finishSession`、`destroySession`，按 Markdown 块边界增量输出块级事件。
- 统一块级事件协议：`op`（追加 / 更新未闭合 / 提交 / 清空）、`kind`（html / data / ast）、`index`（三通道对齐）、`unchanged`（tail 内容未变）。
- Android 通过 JNI 桥接库、HarmonyOS 通过 N-API HAR 集成，两端使用同一份事件语义。
