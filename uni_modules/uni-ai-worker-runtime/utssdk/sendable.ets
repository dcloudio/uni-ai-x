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
export class LibmarkChunk {
	tag: string = 'libmark-chunk';
	requestVersion: number = 0;
	content: string = '';
	reasoningContent: string = '';
}
