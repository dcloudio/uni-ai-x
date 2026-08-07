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
