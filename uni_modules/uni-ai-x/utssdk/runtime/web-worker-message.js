// Web Worker 使用结构化克隆；UTSJSONObject 在部分 Web 运行时是不可克隆的 Proxy。
// 此边界仅用于 AI Worker 的 JSON 协议，不能用于 Sendable 或 transferable 数据。
// 保留为 JS，避免 UTS 编译器再次将 JSON.parse 的结果包装为 UTSJSONObject。
export function toWebWorkerMessage(message) {
  return JSON.parse(JSON.stringify(message))
}
