# uni-ai x 鸿蒙 libmark 接入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 uni-ai x 鸿蒙平台的 Markdown 解析与渲染从 cmark（Worker + snapshot）切换到 libmark（Worker + 无序列化增量 ops），其他平台保持不变。

**Architecture:** Worker 内调用 libmark UTS 插件（`createSession('ast')` / `feedChunk` / `finishSession`），产出块级 ops 写入主线程创建的共享 Sendable 队列；Worker 发轻量通知，主线程轮询读取队列并驱动适配层（槽位表 + 增量拍平），输出复用现有渲染模型 `MarkdownTextRenderBlock`。

**Tech Stack:** uni-app x（蒸汽模式）/ UTS / ArkTS Sendable / libmark-full.so（HarmonyOS arm64）/ HBuilderX 5.32。

**设计文档:** `docs/superpowers/specs/2026-09-20-libmark-migration-design.md`

## Global Constraints

- **平台隔离**：所有新逻辑使用 `// #ifdef APP-HARMONY` 条件编译；其他平台（Android/iOS/Web/小程序）行为零变化。
- **无序列化通信**：Worker 通信不使用 JSON 字符串快照；数据经共享 `@Sendable` 对象传递。
- **工具链避坑（必读）**：
  1. Worker 里禁止集合索引访问（`items[0]`），集合读写必须封装为 Sendable 类方法；
  2. UTS→ArkTS 编译器会错误拼接连续动态语句，每条 ESObject 动态操作之间用普通语句或独立 try 块隔开；
  3. `uni.createWorker` 参数必须是字符串字面量；
  4. 新插件必须被已引用插件的 `uni_modules.dependencies` 声明，入口需引用相关文件才会进入产物；
  5. 插件内自定义 `WorkerPostMessageOptions` 类型；
  6. Worker 的 `onMessage` 参数标注 `ESObject`（`Object as ESObject` 会触发 ArkTS any 错误）。
- **编码**：所有新建/修改文件 UTF-8 无 BOM；EOL 跟随修改处。
- **构建产物**：`libmark.har`、`unpackage/` 不提交 git。
- **验证环境**：HBuilderX CLI `D:\ProgramFiles\HBuilderX-dev\cli.exe`；鸿蒙设备 HUAWEI Mate 60 Pro（hdc 已连接）；演示入口 `main.uts` 已开启 `demo/markdown/install.uts`（无需 API Key）。
- **编译命令**（每个任务后执行）：
  `& "D:\ProgramFiles\HBuilderX-dev\cli.exe" launch app-harmony --project "D:\dev\DOM2-dev\gitcode-dcloud\uni-ai-x" --ui true`
  日志读取：`node "D:\ProgramFiles\HBuilderX-dev\plugins\hbuilderx-ai-chat\uni-agent\skills\logcat-uniapp-or-uniappx\getLogcat.js" --project_path "..." --platform app-harmony --mode full`
  设备日志：`& "D:\ProgramFiles\Huawei\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe" shell "hilog -x | grep -i <tag>"`

---

### Task 1: 引入 libmark UTS 插件（纯解析）

**Files:**
- Create: `uni_modules/libmark/package.json`
- Create: `uni_modules/libmark/utssdk/interface.uts`
- Create: `uni_modules/libmark/utssdk/app-harmony/index.uts`
- Create: `uni_modules/libmark/utssdk/app-harmony/config.json`
- Create: `uni_modules/libmark/utssdk/app-harmony/libs/libmark.har`（拷贝）
- Modify: `uni_modules/uni-ai-worker-runtime/package.json`（dependencies 加 `libmark`）

**Interfaces:**
- Produces: `createSession(mode?: string): object`、`feedChunk(handle: object, chunk: string): LibmarkEvent | undefined`、`finishSession(handle: object): LibmarkEvent | undefined`、`destroySession(handle: object): void`；类型 `LibmarkOp { op: number; kind: string; content: string; index: number; unchanged: boolean }`、`LibmarkEvent { ops: LibmarkOp[] }`、常量 `OP_APPEND/OP_TAIL/OP_COMMIT/OP_RESET`、`KIND_HTML/KIND_DATA/KIND_AST`

- [ ] **Step 1: 创建插件 package.json**

```json
{
  "id": "libmark",
  "displayName": "libmark",
  "version": "1.0.0",
  "description": "libmark 的 uni-app x UTS 封装，提供 Markdown 流式解析的块级事件接口",
  "keywords": ["libmark", "markdown", "harmony"],
  "engines": { "HBuilderX": "^5.0", "uni-app": "", "uni-app-x": "^5.0" },
  "dcloudext": { "type": "uts" },
  "uni_modules": { "dependencies": [] }
}
```

- [ ] **Step 2: 创建 interface.uts（移植自 libmark demo）**

```uts
export type LibmarkOp = {
	op: number
	kind: string
	content: string
	index: number
	unchanged: boolean
}

export type LibmarkEvent = {
	ops: LibmarkOp[]
}

export const OP_APPEND: number = 1
export const OP_TAIL: number = 2
export const OP_COMMIT: number = 3
export const OP_RESET: number = 4

export const KIND_HTML: string = 'html'
export const KIND_DATA: string = 'data'
export const KIND_AST: string = 'ast'
```

- [ ] **Step 3: 创建 app-harmony/index.uts（移植自 libmark demo）**

```uts
import bridge from 'libmark_bridge.so'
import type { LibmarkEvent } from '../interface.uts'

export function createSession(mode?: string): object {
	return bridge.createSession(mode)
}

export function feedChunk(handle: object, chunk: string): LibmarkEvent | undefined {
	return bridge.feedChunk(handle, chunk) as LibmarkEvent | undefined
}

export function finishSession(handle: object): LibmarkEvent | undefined {
	return bridge.finishSession(handle) as LibmarkEvent | undefined
}

export function destroySession(handle: object): void {
	bridge.destroySession(handle)
}
```

- [ ] **Step 4: 创建 app-harmony/config.json**

```json
{
  "minApiLevel": "9",
  "dependencies": {
    "libmark": "./libs/libmark.har"
  }
}
```

- [ ] **Step 5: 拷贝 HAR 产物并声明依赖**

```powershell
New-Item -ItemType Directory -Force -Path "uni_modules\libmark\utssdk\app-harmony\libs" | Out-Null
Copy-Item "D:\dev\DOM2-dev\libmark\demo\uni-app-x\uni_modules\libmark\utssdk\app-harmony\libs\libmark.har" "uni_modules\libmark\utssdk\app-harmony\libs\libmark.har"
```

`uni_modules/uni-ai-worker-runtime/package.json` 的 `uni_modules.dependencies` 改为：
```json
"dependencies": ["uni-ai-worker", "uni-cmark", "libmark"]
```

- [ ] **Step 6: 编译并验证插件进入产物**

运行编译命令；预期编译通过。检查产物：
```powershell
Get-ChildItem -Recurse -File "unpackage\dist\dev\app-harmony\oh_modules\@uni_modules\libmark" | Select-Object -ExpandProperty FullName
```
预期包含 `utssdk/app-harmony/index.ets` 与 `utssdk/app-harmony/libs/libmark.har`。

- [ ] **Step 7: 提交**

```bash
git add uni_modules/libmark uni_modules/uni-ai-worker-runtime/package.json
git commit -m "feat(harmony): 引入 libmark UTS 插件与 HAR 产物依赖"
```

---

### Task 2: runtime 通信层（Sendable 队列 + chunk）

**Files:**
- Create: `uni_modules/uni-ai-worker-runtime/utssdk/sendable.ets`
- Modify: `uni_modules/uni-ai-worker-runtime/utssdk/interface.uts`
- Modify: `uni_modules/uni-ai-worker-runtime/utssdk/index.uts`

**Interfaces:**
- Consumes: Task 1 无直接依赖
- Produces:
  - `AiWorkerOp = { op: number; kind: string; content: string; index: number; unchanged: boolean }`
  - `takeAiWorkerOps(): AiWorkerOp[]`（主线程读取并推进 readCount）
  - `isLibmarkOpsSupported(): boolean`
  - 内部：`LibmarkOpQueue` / `LibmarkChunk`（`@Sendable`，worker 通过 ESObject 动态调用 `pushOp(op, kind, content, index, unchanged)`、`commitBatch()`）

- [ ] **Step 1: 创建 sendable.ets（队列与 chunk 定义）**

注意：集合读写全部封装为方法/helper；所有跨线程访问都经过这些函数。

```ets
import { collections } from '@kit.ArkTS';

@Sendable
export class LibmarkOpSlot {
  op: number = 0;
  kind: string = '';
  content: string = '';
  index: number = 0;
  unchanged: boolean = false;
}

@Sendable
export class LibmarkOpQueue {
  tag: string = 'libmark-op-queue';
  capacity: number = 0;
  count: number = 0;
  readCount: number = 0;
  slots: collections.Array<LibmarkOpSlot> = new collections.Array<LibmarkOpSlot>();

  pushOp(op: number, kind: string, content: string, index: number, unchanged: boolean): boolean {
    if (this.count >= this.slots.length) return false;
    const slot = this.slots[this.count];
    slot.op = op;
    slot.kind = kind;
    slot.content = content;
    slot.index = index;
    slot.unchanged = unchanged;
    this.count = this.count + 1;
    return true;
  }

  commitBatch(): void {
    // 批次边界做一次空间整理：已读数据整体前移，未读数据保留
    if (this.count >= this.slots.length - 64 && this.readCount > 0) {
      const unread = this.count - this.readCount;
      for (let i = 0; i < unread; i++) {
        const src = this.slots[this.readCount + i];
        const dst = this.slots[i];
        dst.op = src.op;
        dst.kind = src.kind;
        dst.content = src.content;
        dst.index = src.index;
        dst.unchanged = src.unchanged;
      }
      this.count = unread;
      this.readCount = 0;
    }
  }
}

@Sendable
export class LibmarkChunk {
  tag: string = 'libmark-chunk';
  requestVersion: number = 0;
  content: string = '';
  reasoningContent: string = '';
}

export function createOpQueue(capacity: number): LibmarkOpQueue {
  const queue = new LibmarkOpQueue();
  queue.capacity = capacity;
  for (let i = 0; i < capacity; i++) {
    queue.slots.push(new LibmarkOpSlot());
  }
  return queue;
}

export function queueCount(queue: LibmarkOpQueue): number {
  return queue.count;
}

export function queueReadCount(queue: LibmarkOpQueue): number {
  return queue.readCount;
}

export function queueSetReadCount(queue: LibmarkOpQueue, value: number): void {
  queue.readCount = value;
}

export function slotOp(queue: LibmarkOpQueue, index: number): number {
  return queue.slots[index].op;
}

export function slotKind(queue: LibmarkOpQueue, index: number): string {
  return queue.slots[index].kind;
}

export function slotContent(queue: LibmarkOpQueue, index: number): string {
  return queue.slots[index].content;
}

export function slotIndex(queue: LibmarkOpQueue, index: number): number {
  return queue.slots[index].index;
}

export function slotUnchanged(queue: LibmarkOpQueue, index: number): boolean {
  return queue.slots[index].unchanged;
}
```

- [ ] **Step 2: interface.uts 增加类型**

追加：
```uts
export type AiWorkerOp = {
	op: number,
	kind: string,
	content: string,
	index: number,
	unchanged: boolean
}

export type TakeAiWorkerOps = () => AiWorkerOp[]
export type IsLibmarkOpsSupported = () => boolean
```

- [ ] **Step 3: index.uts 接入鸿蒙队列（发送侧）**

顶部增加（条件编译导入）：
```uts
// #ifdef APP-HARMONY
import type { AiWorkerOp } from './interface.uts'
import {
	LibmarkOpQueue,
	LibmarkChunk,
	createOpQueue,
	queueCount,
	queueReadCount,
	queueSetReadCount,
	slotOp,
	slotKind,
	slotContent,
	slotIndex,
	slotUnchanged
} from './sendable.ets'

type SendablePostMessageOptions = {
	harmonySendable ?: boolean
	transfer ?: any[]
}

const OP_QUEUE_CAPACITY = 1024
let opQueue: LibmarkOpQueue | null = null
// #endif
```

`postMarkdownStart` 鸿蒙分支先发队列（保证在 start 消息前）：
```uts
function postMarkdownStart(options: AiWorkerMarkdownStartOptions): void {
	// #ifdef APP-HARMONY
	if (opQueue == null) opQueue = createOpQueue(OP_QUEUE_CAPACITY)!
	worker!.postMessage(opQueue, { harmonySendable: true } as SendablePostMessageOptions)
	// #endif
	worker!.postMessage({
		action: 'start-markdown',
		renderProtocolVersion: WORKER_RENDER_PROTOCOL_VERSION,
		requestVersion: options.requestVersion,
		renderInterval: options.renderInterval ?? 300
	} as UTSJSONObject, null)
	...
}
```

`postMarkdownChunk` 鸿蒙分支改发 SendableChunk：
```uts
function postMarkdownChunk(requestVersion: number, content: string, reasoningContent: string): void {
	// #ifdef APP-HARMONY
	const chunk = new LibmarkChunk()
	chunk.requestVersion = requestVersion
	chunk.content = content
	chunk.reasoningContent = reasoningContent
	worker?.postMessage(chunk, { harmonySendable: true } as SendablePostMessageOptions)
	return
	// #endif
	worker?.postMessage({
		action: 'append-markdown',
		requestVersion: requestVersion,
		content: content,
		reasoningContent: reasoningContent
	} as UTSJSONObject, null)
}
```

- [ ] **Step 4: index.uts 增加读取接口**

```uts
export function takeAiWorkerOps(): AiWorkerOp[] {
	const result = [] as AiWorkerOp[]
	// #ifdef APP-HARMONY
	const queue = opQueue
	if (queue == null) return result
	const count = queueCount(queue)
	const start = queueReadCount(queue)
	if (count <= start) return result
	for (let i = start; i < count; i++) {
		result.push({
			op: slotOp(queue, i),
			kind: slotKind(queue, i),
			content: slotContent(queue, i),
			index: slotIndex(queue, i),
			unchanged: slotUnchanged(queue, i)
		} as AiWorkerOp)
	}
	queueSetReadCount(queue, count)
	// #endif
	return result
}

export function isLibmarkOpsSupported(): boolean {
	// #ifdef APP-HARMONY
	return true
	// #endif
	// #ifndef APP-HARMONY
	return false
	// #endif
}
```

并在 `destroyAiWorkerRuntime`（或现有销毁路径）里将 `opQueue = null`（鸿蒙分支）。

- [ ] **Step 5: 编译验证**

运行编译命令；预期 app-harmony 编译通过（此时队列尚无写入方，`takeAiWorkerOps` 返回空）。

- [ ] **Step 6: 提交**

```bash
git add uni_modules/uni-ai-worker-runtime/utssdk/sendable.ets uni_modules/uni-ai-worker-runtime/utssdk/interface.uts uni_modules/uni-ai-worker-runtime/utssdk/index.uts
git commit -m "feat(harmony): runtime 增加 Sendable ops 队列与 chunk 通信层"
```

---

### Task 3: Worker 侧 libmark session 与 ops 写入

**Files:**
- Modify: `workers/aiRequestWorkerTask.uts`

**Interfaces:**
- Consumes: Task 1 `createSession/feedChunk/finishSession/destroySession`、`LibmarkEvent`；Task 2 的 `LibmarkOpQueue` 约定（`pushOp` / `commitBatch`）、`LibmarkChunk`（`tag='libmark-chunk'`）
- Produces: Worker → 主线程消息 `{ phase: 'libmark-ops', requestVersion }`（轻量通知）

- [ ] **Step 1: 鸿蒙分支导入与状态字段**

文件顶部：
```uts
// #ifdef APP-HARMONY
import { createSession, feedChunk, finishSession, destroySession } from '../uni_modules/libmark'
import type { LibmarkEvent, LibmarkOp } from '../uni_modules/libmark/utssdk/interface.uts'
// #endif
```
类字段：
```uts
	// #ifdef APP-HARMONY
	private libmarkSession: object | null = null
	private opQueue: ESObject | null = null
	// #endif
```

- [ ] **Step 2: onMessage 增加队列/chunk 分支**

在 `onMessage` 开头（现有 action 解析之前）：
```uts
		// #ifdef APP-HARMONY
		const libmarkTag = readEsString(message, 'tag')
		if (libmarkTag == 'libmark-op-queue') {
			this.opQueue = message as ESObject
			return
		}
		if (libmarkTag == 'libmark-chunk') {
			this.handleLibmarkChunk(message as ESObject)
			return
		}
		// #endif
```
辅助函数（文件级）：
```uts
// #ifdef APP-HARMONY
function readEsString(message: any, key: string): string {
	try {
		const obj = message as ESObject
		if (key == 'tag') return obj.tag as string
		return ''
	} catch (error) {
		return ''
	}
}
// #endif
```

- [ ] **Step 3: 实现 libmark session 处理**

```uts
	// #ifdef APP-HARMONY
	private ensureLibmarkSession() {
		if (this.libmarkSession != null) return
		try {
			this.libmarkSession = createSession('ast')
		} catch (error) {
			this.postMessage({ phase: 'libmark-error', errMsg: 'libmark 会话创建失败' } as UTSJSONObject, null)
		}
	}

	private handleLibmarkChunk(chunk: ESObject) {
		if (this.finished) return
		const requestVersion = chunk.requestVersion as number
		if (requestVersion != this.requestVersion) return
		const content = chunk.content as string
		if (content.length == 0) return
		this.eventCount += 1
		this.receivedBytes += content.length
		if (this.libmarkSession == null) this.ensureLibmarkSession()
		if (this.libmarkSession == null) return
		try {
			const event = feedChunk(this.libmarkSession!, content)
			if (event != null) this.enqueueLibmarkOps(event.ops)
		} catch (error) {
			this.fail('libmark_feed_failed', 'libmark 解析失败')
		}
	}

	private enqueueLibmarkOps(ops: LibmarkOp[]) {
		const queue = this.opQueue
		if (queue == null || ops.length == 0) return
		try {
			for (let i = 0; i < ops.length; i++) {
				const op = ops[i]
				queue.pushOp(op.op, op.kind, op.content, op.index, op.unchanged)
			}
			queue.commitBatch()
		} catch (error) {
			return
		}
		this.postMessage({ phase: 'libmark-ops', requestVersion: this.requestVersion } as UTSJSONObject, null)
	}

	private finishLibmarkSession() {
		const session = this.libmarkSession
		if (session != null) {
			try {
				const event = finishSession(session)
				if (event != null) this.enqueueLibmarkOps(event.ops)
			} catch (error) {
			}
			try {
				destroySession(session)
			} catch (error) {
			}
			this.libmarkSession = null
		}
	}
	// #endif
```

- [ ] **Step 4: 在 complete/cancel/reset 路径接入**

- `complete()` 鸿蒙分支：在 `publishSnapshot(true)` 之前调用 `this.finishLibmarkSession()`，并 postMessage `{ phase: 'libmark-complete', requestVersion }`。
- `cancelCurrent()` 鸿蒙分支：`finishLibmarkSession()` 之后置空（或提供 `disposeLibmarkSession()` 直接 destroy 不产出 ops）。
- `resetState()`：将 `libmarkSession/opQueue` 重置为 null（新请求由 runtime 重新发送队列）。

具体改法（在现有函数内部加条件编译块）：
```uts
	private complete() {
		if (this.finished) return
		// #ifdef APP-HARMONY
		this.finishLibmarkSession()
		this.postMessage({ phase: 'libmark-complete', requestVersion: this.requestVersion } as UTSJSONObject, null)
		// #endif
		... 现有逻辑保持 ...
	}
```

- [ ] **Step 5: 编译验证**

编译；预期通过。注意 `fail()` 在鸿蒙的错误路径继续可用。

- [ ] **Step 6: 设备冒烟（queue 写入闭环）**

编译运行后，在首页输入区选择 Markdown 演示场景（如“标题”），观察设备日志：
```powershell
& "D:\ProgramFiles\Huawei\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe" shell "hilog -x | grep -i libmark-ops"
```
预期：worker 有 `libmark-ops` 通知发出（runtime 尚未消费，属 Task 4 内容）。若 worker 报错，检查 `libmark_session` 创建与 bridge 加载日志。

- [ ] **Step 7: 提交**

```bash
git add workers/aiRequestWorkerTask.uts
git commit -m "feat(harmony): worker 接入 libmark session 并将 ops 写入共享队列"
```

---

### Task 4: 适配层 `libmark-ast.uts`（槽位表 + 增量转换）

**Files:**
- Create: `uni_modules/uni-ai-worker/utssdk/libmark-ast.uts`
- Modify: `uni_modules/uni-ai-worker/utssdk/index.uts`（导出）

**Interfaces:**
- Consumes: `AiWorkerOp[]`（Task 2）
- Produces:
  - `LibmarkTextSpan = { text: string; styles: string[]; href: string; isImage: boolean; imageSrc: string; svgSource: string; svgWidth: number; svgHeight: number; svgBaseline: number }`
  - `LibmarkRenderBlock = { kind: string; key: string; text: string; language: string; isComplete: boolean; level: number; indent: number; marker: string; quoteDepth: number; spans: LibmarkTextSpan[]; html: string; columnWidths: number[]; rowTextWidths: number[][]; svgSource: string; svgWidth: number; svgHeight: number }`
  - `class LibmarkStreamAdapter { applyOps(ops: AiWorkerOp[]): void; getBlocks(): LibmarkRenderBlock[]; getCompleteAstJson(): string; reset(): void; hasContent(): boolean }`

- [ ] **Step 1: 创建类型与槽位骨架**

```uts
export type LibmarkTextSpan = {
	text: string
	styles: string[]
	href: string
	isImage: boolean
	imageSrc: string
	svgSource: string
	svgWidth: number
	svgHeight: number
	svgBaseline: number
}

export type LibmarkRenderBlock = {
	kind: string
	key: string
	text: string
	language: string
	isComplete: boolean
	level: number
	indent: number
	marker: string
	quoteDepth: number
	spans: LibmarkTextSpan[]
	html: string
	columnWidths: number[]
	rowTextWidths: number[][]
	svgSource: string
	svgWidth: number
	svgHeight: number
}

// libmark.ast/1 节点类型（字段与 libmark AST JSON 对齐）
type LibmarkAstPayload = {
	media_type?: string
	data?: string
	width?: number
	height?: number
	baseline?: number
}

type LibmarkAstLink = {
	href?: string
	title?: string
	safe?: boolean
}

type LibmarkAstRun = {
	kind?: string
	text?: string
	styles?: string[]
	soft?: boolean
	link?: LibmarkAstLink
	src?: string
	alt?: string
	literal?: string
	plugin?: string
	source?: string
	payload?: LibmarkAstPayload
}

type LibmarkAstBlock = {
	id?: number
	type?: string
	level?: number
	ordered?: boolean
	start?: number
	delim?: string
	tight?: boolean
	checked?: boolean
	info?: string
	literal?: string
	align?: string[]
	plugin?: string
	source?: string
	payload?: LibmarkAstPayload
	runs?: LibmarkAstRun[]
	children?: LibmarkAstBlock[]
}

type LibmarkAstDocument = {
	schema?: string
	blocks?: LibmarkAstBlock[]
}
```

- [ ] **Step 2: 实现槽位表与 ops 应用**

```uts
const OP_APPEND: number = 1
const OP_TAIL: number = 2
const OP_COMMIT: number = 3
const OP_RESET: number = 4

export class LibmarkStreamAdapter {
	private slots: Array<LibmarkAstBlock | null> = []
	private slotBlocks: Array<LibmarkRenderBlock[] | null> = []
	private rows: LibmarkRenderBlock[] = []
	private events: number = 0

	reset(): void {
		this.slots = []
		this.slotBlocks = []
		this.rows = []
		this.events = 0
	}

	hasContent(): boolean {
		return this.rows.length > 0
	}

	applyOps(ops: import('./interface.uts').AiWorkerOp[]): void {
		let changed = false
		for (let i = 0; i < ops.length; i++) {
			const op = ops[i]
			if (op.op == OP_RESET) {
				this.slots = []
				this.slotBlocks = []
				changed = true
				continue
			}
			if (op.kind != 'ast') continue
			let document: LibmarkAstDocument | null = null
			try {
				document = JSON.parse<LibmarkAstDocument>(op.content) as LibmarkAstDocument
			} catch (error) {
				continue
			}
			if (document == null) continue
			const blocks = document.blocks ?? [] as LibmarkAstBlock[]
			if (blocks.length == 0) continue
			const slot = op.index >= 0 ? op.index : 0
			this.slots[slot] = blocks[0]
			this.slotBlocks[slot] = this.convertBlock(blocks[0], slot)
			this.events += 1
			changed = true
		}
		if (changed) this.rebuildRows()
	}

	private rebuildRows(): void {
		const rows = [] as LibmarkRenderBlock[]
		for (let i = 0; i < this.slotBlocks.length; i++) {
			const slot = this.slotBlocks[i]
			if (slot == null) continue
			for (let j = 0; j < slot.length; j++) rows.push(slot[j])
		}
		this.rows = rows
	}

	getBlocks(): LibmarkRenderBlock[] {
		return this.rows
	}
```

- [ ] **Step 3: 实现块转换（文本/标题/列表/引用/hr/code/mermaid/html_block）**

```uts
	private convertBlock(block: LibmarkAstBlock, slotIndex: number): LibmarkRenderBlock[] {
		const result = [] as LibmarkRenderBlock[]
		this.appendBlock(result, block, 0, 0, 'slot-' + slotIndex.toString(), slotIndex)
		return result
	}

	private appendBlock(result: LibmarkRenderBlock[], block: LibmarkAstBlock, indent: number,
		quoteDepth: number, key: string, slotIndex: number) {
		const type = block.type ?? ''
		if (type == 'thematic_break') {
			result.push(this.makeHr(key, indent, quoteDepth))
			return
		}
		if (type == 'code_block') {
			result.push(this.makeCodeBlock(block, key, indent, quoteDepth))
			return
		}
		if (type == 'table') {
			result.push(this.makeTableBlock(block, key, indent, quoteDepth))
			return
		}
		if (type == 'plugin_block') {
			result.push(this.makeMathBlock(block, key, indent, quoteDepth))
			return
		}
		if (type == 'html_block') {
			const text = this.htmlToPlainText(block.literal ?? '')
			if (text.length > 0) {
				result.push(this.makeTextBlock('paragraph', key, this.plainSpans(text), 0, indent, '', quoteDepth))
			}
			return
		}
		if (type == 'block_quote') {
			const children = block.children ?? [] as LibmarkAstBlock[]
			for (let i = 0; i < children.length; i++) {
				this.appendBlock(result, children[i], indent, quoteDepth + 1,
					key + '-quote-' + i.toString(), slotIndex)
			}
			return
		}
		if (type == 'list') {
			this.appendList(result, block, indent, quoteDepth, key, slotIndex)
			return
		}
		if (type == 'heading') {
			const level = Math.max(1, Math.min(block.level ?? 1, 6))
			result.push(this.makeTextBlock('heading', key, this.runsToSpans(block.runs ?? [] as LibmarkAstRun[]),
				level, indent, '', quoteDepth))
			return
		}
		// paragraph 与未知类型按段落
		const spans = this.runsToSpans(block.runs ?? [] as LibmarkAstRun[])
		if (spans.length > 0) {
			result.push(this.makeTextBlock('paragraph', key, spans, 0, indent, '', quoteDepth))
		}
	}

	private appendList(result: LibmarkRenderBlock[], list: LibmarkAstBlock, indent: number,
		quoteDepth: number, key: string, slotIndex: number) {
		const items = list.children ?? [] as LibmarkAstBlock[]
		for (let i = 0; i < items.length; i++) {
			const item = items[i]
			const marker = this.listMarker(list, item, i)
			const children = item.children ?? [] as LibmarkAstBlock[]
			let hasText = false
			for (let j = 0; j < children.length; j++) {
				const child = children[j]
				const childType = child.type ?? ''
				if (childType == 'paragraph' || childType == 'heading') {
					result.push(this.makeTextBlock('list',
						key + '-item-' + i.toString() + '-' + j.toString(),
						this.runsToSpans(child.runs ?? [] as LibmarkAstRun[]),
						childType == 'heading' ? (child.level ?? 0) : 0,
						indent, marker, quoteDepth))
					hasText = true
					continue
				}
				if (childType == 'list') {
					this.appendList(result, child, indent + 1, quoteDepth,
						key + '-item-' + i.toString(), slotIndex)
					continue
				}
				if (childType == 'block_quote' || childType == 'code_block'
					|| childType == 'table' || childType == 'thematic_break'
					|| childType == 'plugin_block' || childType == 'html_block') {
					this.appendBlock(result, child, indent, quoteDepth,
						key + '-item-' + i.toString() + '-child-' + j.toString(), slotIndex)
					continue
				}
				const fallbackSpans = this.runsToSpans([child])
				if (fallbackSpans.length > 0) {
					result.push(this.makeTextBlock('list',
						key + '-item-' + i.toString() + '-inline', fallbackSpans,
						0, indent, marker, quoteDepth))
					hasText = true
				}
			}
			if (!hasText) {
				// 空项或仅含嵌套内容：保留标记行
				const itemSpans = this.runsToSpans(item.runs ?? [] as LibmarkAstRun[])
				if (itemSpans.length > 0) {
					result.push(this.makeTextBlock('list', key + '-item-' + i.toString(),
						itemSpans, 0, indent, marker, quoteDepth))
				}
			}
		}
	}

	private listMarker(list: LibmarkAstBlock, item: LibmarkAstBlock, index: number): string {
		if (item.checked != null) return item.checked! ? '☑ ' : '☐ '
		if (list.ordered == true) {
			const start = list.start ?? 1
			return (start + index).toString() + '. '
		}
		return '• '
	}
```

- [ ] **Step 4: 行内 runs 转换（文本/代码/链接/图片/换行/行内公式）**

```uts
	private runsToSpans(runs: LibmarkAstRun[]): LibmarkTextSpan[] {
		const spans = [] as LibmarkTextSpan[]
		for (let i = 0; i < runs.length; i++) {
			this.appendRun(spans, runs[i], [] as string[])
		}
		return spans
	}

	private appendRun(spans: LibmarkTextSpan[], run: LibmarkAstRun, styles: string[]) {
		const kind = run.kind ?? 'text'
		if (kind == 'text') {
			const text = run.text ?? ''
			if (text.length > 0) spans.push(this.makeSpan(text, styles))
			return
		}
		if (kind == 'code') {
			spans.push(this.makeSpan(run.text ?? '', styles.concat(['code'] as string[])))
			return
		}
		if (kind == 'break') {
			spans.push(this.makeSpan(run.soft == true ? ' ' : '\n', styles))
			return
		}
		if (kind == 'link') {
			const href = run.link?.href ?? ''
			const text = run.text ?? ''
			if (text.length > 0) spans.push(this.makeSpan(text, styles.concat(['link'] as string[]), href))
			return
		}
		if (kind == 'image') {
			const src = run.src ?? ''
			if (src.length > 0) {
				const span = this.makeSpan(run.alt ?? '', styles)
				span.isImage = true
				span.imageSrc = src
				spans.push(span)
			}
			return
		}
		if (kind == 'plugin') {
			const payload = run.payload
			if (payload != null && payload.data != null) {
				const span = this.makeSpan(run.source ?? '', styles)
				span.isImage = true
				span.imageSrc = payload.data!
				span.svgWidth = payload.width ?? 0
				span.svgHeight = payload.height ?? 0
				span.svgBaseline = payload.baseline ?? 0
				spans.push(span)
			} else {
				spans.push(this.makeSpan(run.source ?? '', styles.concat(['code'] as string[])))
			}
			return
		}
		if (kind == 'raw_html') {
			spans.push(this.makeSpan(run.literal ?? '', styles))
			return
		}
		const text = run.text ?? run.literal ?? ''
		if (text.length > 0) spans.push(this.makeSpan(text, styles))
	}
```

- [ ] **Step 5: 代码块/mermaid/表格/公式块构造**

```uts
	private makeCodeBlock(block: LibmarkAstBlock, key: string, indent: number,
		quoteDepth: number): LibmarkRenderBlock {
		const info = (block.info ?? '').split(' ')[0]
		let kind = 'code'
		let language = info.length > 0 ? info : 'text'
		if (info == 'mermaid') {
			kind = 'mermaid'
			language = 'mermaid'
		}
		const result = this.makeTextBlock(kind, key, [] as LibmarkTextSpan[], 0, indent, '', quoteDepth)
		result.text = (block.literal ?? '').replace(/\n$/, '')
		result.language = language
		result.isComplete = true
		return result
	}

	private makeMathBlock(block: LibmarkAstBlock, key: string, indent: number,
		quoteDepth: number): LibmarkRenderBlock {
		const result = this.makeTextBlock('math', key, [] as LibmarkTextSpan[], 0, indent, '', quoteDepth)
		const payload = block.payload
		if (payload != null && payload.data != null) {
			result.svgSource = payload.data!
			result.svgWidth = payload.width ?? 0
			result.svgHeight = payload.height ?? 0
			result.isComplete = true
		} else {
			result.text = block.source ?? ''
			result.isComplete = false
		}
		return result
	}

	private makeTableBlock(block: LibmarkAstBlock, key: string, indent: number,
		quoteDepth: number): LibmarkRenderBlock {
		const html = this.tableAstToHtml(block)
		const prepared = prepareMarkdownTable(html, 0)
		const result = this.makeTextBlock('table', key, [] as LibmarkTextSpan[], 0, indent, '', quoteDepth)
		result.html = prepared.html
		result.columnWidths = prepared.columnWidths
		result.rowTextWidths = prepared.rowTextWidths
		return result
	}

	private tableAstToHtml(node: LibmarkAstBlock): string {
		const alignments = node.align ?? [] as string[]
		const rows = node.children ?? [] as LibmarkAstBlock[]
		let headerHtml = ''
		let bodyHtml = ''
		for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
			const row = rows[rowIndex]
			const cells = row.children ?? [] as LibmarkAstBlock[]
			const isHeader = rowIndex == 0
			const tag = isHeader ? 'th' : 'td'
			let rowHtml = '<tr>'
			for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
				const align = cellIndex < alignments.length ? alignments[cellIndex] : 'left'
				rowHtml += '<' + tag + ' style="text-align:' + (align.length > 0 ? align : 'left') + '">' +
					this.runsToHtml(cells[cellIndex].runs ?? [] as LibmarkAstRun[]) + '</' + tag + '>'
			}
			rowHtml += '</tr>'
			if (isHeader) headerHtml += rowHtml
			else bodyHtml += rowHtml
		}
		let html = '<table>'
		if (headerHtml.length > 0) html += '<thead>' + headerHtml + '</thead>'
		if (bodyHtml.length > 0) html += '<tbody>' + bodyHtml + '</tbody>'
		return html + '</table>'
	}

	private runsToHtml(runs: LibmarkAstRun[]): string {
		let result = ''
		for (let i = 0; i < runs.length; i++) {
			const run = runs[i]
			const kind = run.kind ?? 'text'
			if (kind == 'text') {
				result += this.escapeHtml(run.text ?? '')
			} else if (kind == 'code') {
				result += '<code>' + this.escapeHtml(run.text ?? '') + '</code>'
			} else if (kind == 'link') {
				result += '<a href="' + this.escapeHtml(run.link?.href ?? '') + '">' +
					this.escapeHtml(run.text ?? '') + '</a>'
			} else if (kind == 'image') {
				result += '<img src="' + this.escapeHtml(run.src ?? '') + '" />'
			} else if (kind == 'plugin') {
				const payload = run.payload
				if (payload != null && payload.data != null) {
					result += '<img src="' + this.escapeHtml(payload.data!) + '" />'
				} else {
					result += this.escapeHtml(run.source ?? '')
				}
			} else if (kind == 'break') {
				result += '<br>'
			} else {
				result += this.escapeHtml(run.text ?? run.literal ?? '')
			}
		}
		return result
	}
```

- [ ] **Step 6: 构造/工具函数与完整 AST 序列化**

```uts
	private makeSpan(text: string, styles: string[] = [] as string[], href: string = ''): LibmarkTextSpan {
		return {
			text: text, styles: styles, href: href, isImage: false, imageSrc: '',
			svgSource: '', svgWidth: 0, svgHeight: 0, svgBaseline: 0
		} as LibmarkTextSpan
	}

	private plainSpans(text: string): LibmarkTextSpan[] {
		return [this.makeSpan(text)] as LibmarkTextSpan[]
	}

	private makeTextBlock(kind: string, key: string, spans: LibmarkTextSpan[], level: number = 0,
		indent: number = 0, marker: string = '', quoteDepth: number = 0): LibmarkRenderBlock {
		return {
			kind: kind, key: key, text: '', language: '', isComplete: true,
			level: level, indent: indent, marker: marker, quoteDepth: quoteDepth,
			spans: spans, html: '', columnWidths: [] as number[], rowTextWidths: [] as number[][],
			svgSource: '', svgWidth: 0, svgHeight: 0
		} as LibmarkRenderBlock
	}

	private makeHr(key: string, indent: number, quoteDepth: number): LibmarkRenderBlock {
		return this.makeTextBlock('hr', key, [] as LibmarkTextSpan[], 0, indent, '', quoteDepth)
	}

	private escapeHtml(text: string): string {
		let result = text.replace(/&/g, '&amp;')
		result = result.replace(/</g, '&lt;')
		result = result.replace(/>/g, '&gt;')
		result = result.replace(/"/g, '&quot;')
		return result
	}

	private htmlToPlainText(html: string): string {
		let result = html.replace(/<br\s*\/?\s*>/gi, '\n')
		result = result.replace(/<[^>]+>/g, '')
		return result.trim()
	}

	getCompleteAstJson(): string {
		const blocks = [] as LibmarkAstBlock[]
		for (let i = 0; i < this.slots.length; i++) {
			const slot = this.slots[i]
			if (slot != null) blocks.push(slot)
		}
		return JSON.stringify({ schema: 'libmark.ast/1', blocks: blocks } as LibmarkAstDocument)
	}
}
```

顶部导入：
```uts
import { prepareMarkdownTable, PreparedMarkdownTable } from './markdown-html.uts'
import type { AiWorkerOp } from './interface.uts'
```
注意：`interface.uts` 尚未定义 `AiWorkerOp`，本任务同时在 `uni-ai-worker/utssdk/interface.uts` 中新增：
```uts
export type AiWorkerOp = {
	op: number
	kind: string
	content: string
	index: number
	unchanged: boolean
}
```

- [ ] **Step 7: 导出并编译**

`uni_modules/uni-ai-worker/utssdk/index.uts` 追加：
```uts
export * from './libmark-ast.uts'
```
编译；预期通过。若 `import('./interface.uts')` 内联类型语法报错，改为文件顶部正常 import。

- [ ] **Step 8: 提交**

```bash
git add uni_modules/uni-ai-worker/utssdk/libmark-ast.uts uni_modules/uni-ai-worker/utssdk/interface.uts uni_modules/uni-ai-worker/utssdk/index.uts
git commit -m "feat(harmony): 新增 libmark AST 槽位适配层与增量转换"
```

---

### Task 5: uni-ai-x 侧转换层与类型扩展

**Files:**
- Modify: `uni_modules/uni-ai-x/sdk/markdown-text.uts`（新增 `libmarkRenderBlocksToTextBlocks`）
- Modify: `uni_modules/uni-ai-x/sdk/markdown-rich-text.uts` 无需改
- Create: `uni_modules/uni-ai-x/sdk/libmark-stream-store.uts`（适配层实例管理与 ops 应用）
- Modify: `uni_modules/uni-ai-x/types.uts`（`MsgItem` 增加 `libmarkRevision?: number`）

**Interfaces:**
- Consumes: Task 4 `LibmarkRenderBlock`/`LibmarkStreamAdapter`；Task 2 `AiWorkerOp`
- Produces:
  - `libmarkRenderBlocksToTextBlocks(blocks: LibmarkRenderBlock[], isDone: boolean): MarkdownTextRenderBlock[]`
  - `libmarkStreamApply(msgId: string, ops: AiWorkerOp[]): boolean`、`libmarkStreamGetBlocks(msgId: string): MarkdownTextRenderBlock[]`、`libmarkStreamComplete(msgId: string): string`（返回完整 AST JSON）、`libmarkStreamReset(msgId: string): void`、`libmarkStreamLoadFromAst(msgId: string, astJson: string): boolean`
  - `MarkdownTextRenderBlock` 新可选字段：`svgSource: string`、`svgWidth: number`、`svgHeight: number`

- [ ] **Step 1: `markdown-text.uts` 扩展类型与转换**

`MarkdownTextRenderBlock` 追加字段（默认值在现有构造处补全）：
```uts
	svgSource: string
	svgWidth: number
	svgHeight: number
```
在所有 `createTextBlock` / `createSpecialBlock` 返回对象中补充 `svgSource: '', svgWidth: 0, svgHeight: 0`。

新增转换函数（文件末尾）：
```uts
export function libmarkRenderBlocksToTextBlocks(blocks: LibmarkRenderBlock[],
	isDone: boolean = false): MarkdownTextRenderBlock[] {
	const result = [] as MarkdownTextRenderBlock[]
	for (let index = 0; index < blocks.length; index++) {
		const block = blocks[index]
		if (block.kind == 'table' || block.kind == 'code' || block.kind == 'mermaid') {
			const special = createSpecialBlock(block.kind, block.key, block.html, block.text,
				block.language, block.isComplete, block.columnWidths, block.rowTextWidths)
			result.push(special)
			continue
		}
		if (block.kind == 'math') {
			const mathBlock = createTextBlock('math', block.key, emptySpans())
			mathBlock.text = block.text
			mathBlock.isComplete = block.isComplete
			mathBlock.svgSource = block.svgSource
			mathBlock.svgWidth = block.svgWidth
			mathBlock.svgHeight = block.svgHeight
			result.push(mathBlock)
			continue
		}
		if (block.kind == 'hr') {
			result.push(createTextBlock('hr', block.key, emptySpans(), 0, block.indent, '', block.quoteDepth))
			continue
		}
		const spans = [] as MarkdownTextSpan[]
		for (let spanIndex = 0; spanIndex < block.spans.length; spanIndex++) {
			const span = block.spans[spanIndex]
			let className = 'uni-ai-md-text-span'
			for (let styleIndex = 0; styleIndex < span.styles.length; styleIndex++) {
				className += ' uni-ai-md-text-span-' + span.styles[styleIndex]
			}
			const textSpan = makeSpan(span.text, span.styles, span.href, span.isImage, span.imageSrc)
			spans.push(textSpan)
		}
		result.push(createTextBlock(block.kind, block.key, spans, block.level,
			block.indent, block.marker, block.quoteDepth))
	}
	return result
}
```
顶部导入 `LibmarkRenderBlock`：
```uts
import { LibmarkRenderBlock } from '@/uni_modules/uni-ai-worker/utssdk/libmark-ast.uts'
```

- [ ] **Step 2: 创建 `libmark-stream-store.uts`**

```uts
import { AiWorkerOp } from '@/uni_modules/uni-ai-worker/utssdk/interface.uts'
import { LibmarkStreamAdapter, LibmarkRenderBlock } from '@/uni_modules/uni-ai-worker/utssdk/libmark-ast.uts'
import { libmarkRenderBlocksToTextBlocks, MarkdownTextRenderBlock } from '@/uni_modules/uni-ai-x/sdk/markdown-text.uts'

type LibmarkStreamEntry = {
	adapter: LibmarkStreamAdapter
	textBlocks: MarkdownTextRenderBlock[]
}

const entries = new Map<string, LibmarkStreamEntry>()

function ensureEntry(msgId: string): LibmarkStreamEntry {
	let entry = entries.get(msgId)
	if (entry == null) {
		entry = {
			adapter: new LibmarkStreamAdapter(),
			textBlocks: [] as MarkdownTextRenderBlock[]
		} as LibmarkStreamEntry
		entries.set(msgId, entry)
	}
	return entry!
}

export function libmarkStreamApply(msgId: string, ops: AiWorkerOp[]): boolean {
	if (ops.length == 0) return false
	const entry = ensureEntry(msgId)
	entry.adapter.applyOps(ops)
	entry.textBlocks = libmarkRenderBlocksToTextBlocks(entry.adapter.getBlocks(), false)
	return true
}

export function libmarkStreamGetBlocks(msgId: string): MarkdownTextRenderBlock[] {
	const entry = entries.get(msgId)
	return entry == null ? [] as MarkdownTextRenderBlock[] : entry.textBlocks
}

export function libmarkStreamComplete(msgId: string): string {
	const entry = entries.get(msgId)
	if (entry == null) return ''
	entry.textBlocks = libmarkRenderBlocksToTextBlocks(entry.adapter.getBlocks(), true)
	return entry.adapter.getCompleteAstJson()
}

export function libmarkStreamLoadFromAst(msgId: string, astJson: string): boolean {
	if (astJson.length == 0) return false
	const entry = ensureEntry(msgId)
	entry.adapter.reset()
	const ops = [{
		op: 1, kind: 'ast', content: astJson, index: 0, unchanged: false
	} as AiWorkerOp]
	// 历史消息的完整 AST 需要按块展开为槽位：adapter 提供 loadDocument
	entry.adapter.loadDocument(astJson)
	entry.textBlocks = libmarkRenderBlocksToTextBlocks(entry.adapter.getBlocks(), true)
	return entry.textBlocks.length > 0
}

export function libmarkStreamReset(msgId: string): void {
	const entry = entries.get(msgId)
	if (entry == null) return
	entry.adapter.reset()
	entry.textBlocks = []
}

export function libmarkStreamRelease(msgId: string): void {
	entries.delete(msgId)
}
```
> 注：`loadDocument` 需要在 Task 4 的适配层补充：解析完整文档、按 `blocks` 顺序填入槽位并重建。实现：
> ```uts
> 	loadDocument(astJson: string): void {
> 		this.reset()
> 		let document: LibmarkAstDocument | null = null
> 		try {
> 			document = JSON.parse<LibmarkAstDocument>(astJson) as LibmarkAstDocument
> 		} catch (error) {
> 			return
> 		}
> 		if (document == null) return
> 		const blocks = document.blocks ?? [] as LibmarkAstBlock[]
> 		for (let i = 0; i < blocks.length; i++) {
> 			this.slots[i] = blocks[i]
> 			this.slotBlocks[i] = this.convertBlock(blocks[i], i)
> 		}
> 		this.rebuildRows()
> 	}
> ```
> 把此方法补进 Task 4 的类实现（本任务同步修改 `libmark-ast.uts`）。

- [ ] **Step 3: `types.uts` 增加响应式字段**

在 `MsgItem` 类型中追加：
```uts
	libmarkRevision?: number
```

- [ ] **Step 4: 编译验证**

编译；预期通过（转换层被引用前不会报错）。

- [ ] **Step 5: 提交**

```bash
git add uni_modules/uni-ai-x/sdk/markdown-text.uts uni_modules/uni-ai-x/sdk/libmark-stream-store.uts uni_modules/uni-ai-x/types.uts uni_modules/uni-ai-worker/utssdk/libmark-ast.uts
git commit -m "feat(harmony): 增加 libmark 渲染转换层与流式状态存储"
```

---

### Task 6: runner/UI 接线（增量 ops 消费）

**Files:**
- Modify: `uni_modules/uni-ai-x/sdk/requestAiRunner.uts`
- Modify: `uni_modules/uni-ai-x/sdk/index.uts`（answerQuestion 的 callbacks 区域）
- Modify: `uni_modules/uni-ai-x/components/uni-ai-chat.uvue`
- Modify: `demo/markdown/markdown-demo-runner.uts`

**Interfaces:**
- Consumes: Task 2 `takeAiWorkerOps`/`isLibmarkOpsSupported`；Task 5 `libmarkStreamApply/libmarkStreamGetBlocks/libmarkStreamComplete/libmarkStreamReset`
- Produces: `RequestAiRunnerCallbacks` 新增可选 `onMarkdownAstDelta?: (ops: AiWorkerOp[]) => void`（可用现有 `onMarkdownAst` 替代，见步骤说明）

- [ ] **Step 1: `requestAiRunner.uts` 鸿蒙分支消费 ops**

在 `pollWorkerSnapshot` 内、现有 snapshot 读取之前（`#ifdef APP-HARMONY`）先读取 ops：
```uts
		// #ifdef APP-HARMONY
		const ops = takeAiWorkerOps()
		if (ops.length > 0) {
			this.callbacks?.onMarkdownAstDelta?.(ops)
		}
		// #endif
```
导入：
```uts
// #ifdef APP-HARMONY
import { takeAiWorkerOps } from '@/uni_modules/uni-ai-worker-runtime'
import type { AiWorkerOp } from '@/uni_modules/uni-ai-worker/utssdk/interface.uts'
// #endif
```
`RequestAiRunnerCallbacks` 类型定义处追加：
```uts
	onMarkdownAstDelta?: (ops: AiWorkerOp[]) => void
```

> 说明：鸿蒙分支下 `readAiWorkerSnapshot()` 的现有 snapshot 逻辑保持运行（snapshot 用于 msgBody/thinkContent/完成状态），但 html/ast 字段为空；渲染数据走 ops。`onMarkdownAst(readSnapshotString(snapshot,'ast'))` 在鸿蒙会传空串，UI 分派逻辑按空值跳过 cmark 路径。

- [ ] **Step 2: `sdk/index.uts` 的 answerQuestion 接入 store**

在 `runnerCallbacks` 定义处（`answerQuestion` 内）增加：
```uts
			onMarkdownAstDelta: (ops: AiWorkerOp[]) => {
				if (this.currentChat!.state == 'stop') return
				if (libmarkStreamApply(aiMsgItem._id, ops)) {
					aiMsgItem.libmarkRevision = (aiMsgItem.libmarkRevision ?? 0) + 1
				}
			},
```
导入：
```uts
// #ifdef APP-HARMONY
import { libmarkStreamApply, libmarkStreamComplete, libmarkStreamReset } from '@/uni_modules/uni-ai-x/sdk/libmark-stream-store.uts'
// #endif
```
完成路径（`onState('completed')` 或 `onRendered(true)` 处），鸿蒙分支：
```uts
			onState: (state: string) => {
				this.currentChat!.state = state
				if (state == 'stop') {
					aiMsgItem.rendered = true
				}
				// #ifdef APP-HARMONY
				if (state == 'completed') {
					const astJson = libmarkStreamComplete(aiMsgItem._id)
					if (astJson.length > 0) aiMsgItem.markdownAst = astJson
					aiMsgItem.libmarkRevision = (aiMsgItem.libmarkRevision ?? 0) + 1
				}
				// #endif
				this.updateMsg2Storage(aiMsgItem)
			},
```
`resetMsg(msg)` 与 `deleteMsgFrom` 中调用 `libmarkStreamReset(msgId)`（鸿蒙分支）。

- [ ] **Step 3: `uni-ai-chat.uvue` 的 blocks 获取分派**

`getMarkdownBlocks(msg)` 修改（在现有 ast 分支之前）：
```uts
	// #ifdef APP-HARMONY
	const libmarkBlocks = libmarkStreamGetBlocks(msg._id)
	if (libmarkBlocks.length > 0) {
		return libmarkBlocks
	}
	if ((msg.markdownAst ?? '').indexOf('"libmark.ast/1"') >= 0) {
		if (libmarkStreamLoadFromAst(msg._id, msg.markdownAst!)) {
			return libmarkStreamGetBlocks(msg._id)
		}
	}
	// #endif
```
关键：`renderItemList` 需要订阅 `msg.libmarkRevision` 才能触发重算。现有 `msgList` computed 依赖 `uniAi.currentChat?.msgList`（reactive 数组），修改消息字段会触发列表更新（现有 markdownHtml/markdownAst 更新即依赖此机制）。`libmarkRevision` 作为 reactive 对象字段，更新后 `renderItemList` 会重算（与现有 `msg.rendered` 等一致）。
导入：
```uts
	// #ifdef APP-HARMONY
	import { libmarkStreamGetBlocks, libmarkStreamLoadFromAst } from '@/uni_modules/uni-ai-x/sdk/libmark-stream-store.uts'
	// #endif
```
同时 `markdownBlockCache` 的键值比较对鸿蒙路径不再生效（不影响）；`getMarkdownBlocks` 开头鸿蒙分支直接返回。

历史消息场景（鸿蒙重新打开会话）：`msg.markdownAst` 为 libmark schema → `libmarkStreamLoadFromAst` → 返回 blocks。

- [ ] **Step 4: 演示 runner 接入**

`demo/markdown/markdown-demo-runner.uts` 与 `requestAiRunner` 同构：在 `pollWorkerSnapshot` 增加鸿蒙 ops 读取回调（保持演示模式可验证）。`RequestAiRunnerCallbacks` 已含 `onMarkdownAstDelta`，在 `sdk/index.uts` 注册（Step 2）后演示 runner 无需额外改动（它调用同一 callbacks）。

- [ ] **Step 5: 编译 + 设备端到端验证**

编译运行；在鸿蒙首页输入区选择“标题”场景，预期：
- 消息流式出现标题文本（原生渲染）
- 设备日志无 worker/ArkTS 错误
- 选择“完整的Markdown”场景，代码块/表格/公式/列表/引用全部渲染
- 选择“表格”场景，表格展示且可横向滚动

- [ ] **Step 6: 提交**

```bash
git add uni_modules/uni-ai-x/sdk/requestAiRunner.uts uni_modules/uni-ai-x/sdk/index.uts uni_modules/uni-ai-x/components/uni-ai-chat.uvue demo/markdown/markdown-demo-runner.uts
git commit -m "feat(harmony): runner 与聊天 UI 接入 libmark 增量 ops 渲染"
```

---

### Task 7: 数学公式 SVG 直显

**Files:**
- Modify: `uni_modules/uni-ai-x/components/uni-ai-msg-math/uni-ai-msg-math.uvue`
- Modify: `uni_modules/uni-ai-x/components/uni-ai-x-msg/uni-ai-x-msg.uvue`（传递新 props）

**Interfaces:**
- Consumes: `MarkdownTextRenderBlock.svgSource/svgWidth/svgHeight`（Task 5）
- Produces: 无需新增导出

- [ ] **Step 1: `uni-ai-msg-math.uvue` 增加直显分支**

`props` 增加：
```uts
        svgSource?: string
        svgWidth?: number
        svgHeight?: number
```
在 `syncMathImageTheme()` 最前（`isClosed` 判断之前）增加 libmark 直显路径：
```uts
        // libmark 原生 SVG：直接显示 payload，不经过 proxyWeb
        const nativeSvg = (props.svgSource ?? '').length > 0
        if (nativeSvg) {
            const isClosedForSvg = (props.isClose ?? 0) == 1
            if (!isClosedForSvg) {
                // 流式未完成：继续显示源码
                resetMathImages()
                mathImageModeLatched.value = false
                mathRenderRequestKey = ''
                return
            }
            mathImageModeLatched.value = true
            mathImageLoadFailed.value = false
            const svgWidth = props.svgWidth ?? 0
            const svgHeight = props.svgHeight ?? 0
            queueMathImage(props.svgSource!, svgWidth > 0 ? svgWidth : 1, svgHeight > 0 ? svgHeight : 1)
            return
        }
```
`watch` 依赖增加 `props.svgSource`（字符串拼接进 watch key）。

- [ ] **Step 2: `uni-ai-x-msg.uvue` 传递 props**

```html
		<uni-ai-msg-math v-else-if="part.block != null && part.block.kind == 'math'"
			:text="part.block.text" :is-close="part.block.isComplete ? 1 : 0"
			:svg-source="part.block.svgSource" :svg-width="part.block.svgWidth" :svg-height="part.block.svgHeight" />
```

- [ ] **Step 3: 编译 + 设备验证**

选择“公式”场景：块公式应显示 SVG 图片（而非源码/proxyWeb 渲染）；行内公式随文本显示为图片。
若 libmark 降级（无 payload），显示源码——符合预期。

- [ ] **Step 4: 提交**

```bash
git add uni_modules/uni-ai-x/components/uni-ai-msg-math/uni-ai-msg-math.uvue uni_modules/uni-ai-x/components/uni-ai-x-msg/uni-ai-x-msg.uvue
git commit -m "feat(harmony): 数学公式使用 libmark 原生 SVG 直显"
```

---

### Task 8: 场景回归与收尾

**Files:**
- Modify: `uni_modules/uni-ai-worker/utssdk/markdown-ast.uts`（可选：schema 分派辅助）
- 视验证结果微调相关文件

- [ ] **Step 1: 全场景设备回归**

依次运行演示场景并在设备上检查：完整的Markdown、标题、列表、表格、引用、代码、链接、公式、流程图、分割线、长文本、混合。
记录问题清单；流程图预期走 proxyWeb 正常渲染（libmark 不解析 mermaid）。

- [ ] **Step 2: 边界验证**

- 中止请求：处理中点击停止 → 无崩溃、session 销毁
- 历史消息：杀掉 App 重开 → 旧 cmark 消息与新 libmark 消息同会话均正常渲染
- 主题切换：深色/浅色下公式 SVG、表格颜色正常
- 长文本流式：贴底跟随、无白屏/闪烁

- [ ] **Step 3: 其他平台回归**

至少验证 Web 与 Android 编译预览：cmark 链路行为与改造前一致（消息渲染、公式 proxyWeb）。
```powershell
& "D:\ProgramFiles\HBuilderX-dev\cli.exe" launch web --project "D:\dev\DOM2-dev\gitcode-dcloud\uni-ai-x" --browser Chrome --ui true
```

- [ ] **Step 4: 清理与文档**

- 移除调试日志（如有）
- 更新 `UNIAGENT.md`/README 若需要
- 确认 `git status` 无多余文件（`libmark.har`、`unpackage` 不提交）

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "chore(harmony): libmark 接入回归与收尾"
```

---

## 自审记录

- **Spec 覆盖**：设计文档 12 节均有对应任务（Task 1 构建集成 / Task 2 通信层 / Task 3 Worker / Task 4-6 渲染链路 / Task 7 公式 / Task 8 验证）。
- **类型一致性**：`AiWorkerOp` 在 worker-runtime（Task 2）与 uni-ai-worker（Task 4）两处定义，均为 `{op, kind, content, index, unchanged}`；队列方法名 `pushOp/commitBatch` 在 Task 2（定义）与 Task 3（调用）一致；`LibmarkRenderBlock` 字段在 Task 4（定义）、Task 5（消费）一致。
- **已知取舍**：
  - 鸿蒙完成态同时保留 snapshot 通道（msgBody/thinkContent/流程状态），仅渲染数据走 ops；
  - `markdownHtml` 在鸿蒙新消息留空；HTML 兜底仅服务其他平台/旧消息；
  - ops 队列容量 1024，溢出时 `pushOp` 返回 false（丢弃并依赖 tail 全量快照纠正，不阻塞流）。
- **待实施时确认**：`takeAiWorkerOps` 在 runner 50ms 轮询中调用成本；`libmarkStreamApply` 每次全量转换 blocks 的性能（必要时改为按槽位缓存）。
