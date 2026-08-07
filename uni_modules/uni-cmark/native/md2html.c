#include "md2html.h"

#include <pthread.h>
#include <stdlib.h>
#include <string.h>

#include "cmark-gfm-core-extensions.h"
#include "cmark-gfm-extension_api.h"
#include "cmark-gfm.h"

#if defined(__ANDROID__) && !defined(UNI_CMARK_NO_JNI)
#include <jni.h>
#endif

static pthread_once_t extensions_once = PTHREAD_ONCE_INIT;

static void register_extensions(void) {
  cmark_gfm_core_extensions_ensure_registered();
}

static int attach_extensions(cmark_parser *parser) {
  static const char *extension_names[] = {
      "table", "strikethrough", "autolink", "tasklist", NULL};

  for (const char **name = extension_names; *name != NULL; ++name) {
    cmark_syntax_extension *extension = cmark_find_syntax_extension(*name);
    if (extension == NULL ||
        !cmark_parser_attach_syntax_extension(parser, extension)) {
      return 0;
    }
  }
  return 1;
}

char *uni_cmark_markdown_to_html(const uint8_t *markdown,
                                 size_t markdown_length,
                                 size_t *html_length) {
  if (html_length != NULL) {
    *html_length = 0;
  }
  if (markdown == NULL && markdown_length != 0) {
    return NULL;
  }

  pthread_once(&extensions_once, register_extensions);

  const int options = CMARK_OPT_VALIDATE_UTF8 |
                      CMARK_OPT_TABLE_PREFER_STYLE_ATTRIBUTES |
                      CMARK_OPT_STRIKETHROUGH_DOUBLE_TILDE;
  cmark_parser *parser = cmark_parser_new(options);
  if (parser == NULL) {
    return NULL;
  }
  if (!attach_extensions(parser)) {
    cmark_parser_free(parser);
    return NULL;
  }

  if (markdown_length > 0) {
    cmark_parser_feed(parser, (const char *)markdown, markdown_length);
  }
  cmark_node *document = cmark_parser_finish(parser);
  if (document == NULL) {
    cmark_parser_free(parser);
    return NULL;
  }

  char *html = cmark_render_html(
      document, options, cmark_parser_get_syntax_extensions(parser));
  cmark_node_free(document);
  cmark_parser_free(parser);
  if (html != NULL && html_length != NULL) {
    *html_length = strlen(html);
  }
  return html;
}

void uni_cmark_free_html(char *html) {
  if (html != NULL) {
    cmark_get_default_mem_allocator()->free(html);
  }
}

#if defined(__ANDROID__) && !defined(UNI_CMARK_NO_JNI)
static void throw_conversion_error(JNIEnv *env, const char *message) {
  jclass exception_class = (*env)->FindClass(env, "java/lang/IllegalStateException");
  if (exception_class != NULL) {
    (*env)->ThrowNew(env, exception_class, message);
  }
}

JNIEXPORT jbyteArray JNICALL
Java_com_dcloud_cmark_MainActivity_md2htmlUtf8(JNIEnv *env, jobject instance,
                                               jbyteArray markdown_utf8) {
  (void)instance;
  if (markdown_utf8 == NULL) {
    throw_conversion_error(env, "Markdown input must not be null");
    return NULL;
  }

  const jsize markdown_length = (*env)->GetArrayLength(env, markdown_utf8);
  jbyte *markdown = (*env)->GetByteArrayElements(env, markdown_utf8, NULL);
  if (markdown == NULL) {
    return NULL;
  }

  size_t html_length = 0;
  char *html = uni_cmark_markdown_to_html(
      (const uint8_t *)markdown, (size_t)markdown_length, &html_length);
  (*env)->ReleaseByteArrayElements(env, markdown_utf8, markdown, JNI_ABORT);
  if (html == NULL) {
    throw_conversion_error(env, "Failed to convert Markdown to HTML");
    return NULL;
  }
  if (html_length > (size_t)INT32_MAX) {
    uni_cmark_free_html(html);
    throw_conversion_error(env, "Generated HTML is too large");
    return NULL;
  }

  jbyteArray result = (*env)->NewByteArray(env, (jsize)html_length);
  if (result != NULL && html_length > 0) {
    (*env)->SetByteArrayRegion(env, result, 0, (jsize)html_length,
                              (const jbyte *)html);
  }
  uni_cmark_free_html(html);
  return result;
}
#endif
