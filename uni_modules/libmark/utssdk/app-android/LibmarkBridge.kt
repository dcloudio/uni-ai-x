package uts.sdk.modules.libmark

import java.util.concurrent.ConcurrentHashMap

/**
 * Android 平台 libmark 桥接包装类。
 *
 * JNI 实现在 native/android/libmark_bridge_jni.cpp，事件以 JSON 字符串返回，字段与
 * UTS 的 LibmarkEvent/LibmarkOp 一致；没有事件时返回 null。
 *
 * 会话句柄在 UTS/JS 侧只是一个自增 id：UTS 的 `object` 参数在 Android 桥上是
 * UTSJSONObject，Kotlin 实例穿不过 JS 边界，所以裸指针留在本类里，UTS 只传 id。
 */
object LibmarkBridge {
    /** id -> libmark 会话指针；id 从 1 开始，0 表示无效。 */
    private val sessions = ConcurrentHashMap<Int, Long>()
    private var nextSessionId = 0

    init {
        // System.loadLibrary 会自行补 lib 前缀和 .so 后缀，所以这里传的是去掉前缀的名字：
        // "mark-full" -> libmark-full.so，"mark_bridge" -> libmark_bridge.so。
        // libmark_bridge.so 以 libmark-full.so 为 NEEDED 依赖，先显式加载它，缺失时报错更直观。
        System.loadLibrary("mark-full")
        System.loadLibrary("mark_bridge")
    }

    fun createSession(mode: String?): Int {
        val pointer = nativeCreateSession(mode)
        if (pointer == 0L) {
            throw IllegalStateException("libmark session creation failed")
        }
        nextSessionId += 1
        sessions[nextSessionId] = pointer
        return nextSessionId
    }

    fun feedChunk(id: Int, chunk: String): String? {
        val pointer = sessions[id] ?: throw IllegalStateException("invalid libmark session handle")
        return nativeFeedChunk(pointer, chunk)
    }

    fun finishSession(id: Int): String? {
        val pointer = sessions[id] ?: throw IllegalStateException("invalid libmark session handle")
        return nativeFinishSession(pointer)
    }

    fun destroySession(id: Int) {
        val pointer = sessions.remove(id) ?: return
        nativeDestroySession(pointer)
    }

    private external fun nativeCreateSession(mode: String?): Long

    private external fun nativeFeedChunk(handle: Long, chunk: String): String?

    private external fun nativeFinishSession(handle: Long): String?

    private external fun nativeDestroySession(handle: Long)
}
