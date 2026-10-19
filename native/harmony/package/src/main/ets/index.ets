/**
 * 1=追加块 2=更新未闭合块 3=提交未闭合块 4=清空块列表。
 * kind 为 html/data/ast；index 是该事件对应的顶层块序号，三种通道按同一序号对齐。
 * unchanged 为 true 表示这次 tail 提交的内容没有变化（content 是原内容，不是新载荷）。
 */
export interface UniAiMdOp {
  op: number;
  kind: string;
  content: string;
  index: number;
  unchanged: boolean;
}

export interface UniAiMdNativeEvent {
  ops: UniAiMdOp[];
}

/**
 * mode 为 "ast" 时只交付 AST（无 HTML、无 DATA），省略或 "html" 时交付 HTML 与 DATA。
 * languageTags 为逗号分隔的 BCP-47 语言优先级列表（内容语言在前），用于挑文本字体与
 * 集合字体的 face。
 */
export const createSession: (mode?: string, languageTags?: string) => object;
export const feedChunk: (handle: object, chunk: string) => UniAiMdNativeEvent | undefined;
export const finishSession: (handle: object) => UniAiMdNativeEvent | undefined;
export const destroySession: (handle: object) => void;

declare const bridge: {
  createSession: typeof createSession;
  feedChunk: typeof feedChunk;
  finishSession: typeof finishSession;
  destroySession: typeof destroySession;
};
export default bridge;
