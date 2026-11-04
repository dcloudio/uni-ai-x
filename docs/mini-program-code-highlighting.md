# 小程序代码高亮：轻量版与完整版

小程序默认使用轻量版；App 和 Web 始终使用 TextMate。两套小程序方案都保留在源码中，微信小程序发布时通过下面的命令选择。命令应在项目根目录执行。

| 模式 | 发布命令 | 适用场景 |
| --- | --- | --- |
| 轻量版（默认） | `node scripts/build-mp-weixin.mjs basic` | 普通应用；按词着色，不需要 TextMate、语法 JSON 或 Oniguruma WASM |
| 完整版 | `node scripts/build-mp-weixin.mjs full` | 需要 TextMate 语法高亮的专用应用；保留原有 21 种语言，使用普通分包和本地压缩语法资源 |

不带参数运行脚本也会选择轻量版。HBuilderX 中直接运行小程序同样使用轻量版。完整版必须通过脚本发布，因为脚本会同步切换聊天入口、`uni-highlight` 的小程序 API 和 `pages.json`，并暂时放入 WASM 与压缩语法模块；发布结束后会恢复轻量版源码。不要只修改 `parseCode.uts` 中的导出，否则 API、资源和页面分包可能不匹配。

默认入口是 `uni_modules/uni-ai-x/sdk/parseCode.uts`，轻量实现是 `parseCode-basic.uts` 与 `uni_modules/uni-highlight/utssdk/mp-weixin/basic-code-tokenizer.js`。完整版实现保留在 `parseCode-textmate.uts` 与 `uni_modules/uni-highlight/utssdk/mp-weixin/index-textmate.uts`。完整版页面配置模板是 `scripts/pages-mp-weixin-full.json`：主包入口 `pages/launch/index.uvue` 跳转到普通分包 `uni_modules/uni-ai-x` 中的聊天页；选择文本页也在该分包内。构建脚本会检查两种产物中 TextMate、Oniguruma JS、WASM 和语法资源是否一致，并检查完整版每个包不超过 2 MiB。

2026-11-04 的微信小程序发布产物：轻量版在将仅以 50px/25px 展示的聊天 Logo 缩至 256x256 后为 972,188 字节（此前为 1,152,522 字节），其中主包 968,909 字节、选择文本分包 3,279 字节；完整版分包前为 3,967,184 字节，分包和语法压缩后为 1,886,059 字节，其中主包 1,175,821 字节、聊天分包 710,238 字节。实际上传仍以微信开发者工具的检查为准。两种模式都使用本地“体验完整Markdown示例”，不依赖业务云端请求。当前脚本只发布微信小程序；将来增加其他小程序平台时，需要为该平台补充完整版资源暂存和产物校验。

完整版的 21 种 TextMate 语法原文件位于 `static/app/uni-highlight-grammar`，压缩归档位于 `scripts/grammars.zip`。构建脚本把归档编码为临时 JS 模块，首次高亮时写入小程序用户目录并异步解压，再读取语法；后续启动校验归档哈希和语法文件，完整时直接读取，损坏或版本变化时重建缓存。这些都是本地文件操作，没有业务云端请求。微信文件系统无法直接读取本次实验中的包内 ZIP 路径，因此不要把归档直接放到小程序 `static` 或聊天分包。修改语法 JSON 后，必须同步更新 `scripts/grammars.zip`；归档只应包含 `parseCode-textmate.uts` 的 `grammarList` 使用的 21 个 `.tmLanguage.json` 文件。App 和 Web 继续直接导入原 JSON。

轻量包中的 cmark-gfm WASM 为 246,860 字节，微信 worker 需要它的 `md2html` 导出。用 Binaryen `wasm-opt -Oz` 试验仅缩至 244,659 字节，收益 2,201 字节，尚未替换原二进制。聊天页直接使用该解析器，因此现有的选择文本页分包无法承载它；后续调整分包必须同时处理页面和依赖的位置。

轻量版继续把聊天页放在主包，并仅把选择文本页放在小分包。完整版把 `uni-ai-x` 目录整体作为普通分包，保证聊天页直接引用的组件和 SDK 同包；主包保留 worker、cmark 和 Oniguruma WASM。首次进入普通分包时，微信平台可能需要下载该分包；入口页在加载失败时提供重试。Markdown 示例和语法高亮不请求业务云端。官方 uni-app x 独立分包目前不自动复制包外业务依赖，当前实现使用普通分包。若调整 `pages.json` 的页面或全局样式，还要同步检查完整版页面配置模板。

构建脚本在正常失败、Ctrl-C 或 SIGTERM 时会还原临时源码和资源。强制终止整个进程（例如 SIGKILL）或系统崩溃无法运行清理逻辑；遇到这种情况，先检查 `git status` 和本次暂存文件，再运行 HBuilderX 或重新发布，避免误用仍处于完整版状态的源码。
