# libmark Migration

Reference: `origin/feat/introduce-libmark` at
`869d4ba8f7975fb493b1a4013bebc096b81fae05`.

## Rendering

- Android and Harmony use libmark HTML/DATA operations in the Worker.
- Worker notifications deliver operations without the previous App polling loop.
- Historical native messages rebuild from their Markdown body in the Worker.
- Native storage excludes HTML, AST, block snapshots and transient revisions.
- Code, tables, formulas and Mermaid consume the new block stream. Code and
  Mermaid retain separate presentation components. Native SVG
  output takes priority; unsupported diagrams retain the WebView fallback.
- The hidden WebView is created on demand. Switching conversations schedules
  release; an immediate request in the next conversation can reuse it, matching
  the reference branch. Release invalidates queued work and old callbacks.
- Search citations, footnotes, mail links, table sizing, initial scrolling and
  the existing Android UTF-8 token offset fix are retained from `next`.
- iOS, Web and WeChat still use cmark HTML snapshots. Full parser unification
  is NOT complete: the reference branch supplies only Android SO and Harmony
  HAR artifacts, with no iOS framework, Web/WeChat WASM or buildable engine
  source. Those platform artifacts or the engine source are required to finish.

## Removed Code And Assets

- Android cmark bridge, all `libcmarkhtml.so` variants and Android build script.
- Harmony cmark HAR, N-API source, dedicated CMake project and build script.
- Unused Android JNI code in the shared cmark C source.
- Unused AST renderer and view-level asynchronous code highlighting.
  Code source is published immediately and replaced in place with highlighted HTML;
  the shared highlight token cache remains in use.
- 60 unused KaTeX font files and unused FiraCode: 1,366,196 bytes (1.30 MiB).

The shared cmark `native/CMakeLists.txt` remains necessary for iOS, Web, WeChat
and host tests. The Harmony cmark entry is an unavailable compatibility stub,
matching the reference branch; it loads no native cmark library.

MathJax and Mermaid scripts remain necessary for fallback rendering and legacy
platforms. Icon fonts remain in use. Loading these scripts lazily reduces
runtime usage but does not remove their bytes from an installation package.

## Size Measurements

Measured against the original `next` HEAD. These are repository artifact bytes,
not APK/HAP sizes; architecture filtering and package compression still apply.

| Artifact Group | Before (bytes) | After (bytes) | Delta |
| --- | ---: | ---: | ---: |
| Android arm64 cmark/highlight/libmark native libraries | 8,812,240 | 7,726,936 | -1.04 MiB |
| Related static assets | 11,216,350 | 10,323,305 | -0.85 MiB |
| Harmony cmark/highlight/libmark HAR archives | 971,151 | 6,746,788 | +5.51 MiB |

The static total includes the newly required 473,151-byte Oniguruma WASM file.
The supplied Android libmark only supports `arm64-v8a` and API 24+. The manifest
therefore drops `armeabi-v7a`, as on the reference branch. This also excludes the
old 32-bit native libraries from Android packaging. Existing version changes
in the manifest were preserved.

Harmony is not proven smaller: the new engine adds native rendering capability
and larger HAR archives, which also contain emulator libraries. A rebuilt HAP
is needed for a valid installation-size comparison. Further native font/library
subsetting requires the libmark build sources; this branch supplies binaries.

## Verification And Next Step

### Unparsed Source Preview

- Android/Harmony feed network chunks at newline boundaries and publish a separate
  `source` operation for Markdown not yet delivered by libmark. This covers ordinary
  text, headings, lists, quotes, table rows, links and other syntax without guessing
  the final element type. Source is rendered as literal text, never as HTML.
- Parsed output and removal of its source preview travel in the same operation batch.
  Confirmed code/math/Mermaid tails keep their existing in-component preview, avoiding
  duplicate source. Finish and reset clear the generic preview; history rebuilds do
  not persist transient source operations.
- The current native HTML/AST protocol has no source offsets. Newline-bounded input
  keeps pending source aligned with progressive delivery; it does not reparse source
  with a second Markdown engine. Legacy platforms already parse the full snapshot.
- When validating Worker edits, inspect the generated Kotlin as well as build success:
  HBuilderX can reuse the UTS runtime plugin cache despite changes to imported Worker
  files. Rebuilding that generated plugin cache was required for this Android test.

### Highlight And Code Layout Follow-up

- Removed the `uni-highlight/utssdk/app-js/index.uts` entry so App bytecode
  resolves the native implementation. Its WASM implementation fails in the
  Android JavaScript runtime with `no native wasm support detected`.
- Restored the App `CreateHighLighter` class bridge on Android/Harmony; methods
  remain callable across the native boundary. Web/WeChat retain their factory
  and Oniguruma assets. This fix changes UTS source, not fonts, grammars or
  SO/HAR binaries, and requires rebuilding the custom bases.
- Ordinary code content again determines its own horizontal width. Removed
  longest-line width estimates, streaming lookahead space, extra side padding
  and the associated one-frame delay; restored text selection. The scroll
  viewport remains 100% wide. Mermaid uses its original independent component,
  including its 15px source inset and existing theme/tab/preview behavior.
- Both native and legacy render data pass through shared code preparation.
  Escaped source is published immediately for every streaming update. Each completed
  line is highlighted once; the unfinished line stays plain until its newline or
  block completion, avoiding repeated plain/color transitions.
  Code uses
  independently keyed rich-text rows: unchanged prefix rows retain their highlights,
  and only changed row HTML is replaced. Tokenization retains full code context.
  Stale results are rejected and failures retain source. Code views no longer tokenize.
- Native Mermaid SVG and WebView fallback results are prepared outside the
  component and passed through its existing src prop.
- Added two native-caller regression tests using a mock class bridge; these
  validate grammar loading, instance reuse and text/token conversion, but do
  not replace testing the actual native tokenizer in the rebuilt base.

### Uncommitted Scope Audit

- Removed unrelated input-extension spacing/button offsets, extra demo
  scenarios, the imported block-log formatter, Android/Harmony input throttles
  and the change from the existing 1-second storage debounce to a 2-second
  throttle. Final-state saves remain necessary for source-based reconstruction.
- Restored ordinary code layout and recycled-instance highlight reset.
  Formula source sizing uses the same measurements as before; native SVG and
  fallback dispatch remain part of the parser integration.
- Remaining changes cover native parser/bindings, Worker operation delivery,
  historical reconstruction, session cleanup, lazy WebView lifecycle, compatible
  links/tables/highlighting, unused assets/code removal, tests and migration docs.
  Existing user version changes in manifest.json were preserved.
- Follow-up validation: 46 tests pass; 85 source files parse for 5 platforms;
  HBuilderX LSP reports no diagnostics in the changed highlight bridges/caller
  and code component. Android App compilation succeeds and generated JS uses
  the native class proxy without the App Oniguruma WASM loader.
- Compile-only launches can reuse native plugin artifacts. They do not verify
  a rebuilt native base or the visual result. CLI logcat still includes errors
  from earlier hot-update attempts, so device runtime verification remains
  pending the new custom base.

- `node --test tests/*.test.mjs`: 46 passing tests, including new stream,
  storage migration, native Mermaid identity and WebView lifecycle coverage.
- `node tests/check-markdown-static.cjs`: 85 UTS/UVue/ETS files checked after
  conditional preprocessing for Android, Harmony, iOS, Web and WeChat.
- HBuilderX `cli lsp lint --project <root> --file <file>` checked the changed
  Worker, runtime, SDK, libmark bridges and rendering components. Reported
  object-assertion diagnostics were corrected with explicit types.
- `git diff --check` and shell syntax checks passed.
- Web browser verification passed at mobile and desktop viewport sizes:
  code appeared with multiple syntax colors, Mermaid source retained its 15px
  left inset, and switching from the diagram to source worked. No page runtime
  exceptions occurred in the isolated test browser context.

The static checker uses the installed HBuilderX parser/preprocessor. Set
`HBUILDERX_PLUGINS` when the plugins are installed outside the standard macOS
locations. These checks do not replace native compilation or device testing.

**Rebuild and install the Android/Harmony custom bases before runtime testing.**
UTSSDK, Kotlin/native libraries, the Harmony HAR and highlight bindings changed.
Android/Harmony device runtime verification remains pending; the Web checks
above do not verify the native base. After rebuilding, verify streamed Markdown, native formulas and
diagrams, Gantt fallback, interrupted/historical replies and conversation
switching, then compare the produced APK/HAP with the old package.
