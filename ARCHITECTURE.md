# Architecture

## Markdown HTML pipelines

Android keeps network streaming and Markdown conversion in its Worker:

```text
AI/demo Markdown stream
  -> workers/aiRequestWorkerTask.uts
  -> MarkdownPreprocessor
  -> uni-cmark md2html
  -> immutable HTML snapshot
  -> RequestAiRunner.onMarkdownHtml
  -> MsgItem.markdownHtml
  -> uni-ai-md-rich-text
  -> native rich-text
```

Network streaming, SSE decoding, Markdown accumulation, preprocessing, and
Markdown-to-HTML conversion run in the AI Worker. The main thread receives the
latest message body and HTML snapshot through `uni-ai-worker-runtime`.

The application does not expose a Markdown-to-token API. It does not transport,
store, or render Markdown AST/token JSON. `uni-cmark` exports only `md2html` and
`isMd2htmlAvailable`.

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
- `uni_modules/uni-ai-x/sdk/requestAiRunner.uts`: starts the shared Markdown Worker protocol and accepts HTML snapshots.
- `uni_modules/uni-ai-x/components/uni-ai-md-rich-text`: passes HTML to native RichText.

## Platform boundary

Android, Web, and HarmonyOS use the production HTML Worker pipeline. Android can
also own the network request in the Worker; the other supported Worker platforms
send main-thread network deltas to it. WeChat Mini Program exposes the same
snapshot runtime API but generates snapshots on the main thread. Unsupported
platforms return an explicit error instead of falling back to a token renderer.
