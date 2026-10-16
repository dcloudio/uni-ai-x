# 行内公式滚动/历史会话异常修复（2026-10-16）

## 问题现象

行内公式在消息首次流式渲染时显示正常；滚动查看或加载历史会话后，公式被放大为整块大图，且同一段落中的文字消失（块公式与 Mermaid 不受影响）。

## 根因

`libmark-html.uts` 的 HTML 流式适配器会把片段中任意位置的 `<svg>...</svg>` 提取为独立 `image` 块（该规则为 Mermaid 的顶层 SVG 交付设计）。行内公式改为内联 `<svg>` 交付后，嵌在 `<p>` 等段落文本容器中的公式 SVG 在「稳定块交付」（APPEND 事件，重建与续传路径使用）时被误切为 `image` 块，并造成段落标签截断，最终表现为大图 + 文字丢失。实时流式路径的交付分片未命中该匹配，因此首次渲染不受影响。

## 修复

- `uni_modules/uni-ai-worker/utssdk/libmark-html.uts`：新增顶层 SVG 判定——扫描 svg 起点前的未闭合文本容器标签（p/li/td/h1-h6 等），仅当 svg 位于片段顶层时才提取为 `image` 块；容器内（行内公式）的 svg 跳过并继续向后查找，保证同一片段中后续的顶层 Mermaid SVG 仍被正常提取。容器扫描使用 UTS 兼容写法（`indexOf` / `charAt`），通过 Android Kotlin 编译。
- `uni_modules/uni-ai-worker/utssdk/render-snapshot.uts`：`RENDER_SNAPSHOT_VERSION` 由 1 提升到 2，使已生成的错误快照（公式被存为 `image` 块）自动失效并触发重建。

## 验证结果

- 新增回归测试 `tests/libmark-inline-svg.test.mjs`（5 项）：行内公式保留在 html 块、顶层 SVG 仍提取、混合片段跳过行内并提取顶层、独立 SVG、commit 路径。
- 全量 Node 测试无新增失败（其余失败为既有 `Number.from` 测试环境问题）；多平台静态检查通过（107 文件、5 平台、0 错误）。
- 真机验证（Android）：更新后加载历史会话（重建路径）与反复滚动，行内公式恢复为「文字 + 行内小公式」正常显示；Mermaid 图表提取与显示正常。
