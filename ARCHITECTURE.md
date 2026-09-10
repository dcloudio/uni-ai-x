# Architecture

## Markdown rendering pipeline

Android keeps network streaming and Markdown conversion in its Worker:

```text
AI/demo Markdown stream
  -> workers/aiRequestWorkerTask.uts
  -> MarkdownPreprocessor
  -> uni-cmark md2html + md2json
  -> immutable HTML/AST snapshots
  -> RequestAiRunner.onMarkdownHtml
  -> RequestAiRunner.onMarkdownAst
  -> MsgItem.markdownHtml
  -> MsgItem.markdownAst
  -> markdown-ast.uts
  -> markdown-text.uts
  -> native Text blocks/spans
```

Network streaming, SSE decoding, Markdown accumulation, preprocessing, and
Markdown conversion run in the AI Worker. The main thread receives the latest
message body, HTML snapshot, and AST snapshot through `uni-ai-worker-runtime`.

The chat renderer converts ordinary headings, paragraphs, inline styles, links,
quotes, lists, and thematic breaks to flat native `Text` blocks. Tables and
code blocks remain separate list items and are the only Markdown content that
uses native `RichText` through their dedicated components. Math source fallback
is native `Text`; rendered math and Mermaid diagrams use images.

Web and HarmonyOS keep network streaming on the main thread and send Markdown
deltas through the same Worker snapshot protocol as Android. WeChat Mini
Program keeps both network streaming and Markdown snapshot generation on the
main thread because its Worker package cannot load generated modules outside
the configured Worker root. Web and WeChat run the same `md2html.c` as
WebAssembly; HarmonyOS uses the same C entry point through a native N-API HAR.
Every platform then uses the shared `MarkdownPreprocessor` and
`prepareMarkdownHtml` stages.

## Main modules

- `workers/aiRequestWorkerTask.uts`: AI/demo stream owner and HTML snapshot producer.
- `uni_modules/uni-ai-worker`: SSE, stream request, Markdown preprocessing, and demo fixtures.
- `uni_modules/uni-ai-worker-runtime`: Worker lifecycle and snapshot bridge.
- `uni_modules/uni-cmark`: one cmark-gfm Markdown-to-HTML core compiled as Android `.so`, HarmonyOS HAR, and Web/WeChat WebAssembly.
- `uni_modules/uni-ai-x/sdk/requestAiRunner.uts`: starts the shared Markdown Worker protocol and accepts HTML/AST snapshots.
- `uni_modules/uni-ai-x/sdk/markdown-text.uts`: flattens AST/legacy HTML blocks into Text spans while preserving table/code blocks.
- `uni_modules/uni-ai-x/components/uni-ai-md-text.uvue`: renders native Text/Image spans without recursive Markdown components.
- `uni_modules/uni-ai-x/components/uni-ai-msg-html-table`: renders tables with native RichText.
- `uni_modules/uni-ai-x/components/uni-ai-msg-code`: renders code blocks with native RichText.

## Platform boundary

Android, Web, and HarmonyOS use the production HTML Worker pipeline. Android can
also own the network request in the Worker; the other supported Worker platforms
send main-thread network deltas to it. WeChat Mini Program exposes the same
snapshot runtime API but generates snapshots on the main thread. Unsupported
platforms return an explicit error instead of falling back to a token renderer.
