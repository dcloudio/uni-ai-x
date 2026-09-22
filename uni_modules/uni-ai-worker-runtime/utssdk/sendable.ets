import { collections } from '@kit.ArkTS';

@Sendable
export class LibmarkOpEntry {
	tag: string = 'libmark-op';
	requestVersion: number = 0;
	op: number = 0;
	kind: string = '';
	content: string = '';
	index: number = 0;
	unchanged: boolean = false;
}

@Sendable
export class LibmarkOpBatch {
	tag: string = 'libmark-op-batch';
	requestVersion: number = 0;
	ops: collections.Array<LibmarkOpEntry> = new collections.Array<LibmarkOpEntry>();

	pushOp(op: number, kind: string, content: string, index: number, unchanged: boolean): void {
		const entry = new LibmarkOpEntry();
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
export class LibmarkChunk {
	tag: string = 'libmark-chunk';
	requestVersion: number = 0;
	content: string = '';
	reasoningContent: string = '';
}

export function createOpBatch(requestVersion: number): LibmarkOpBatch {
	const batch = new LibmarkOpBatch();
	batch.requestVersion = requestVersion;
	return batch;
}

export function batchRequestVersion(batch: LibmarkOpBatch): number {
	return batch.requestVersion;
}

export function batchCount(batch: LibmarkOpBatch): number {
	return batch.ops.length;
}

export function batchOp(batch: LibmarkOpBatch, index: number): LibmarkOpEntry {
	return batch.ops[index];
}
