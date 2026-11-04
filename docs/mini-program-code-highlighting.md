# 小程序代码高亮：轻量版与完整版

小程序默认使用轻量版；App 和 Web 始终使用 TextMate。两套小程序方案都保留在源码中。先在项目根目录选择模式，再由用户在 HBuilderX 中运行或发行到微信小程序。选择脚本只修改本地项目文件，不调用 HBuilderX，也不设置微信 AppID；在 HBuilderX 中配置自己的 AppID 即可。

| 模式 | 选择命令 | 适用场景 |
| --- | --- | --- |
| 轻量版（默认） | `node scripts/select-mp-weixin-mode.mjs basic` | 普通应用；按词着色，不需要 TextMate、语法 JSON 或 Oniguruma WASM |
| 完整版 | `node scripts/select-mp-weixin-mode.mjs full` | 需要 TextMate 语法高亮的专用应用；保留原有 21 种语言，使用普通分包和本地压缩语法资源 |

首次克隆仓库时已经是轻量版，可以直接在 HBuilderX 中运行或发行。要发行完整版，先运行 `full` 选择命令，等它输出已选完整版，再在 HBuilderX 中使用“运行到微信小程序”或“发行到微信小程序”。在微信开发者工具完成上传后，运行 `basic` 命令切回轻量版。选择完整版后，源码会一直保持完整版，直到主动切回；不要在 HBuilderX 编译或上传尚未完成时切回。

不带参数运行脚本只显示当前模式，不修改文件。切换脚本会同步处理聊天入口、`uni-highlight` 小程序 API、`pages.json`、WASM 和压缩语法模块；不要只手动修改 `parseCode.uts` 的导出。完整版期间 `git status` 会显示这些预期的本地改动，切回轻量版后会恢复选择前的内容；不要将完整版暂存文件作为普通源码提交。

默认入口是 `uni_modules/uni-ai-x/sdk/parseCode.uts`，轻量实现是 `parseCode-basic.uts` 与 `uni_modules/uni-highlight/utssdk/mp-weixin/basic-code-tokenizer.js`。完整版实现保留在 `parseCode-textmate.uts` 与 `uni_modules/uni-highlight/utssdk/mp-weixin/index-textmate.uts`。完整版页面配置模板是 `scripts/pages-mp-weixin-full.json`：主包入口 `pages/launch/index.uvue` 跳转到普通分包 `uni_modules/uni-ai-x` 中的聊天页；选择文本页也在该分包内。选择脚本负责准备源码与资源；编译、包体检查和上传由 HBuilderX 与微信开发者工具完成。

2026-11-04 的微信小程序发布产物：轻量版在将仅以 50px/25px 展示的聊天 Logo 缩至 256x256 后为 972,188 字节（此前为 1,152,522 字节），其中主包 968,909 字节、选择文本分包 3,279 字节；完整版分包前为 3,967,184 字节，分包和语法压缩后为 1,886,059 字节，其中主包 1,175,821 字节、聊天分包 710,238 字节。实际上传仍以微信开发者工具的检查为准。两种模式都使用本地“体验完整Markdown示例”，不依赖业务云端请求。当前脚本只为微信小程序准备完整版资源；将来增加其他小程序平台时，需要为该平台补充完整版资源暂存和产物校验。

完整版的 21 种 TextMate 语法原文件位于 `static/app/uni-highlight-grammar`，压缩归档位于 `scripts/grammars.zip`。选择脚本把归档编码为本地 JS 模块，首次高亮时写入小程序用户目录并异步解压，再读取语法；后续启动校验归档哈希和语法文件，完整时直接读取，损坏或版本变化时重建缓存。这些都是本地文件操作，没有业务云端请求。微信文件系统无法直接读取本次实验中的包内 ZIP 路径，因此不要把归档直接放到小程序 `static` 或聊天分包。修改语法 JSON 后，必须同步更新 `scripts/grammars.zip`；归档只应包含 `parseCode-textmate.uts` 的 `grammarList` 使用的 21 个 `.tmLanguage.json` 文件。App 和 Web 继续直接导入原 JSON。

轻量包中的 cmark-gfm WASM 为 246,860 字节，微信 worker 需要它的 `md2html` 导出。用 Binaryen `wasm-opt -Oz` 试验仅缩至 244,659 字节，收益 2,201 字节，尚未替换原二进制。聊天页直接使用该解析器，因此现有的选择文本页分包无法承载它；后续调整分包必须同时处理页面和依赖的位置。

轻量版继续把聊天页放在主包，并仅把选择文本页放在小分包。完整版把 `uni-ai-x` 目录整体作为普通分包，保证聊天页直接引用的组件和 SDK 同包；主包保留 worker、cmark 和 Oniguruma WASM。首次进入普通分包时，微信平台可能需要下载该分包；入口页在加载失败时提供重试。Markdown 示例和语法高亮不请求业务云端。官方 uni-app x 独立分包目前不自动复制包外业务依赖，当前实现使用普通分包。若调整 `pages.json` 的页面或全局样式，还要同步检查完整版页面配置模板。

切换脚本会保存切换前的源码内容；切回轻量版时如发现这些文件在完整版期间被改动，会停止恢复以保护用户编辑。此时先查看脚本报出的文件并处理自己的修改，再切换模式。
