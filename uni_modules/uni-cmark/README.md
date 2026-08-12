# uni-cmark

`uni-cmark` 使用固定版本的 cmark-gfm 内核将 Markdown 直接转换为 HTML，支持
uni-app x 的 Android、iOS、Web、微信小程序和鸿蒙平台。

```uts
import {
  initMd2html,
  isMd2htmlAvailable,
  md2html
} from '@/uni_modules/uni-cmark'

await initMd2html()
if (isMd2htmlAvailable()) {
  const html = md2html('# Hello')
}
```

插件不对外提供 Markdown AST、节点、Token 或 JSON 转换接口。所有支持的平台统一
使用 cmark-gfm `0.29.0.gfm.13`、相同的 `md2html.c`、扩展、安全 HTML 选项和
HTML 后处理逻辑。

- Android 加载 `libcmarkhtml.so`。
- iOS 通过原生 UTS 桥接加载 `scopeparser4ios.xcframework`。
- 鸿蒙加载 `cmark.har` 中的原生 N-API 库。
- Web 在 Markdown Worker 中加载单文件 ESM/WASM 模块。
- 微信小程序使用同一套 Worker 协议，通过 `WXWebAssembly` 加载独立 WASM 模块。

仓库内的原生和 WASM 产物可通过以下命令重新生成：

```sh
. /path/to/emsdk_env.sh
./native/build-web.sh
./native/build-mp-weixin.sh
./native/build-harmony.sh
./native/build-ios.sh
```

仓库内的 Web 模块使用 Emscripten 4.0.20 构建。WASM 二进制已嵌入 ESM 输出，使
Worker 加载不依赖部署路径或仅限 Web 的 `uni` API。由于
`WXWebAssembly.instantiate` 需要加载小程序资源路径，微信小程序产物保留为独立的
WASM 文件。
