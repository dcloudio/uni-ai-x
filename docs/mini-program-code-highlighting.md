# 小程序代码高亮：轻量版与完整版

小程序默认使用轻量版；App 和 Web 始终使用 TextMate。两套小程序方案都保留在源码中，微信小程序发布时通过下面的命令选择。命令应在项目根目录执行。

| 模式 | 发布命令 | 适用场景 |
| --- | --- | --- |
| 轻量版（默认） | `node scripts/build-mp-weixin.mjs basic` | 普通应用；按词着色，不需要 TextMate、语法 JSON 或 Oniguruma WASM |
| 完整版 | `node scripts/build-mp-weixin.mjs full` | 需要 TextMate 语法高亮的专用应用；会打包语法资源与 Oniguruma WASM |

不带参数运行脚本也会选择轻量版。HBuilderX 中直接运行小程序同样使用轻量版。完整版必须通过脚本发布，因为脚本会同步切换聊天入口和 `uni-highlight` 的小程序 API，并暂时放入 WASM；发布结束后会恢复轻量版源码。不要只修改 `parseCode.uts` 中的导出，否则 API 与资源可能不匹配。

默认入口是 `uni_modules/uni-ai-x/sdk/parseCode.uts`，轻量实现是 `parseCode-basic.uts` 与 `uni_modules/uni-highlight/utssdk/mp-weixin/basic-code-tokenizer.js`。完整版实现保留在 `parseCode-textmate.uts` 与 `uni_modules/uni-highlight/utssdk/mp-weixin/index-textmate.uts`。构建脚本会检查两种产物中 TextMate、Oniguruma JS 与 WASM 是否一致。

2026-11-04 的微信小程序发布产物：轻量版在将仅以 50px/25px 展示的聊天 Logo 缩至 256x256 后为 972,815 字节（此前为 1,152,522 字节）；完整版此前测得约 3.96 MiB。完整版当前可能超过微信主包限制；需要继续分包或减重后，再以微信开发者工具的上传检查为准。两种模式都使用本地“体验完整Markdown示例”，不依赖云端请求。当前脚本只发布微信小程序；将来增加其他小程序平台时，需要为该平台补充完整版资源暂存和产物校验。

轻量包中的 cmark-gfm WASM 为 246,860 字节，微信 worker 需要它的 `md2html` 导出。用 Binaryen `wasm-opt -Oz` 试验仅缩至 244,659 字节，收益 2,201 字节，尚未替换原二进制。聊天页直接使用该解析器，因此现有的选择文本页分包无法承载它；后续调整分包必须同时处理页面和依赖的位置。

当前轻量版 `app.json` 的分包配置对应主包 969,536 字节、选择文本分包 3,279 字节。完整版仍由主包聊天页直接引用 TextMate；它的分包实验应先把完整聊天页及仅供该页使用的高亮依赖安排在同一普通分包，由轻量主包入口导航过去，再检查编译器实际把 JS、语法资源和 WASM 放在哪个包，并以微信开发者工具的上传检查验收。官方 uni-app x 独立分包目前不自动复制包外业务依赖，当前聊天页依赖范围较广，不宜直接改成独立分包。
