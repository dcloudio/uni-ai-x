package com.dcloud.ConvertedToken

data class ktToken(val start: Int, val end: Int, val token: String)
data class ConvertedToken(val start: Int, val end: Int, val token: String)

fun mapByteOffsetsToCharOffsets(text: String, tokens: Array<ktToken>): Array<ktToken> {

    val byteToChar = mutableMapOf<Int, Int>()
    var byteIndex = 0
    var charIndex = 0

    while (charIndex < text.length) {
        val codePoint = text.codePointAt(charIndex)
        val byteLength = codePointToUtf8Bytes(codePoint)
        val charLength = if (codePoint > 0xFFFF) 2 else 1

        for (offset in 0 until byteLength) {
            byteToChar[byteIndex + offset] = charIndex
        }

        byteIndex += byteLength
        charIndex += charLength
        byteToChar[byteIndex] = charIndex
    }

    return tokens.map {
        val startChar = byteToChar[it.start] ?: 0
        val endChar = byteToChar[it.end] ?: charIndex
        ktToken(startChar, endChar, it.token)
    }.toTypedArray()
}

// 计算一个 code point 编码成 UTF-8 所需的字节数
fun codePointToUtf8Bytes(cp: Int): Int {
    return when {
        cp <= 0x7F -> 1
        cp <= 0x7FF -> 2
        cp <= 0xFFFF -> 3
        else -> 4
    }
}
