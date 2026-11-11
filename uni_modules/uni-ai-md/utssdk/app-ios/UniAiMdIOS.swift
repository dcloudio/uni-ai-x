import Foundation
// @_implementationOnly：UniAiMdBridge 只在本文件内部使用，不能让编译产物（unimoduleUniAiMd
// 的 swiftinterface）把它暴露成模块依赖，否则其它 UTS 插件（如 uni-ai-x）编译时
// 会因找不到该模块而失败（自定义基座构建不会把本插件自带的 framework 放进全局搜索路径）。
@_implementationOnly import UniAiMdBridge

public final class UniAiMdIOS {
    private static let lock = NSLock()
    private static var sessions: [Int: OpaquePointer] = [:]
    private static var nextId = 0

    // UTS number 在 iOS 编译为 NSNumber，返回 NSNumber 以匹配插件入口的
    // number 返回类型（句柄 id 用 number 跨 UTS→JS 边界传递）。
    public static func createSession(_ mode: String, _ languageTags: String,
                                     _ darkMode: Bool, _ background: String) -> NSNumber {
        let preferred = languageTags.trimmingCharacters(in: .whitespacesAndNewlines)
        let device = Locale.preferredLanguages.joined(separator: ",")
        let languages = [preferred, device].filter { !$0.isEmpty }.joined(separator: ",")
        let pointer = mode.withCString { modePtr in
            languages.withCString { languagePtr in
                background.withCString { backgroundPtr in
                    uni_ai_md_ios_create(modePtr, languagePtr, darkMode ? 1 : 0, backgroundPtr)
                }
            }
        }
        guard let pointer else { return 0 }
        lock.lock()
        defer { lock.unlock() }
        nextId += 1
        sessions[nextId] = pointer
        return NSNumber(value: nextId)
    }

    public static func feedChunk(_ id: Int, _ chunk: String) -> String? {
        lock.lock()
        defer { lock.unlock() }
        guard let pointer = sessions[id] else { return "{\"error\":\"invalid uni-ai-md session handle\"}" }
        return chunk.withCString { text in
            consume(uni_ai_md_ios_feed(pointer, text, UInt(chunk.utf8.count)))
        }
    }

    public static func finishSession(_ id: Int) -> String? {
        lock.lock()
        defer { lock.unlock() }
        guard let pointer = sessions[id] else { return "{\"error\":\"invalid uni-ai-md session handle\"}" }
        return consume(uni_ai_md_ios_finish(pointer))
    }

    public static func destroySession(_ id: Int) {
        lock.lock()
        defer { lock.unlock() }
        guard let pointer = sessions.removeValue(forKey: id) else { return }
        uni_ai_md_ios_destroy(pointer)
    }

    private static func consume(_ pointer: UnsafeMutablePointer<CChar>?) -> String? {
        guard let pointer else { return nil }
        defer { uni_ai_md_ios_free(pointer) }
        return String(cString: pointer)
    }
}
