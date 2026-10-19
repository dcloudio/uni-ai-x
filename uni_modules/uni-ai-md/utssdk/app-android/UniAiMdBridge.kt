package uts.sdk.modules.uniAiMd

import android.os.LocaleList
import java.util.concurrent.ConcurrentHashMap

/**
 * Android 平台 uni-ai-md 桥接包装类。
 *
 * JNI 实现在 native/android/uni_ai_md_bridge_jni.cpp，事件以 JSON 字符串返回，字段与
 * UTS 的 UniAiMdEvent/UniAiMdOp 一致；没有事件时返回 null。
 *
 * 会话句柄在 UTS/JS 侧只是一个自增 id：UTS 的 `object` 参数在 Android 桥上是
 * UTSJSONObject，Kotlin 实例穿不过 JS 边界，所以裸指针留在本类里，UTS 只传 id。
 */
object UniAiMdBridge {
    /** id -> uni-ai-md 会话指针；id 从 1 开始，0 表示无效。 */
    private val sessions = ConcurrentHashMap<Int, Long>()
    private var nextSessionId = 0

    init {
        // System.loadLibrary 会自行补 lib 前缀和 .so 后缀，所以这里传的是去掉前缀的名字：
        // "uni-ai-md" -> libuni-ai-md.so，"uni-ai-md_bridge" -> libuni-ai-md_bridge.so。
        // libuni-ai-md_bridge.so 以 libuni-ai-md.so 为 NEEDED 依赖，先显式加载它，缺失时报错更直观。
        System.loadLibrary("uni-ai-md")
        System.loadLibrary("uni-ai-md_bridge")
    }

    /**
     * languageTags 是宿主给出的内容语言偏好（BCP-47，可为逗号分隔的优先级列表），
     * 设备当前语言作为兜底追加在其后：内容语言优先是刻意的选择，见 bridge 侧注释。
     * darkMode 决定插件默认前景色，background 是宿主显式给出的画布底色（#rrggbb）。
     */
    fun createSession(mode: String?, languageTags: String?, darkMode: Boolean?, background: String?): Int {
        val pointer = nativeCreateSession(mode, composeLocales(languageTags), darkMode == true, background)
        if (pointer == 0L) {
            throw IllegalStateException("uni-ai-md session creation failed")
        }
        nextSessionId += 1
        sessions[nextSessionId] = pointer
        return nextSessionId
    }

    /** 内容语言在前、设备语言在后，交给桥接库按顺序解析字体。 */
    private fun composeLocales(languageTags: String?): String {
        val preferred = languageTags?.trim().orEmpty()
        val deviceLocales = LocaleList.getDefault().toLanguageTags()
        if (preferred.isEmpty()) return deviceLocales
        if (deviceLocales.isEmpty()) return preferred
        return "$preferred,$deviceLocales"
    }

    fun feedChunk(id: Int, chunk: String): String? {
        val pointer = sessions[id] ?: throw IllegalStateException("invalid uni-ai-md session handle")
        return nativeFeedChunk(pointer, chunk)
    }

    fun finishSession(id: Int): String? {
        val pointer = sessions[id] ?: throw IllegalStateException("invalid uni-ai-md session handle")
        return nativeFinishSession(pointer)
    }

    fun destroySession(id: Int) {
        val pointer = sessions.remove(id) ?: return
        nativeDestroySession(pointer)
    }

    private external fun nativeCreateSession(mode: String?, locales: String?, darkMode: Boolean,
                                             background: String?): Long

    private external fun nativeFeedChunk(handle: Long, chunk: String): String?

    private external fun nativeFinishSession(handle: Long): String?

    private external fun nativeDestroySession(handle: Long)
}
