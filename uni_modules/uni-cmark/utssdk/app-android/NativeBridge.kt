package com.dcloud.cmark
class MainActivity {
    companion object {
        private var cmarkHtmlLoadAttempted = false
        private var cmarkHtmlAvailable = false

        @Synchronized
        private fun loadCmarkHtml(): Boolean {
            if (!cmarkHtmlLoadAttempted) {
                cmarkHtmlAvailable = try {
                    System.loadLibrary("cmarkhtml")
                    true
                } catch (_error: UnsatisfiedLinkError) {
                    false
                }
                cmarkHtmlLoadAttempted = true
            }
            return cmarkHtmlAvailable
        }
    }
		private external fun md2htmlUtf8(markdownUtf8: ByteArray): ByteArray

		fun isMd2htmlAvailable(): Boolean {
			return loadCmarkHtml()
		}

		fun md2html(text: String): String {
			if (!loadCmarkHtml()) {
				throw IllegalStateException("libcmarkhtml.so is not installed in the current custom base")
			}
			return md2htmlUtf8(text.toByteArray(Charsets.UTF_8)).toString(Charsets.UTF_8)
		}
}
