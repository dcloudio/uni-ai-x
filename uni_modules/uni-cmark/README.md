# uni-cmark

`uni-cmark` converts Markdown directly to HTML on Android through cmark-gfm.

```uts
import {
  isMd2htmlAvailable,
  md2html
} from '@/uni_modules/uni-cmark/utssdk/app-android/index.uts'

if (isMd2htmlAvailable()) {
  const html = md2html('# Hello')
}
```

The plugin intentionally does not expose Markdown AST, node, token, or JSON
conversion APIs. `libcmarkhtml.so` contains the cmark-gfm implementation needed
by the HTML converter and has no dependency on the removed legacy library.
