# Architecture

## Android Markdown pipeline

Android has one Markdown rendering path:

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
`isMd2htmlAvailable` on Android.

## Main modules

- `workers/aiRequestWorkerTask.uts`: AI/demo stream owner and HTML snapshot producer.
- `uni_modules/uni-ai-worker`: SSE, stream request, Markdown preprocessing, and demo fixtures.
- `uni_modules/uni-ai-worker-runtime`: Worker lifecycle and snapshot bridge.
- `uni_modules/uni-cmark`: Android C bridge for direct Markdown-to-HTML conversion.
- `uni_modules/uni-ai-x/sdk/requestAiRunner.uts`: starts the Worker and accepts HTML snapshots only.
- `uni_modules/uni-ai-x/components/uni-ai-md-rich-text`: passes HTML to native RichText.

## Platform boundary

The production HTML Worker pipeline is currently enabled for Android. Other
platforms return an explicit unsupported error instead of falling back to a
token renderer.
