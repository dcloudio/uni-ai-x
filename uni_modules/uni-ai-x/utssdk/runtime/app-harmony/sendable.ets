import { collections } from '@kit.ArkTS';

@Sendable
export class UniAiMdOpEntry {
	tag: string = 'uni-ai-md-op';
	requestVersion: number = 0;
	op: number = 0;
	kind: string = '';
	content: string = '';
	index: number = 0;
	unchanged: boolean = false;
}

@Sendable
export class UniAiMdOpBatch {
	tag: string = 'uni-ai-md-op-batch';
	requestVersion: number = 0;
	ops: collections.Array<UniAiMdOpEntry> = new collections.Array<UniAiMdOpEntry>();

	pushOp(op: number, kind: string, content: string, index: number, unchanged: boolean): void {
		const entry = new UniAiMdOpEntry();
		entry.requestVersion = this.requestVersion;
		entry.op = op;
		entry.kind = kind;
		entry.content = content;
		entry.index = index;
		entry.unchanged = unchanged;
		this.ops.push(entry);
	}
}

@Sendable
export class UniAiMdChunk {
	tag: string = 'uni-ai-md-chunk';
	requestVersion: number = 0;
	content: string = '';
	reasoningContent: string = '';
}

@Sendable
export class AiWorkerState {
	tag: string = 'ai-worker-state';
	requestVersion: number = 0;
	snapshotVersion: number = 0;
	phase: string = '';
	msgBody: string = '';
	thinkContent: string = '';
	eventCount: number = 0;
	networkChunkCount: number = 0;
	receivedBytes: number = 0;
	elapsed: number = 0;
	errCode: string = '';
	errMsg: string = '';
}

export function createOpBatch(requestVersion: number): UniAiMdOpBatch {
	const batch = new UniAiMdOpBatch();
	batch.requestVersion = requestVersion;
	return batch;
}

export function batchRequestVersion(batch: UniAiMdOpBatch): number {
	return batch.requestVersion;
}

export function batchCount(batch: UniAiMdOpBatch): number {
	return batch.ops.length;
}

export function batchOp(batch: UniAiMdOpBatch, index: number): UniAiMdOpEntry {
	return batch.ops[index];
}
