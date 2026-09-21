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
	requestVersion: number = 0;
	batchSeq: number = 0;
	slots: collections.Array<LibmarkOpSlot> = new collections.Array<LibmarkOpSlot>();

	beginBatch(requestVersion: number, batchSeq: number): void {
		this.count = 0;
		this.requestVersion = requestVersion;
		this.batchSeq = batchSeq;
	}

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

export function queueRequestVersion(queue: LibmarkOpQueue): number {
	return queue.requestVersion;
}

export function queueBatchSeq(queue: LibmarkOpQueue): number {
	return queue.batchSeq;
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
