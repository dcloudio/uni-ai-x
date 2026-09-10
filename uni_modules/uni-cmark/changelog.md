# 1.3.0（2026-09-10）

- 新增 `md2json`，直接输出 cmark-gfm 文档树的 JSON AST，与 `md2html` 复用同一解析管线。
- 统一各端 `md2json` 接口：Android JNI、iOS Framework、鸿蒙 N-API、Web/微信小程序 WASM。
- 表格表头行在 JSON 中统一为 `table_row` + `header: true`。

# 1.2.0（2026-08-07）

- Web、微信小程序新增 Worker 内 `md2html`，使用与 Android 相同的 cmark-gfm C 核心生成 HTML。
- 鸿蒙新增同源 cmark-gfm 原生 N-API `md2html`，通过 HAR 集成。
- 四端统一 `initMd2html`、`isMd2htmlAvailable`、`md2html` API、Worker 协议和 HTML 后处理链路。

# 1.1.0（2026-08-03）

- Android 新增原生 `md2html`，由 cmark-gfm 直接生成 HTML 字符串。
- 增加可复现的 Android 四 ABI 构建脚本和原生测试。

## 1.0.1（2026-01-07）
修复 解决提交 App Store 报 Validation failed (409) This bundle is invalid. Applications built for more than one architecture require an iOS Deployment  Target of 3.0 or later.的问题
## 1.0.0（2025-11-18）
第一版
