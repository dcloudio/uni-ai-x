# uni-cmark

`uni-cmark` converts Markdown directly to HTML with one pinned cmark-gfm core.
It supports uni-app x on Android, Web, WeChat Mini Program, and HarmonyOS.

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

The plugin intentionally does not expose Markdown AST, node, token, or JSON
conversion APIs. All supported platforms use cmark-gfm `0.29.0.gfm.13`, the
same `md2html.c`, extensions, safe HTML options, and shared HTML postprocessor.

- Android loads `libcmarkhtml.so`.
- HarmonyOS loads the native N-API library in `cmark.har`.
- Web loads a single-file ESM/WASM module in the Markdown Worker.
- WeChat Mini Program loads a standalone WASM module with `WXWebAssembly` in
  the same Worker protocol.

The checked-in native and WASM artifacts are reproducibly generated with:

```sh
. /path/to/emsdk_env.sh
./native/build-web.sh
./native/build-mp-weixin.sh
./native/build-harmony.sh
```

The checked-in Web module was built with Emscripten 4.0.20. Its WASM binary is
embedded in the ESM output so Worker loading does not depend on deployment
paths or Web-only `uni` APIs. The WeChat artifact is kept as a standalone WASM
file because `WXWebAssembly.instantiate` loads a mini-program resource path.
