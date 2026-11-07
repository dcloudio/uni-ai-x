# uni-ai-md

`uni-ai-md` 是面向 uni-app x 的流式 Markdown 解析 UTS 插件，支持 Android、
HarmonyOS 与 iOS。它在原生层维护一个 progressive session，按 Markdown 块边界增量
输出 HTML、结构化 DATA 和 AST 三种通道的块级事件，适合 AI 聊天等边接收边渲染的场景。
Web、微信小程序请使用 uni-cmark。

```uts
import {
  createSession,
  feedChunk,
  finishSession,
  destroySession
} from '@/uni_modules/uni-ai-md'

const session = createSession('html', 'zh-CN', false, '#ffffff')
let event = feedChunk(session, '# Hello\n')
while (event != null) {
  // 按顺序把 event.ops 应用到块列表
  event = feedChunk(session, '下一段 Markdown chunk')
}
event = finishSession(session)
destroySession(session)
```

`feedChunk`、`finishSession` 每次返回一组块级操作；没有事件时返回 `null`。

## 平台与依赖

- uni-app x：Android（arm64-v8a）、HarmonyOS（arm64-v8a / x86_64）、iOS（arm64 真机 /
  arm64 + x86_64 模拟器，最低 iOS 13.0）。
- Android 通过 JNI 桥接加载 `libuni-ai-md_bridge.so`（依赖 `libuni-ai-md.so`）；鸿蒙通过
  N-API 加载 `uni-ai-md.har`；iOS 通过同目录 Swift 包装类 `UniAiMdIOS` 调用
  `UniAiMdBridge.xcframework` 内的 C 桥。原生产物已随插件打包在 `utssdk/app-android/libs`、
  `utssdk/app-harmony/libs` 与 `utssdk/app-ios/Frameworks`。
- Android 只提供 arm64-v8a，需要 arm64-v8a 设备并使用自定义基座运行；iOS 同样需要包含该
  framework 的自定义基座。
- Web、微信小程序不在本插件支持范围，请改用 uni-cmark。

### 平台差异

- 会话句柄：Android / HarmonyOS 返回不透明对象句柄；iOS 运行时的同步通道对 `object`
  参数的装箱不可靠，因此 iOS 的 `createSession` 直接返回自增 `number` id，其余接口接收
  该 id。
- iOS 的 `createSession` 参数为必选；`languageTags` 为空串时由桥接按设备语言兜底。

## 接口

### createSession

```uts
createSession(mode?: string, languageTags?: string, darkMode?: boolean,
  background?: string): object
```

创建一个流式解析会话，返回会话句柄，供后续 `feedChunk` / `finishSession` /
`destroySession` 使用。

- `mode`：`"ast"` 时只交付 AST（无 HTML、无 DATA）；省略或 `"html"` 时交付 HTML 与
  DATA。
- `languageTags`：内容语言偏好（BCP-47，可为逗号分隔的优先级列表），用于在集合字体里
  挑选 face；Android 侧会把设备语言追加在其后作为兜底。
- `darkMode`：决定 mermaid、math 插件的默认前景色，省略按浅色。
- `background`：宿主显式给出的画布底色（`#rrggbb`），省略或格式不对时按浅色底兜底。

### feedChunk

```uts
feedChunk(handle: object, chunk: string): UniAiMdEvent | null
```

提交一段 Markdown chunk，返回本次产生的块级操作集合；没有事件时返回 `null`。chunk
可以是任意切分，插件按块边界聚合输出。

### finishSession

```uts
finishSession(handle: object): UniAiMdEvent | null
```

结束会话输入，返回收尾的块级操作集合（把未闭合块提交为完成态）；没有事件时返回
`null`。

### destroySession

```uts
destroySession(handle: object): void
```

销毁会话及其 runtime，释放原生资源。

## 事件模型

`UniAiMdEvent` 是一次调用的块级操作集合，`ops` 需按数组顺序应用：

```ts
type UniAiMdOp = {
  op: number
  kind: string
  content: string
  index: number
  unchanged: boolean
}

type UniAiMdEvent = {
  ops: UniAiMdOp[]
}
```

- `op`：`1` 追加块、`2` 更新未闭合块、`3` 提交未闭合块、`4` 清空块列表（对应导出常量
  `OP_APPEND` / `OP_TAIL` / `OP_COMMIT` / `OP_RESET`）。
- `kind`：`html` / `data` / `ast`（对应 `KIND_HTML` / `KIND_DATA` / `KIND_AST`）。
- `index`：该操作对应的顶层块序号，三种通道按同一序号对齐到同一槽位。
- `unchanged`：为 `true` 表示这次 tail 提交的内容没有变化，`content` 是原内容而不是
  新载荷。

DATA 与 AST 每次都是完整快照；未闭合 HTML 块在原生桥内完成前缀 patch，宿主按 `index`
覆盖对应块即可。`op: 4` 表示清空块列表，应用时忽略内容。

## 相关插件

- [uni-ai-x](https://ext.dcloud.net.cn/plugin?name=uni-ai-x)：基于本插件实现 AI 聊天的流式 Markdown 渲染。
- [uni-cmark](https://ext.dcloud.net.cn/plugin?name=uni-cmark)：Web、微信小程序的 Markdown 转 HTML / JSON AST。
- [uni-highlight](https://ext.dcloud.net.cn/plugin?name=uni-highlight)：代码块高亮。
