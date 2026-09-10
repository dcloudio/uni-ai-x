#include "md2html.h"

#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cmark-gfm-core-extensions.h"
#include "cmark-gfm-extension_api.h"
#include "cmark-gfm.h"

#if defined(__ANDROID__) && !defined(UNI_CMARK_NO_JNI)
#include <jni.h>
#endif

static const int UNI_CMARK_OPTIONS = CMARK_OPT_VALIDATE_UTF8 |
                                     CMARK_OPT_TABLE_PREFER_STYLE_ATTRIBUTES |
                                     CMARK_OPT_STRIKETHROUGH_DOUBLE_TILDE;

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

// Parses Markdown into a cmark AST. The caller owns *out_parser (when not NULL)
// and the returned document, and must free both.
static cmark_node *parse_document(const uint8_t *markdown,
                                  size_t markdown_length,
                                  cmark_parser **out_parser) {
  if (out_parser != NULL) {
    *out_parser = NULL;
  }
  if (markdown == NULL && markdown_length != 0) {
    return NULL;
  }

  pthread_once(&extensions_once, register_extensions);

  cmark_parser *parser = cmark_parser_new(UNI_CMARK_OPTIONS);
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

  if (out_parser != NULL) {
    *out_parser = parser;
  }
  return document;
}

char *uni_cmark_markdown_to_html(const uint8_t *markdown,
                                 size_t markdown_length,
                                 size_t *html_length) {
  if (html_length != NULL) {
    *html_length = 0;
  }

  cmark_parser *parser = NULL;
  cmark_node *document = parse_document(markdown, markdown_length, &parser);
  if (document == NULL) {
    return NULL;
  }

  char *html = cmark_render_html(
      document, UNI_CMARK_OPTIONS, cmark_parser_get_syntax_extensions(parser));
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

typedef struct {
  char *data;
  size_t length;
  size_t capacity;
  cmark_mem *mem;
} json_buffer;

static void json_buffer_init(json_buffer *buffer, cmark_mem *mem) {
  buffer->data = NULL;
  buffer->length = 0;
  buffer->capacity = 0;
  buffer->mem = mem;
}

static int json_buffer_reserve(json_buffer *buffer, size_t extra) {
  if (buffer->length + extra + 1 <= buffer->capacity) {
    return 1;
  }
  size_t capacity = buffer->capacity == 0 ? 256 : buffer->capacity;
  while (capacity < buffer->length + extra + 1) {
    capacity *= 2;
  }
  char *data = (char *)buffer->mem->realloc(buffer->data, capacity);
  if (data == NULL) {
    return 0;
  }
  buffer->data = data;
  buffer->capacity = capacity;
  return 1;
}

static void json_buffer_append(json_buffer *buffer, const char *text,
                               size_t length) {
  if (length == 0) {
    return;
  }
  if (!json_buffer_reserve(buffer, length)) {
    return;
  }
  memcpy(buffer->data + buffer->length, text, length);
  buffer->length += length;
  buffer->data[buffer->length] = '\0';
}

static void json_buffer_put(json_buffer *buffer, const char *text) {
  json_buffer_append(buffer, text, strlen(text));
}

static void json_buffer_put_bool(json_buffer *buffer, int value) {
  json_buffer_put(buffer, value ? "true" : "false");
}

static void json_buffer_put_int(json_buffer *buffer, int value) {
  char text[16];
  snprintf(text, sizeof(text), "%d", value);
  json_buffer_put(buffer, text);
}

static void json_buffer_put_string(json_buffer *buffer, const char *text) {
  json_buffer_put(buffer, "\"");
  if (text != NULL) {
    const char *run = text;
    const char *cursor = text;
    for (;; ++cursor) {
      unsigned char c = (unsigned char)*cursor;
      if (c != '\0' && c != '"' && c != '\\' && c >= 0x20) {
        continue;
      }
      if (cursor > run) {
        json_buffer_append(buffer, run, (size_t)(cursor - run));
      }
      if (c == '\0') {
        break;
      }
      switch (c) {
      case '"':
        json_buffer_put(buffer, "\\\"");
        break;
      case '\\':
        json_buffer_put(buffer, "\\\\");
        break;
      case '\b':
        json_buffer_put(buffer, "\\b");
        break;
      case '\f':
        json_buffer_put(buffer, "\\f");
        break;
      case '\n':
        json_buffer_put(buffer, "\\n");
        break;
      case '\r':
        json_buffer_put(buffer, "\\r");
        break;
      case '\t':
        json_buffer_put(buffer, "\\t");
        break;
      default: {
        char escape[7];
        snprintf(escape, sizeof(escape), "\\u%04x", c);
        json_buffer_put(buffer, escape);
        break;
      }
      }
      run = cursor + 1;
    }
  }
  json_buffer_put(buffer, "\"");
}

static const char *table_alignment_name(uint8_t alignment) {
  switch (alignment) {
  case 'l':
    return "left";
  case 'c':
    return "center";
  case 'r':
    return "right";
  default:
    return "none";
  }
}

static void json_append_node(json_buffer *buffer, cmark_node *node,
                             int options);

static void json_append_children(json_buffer *buffer, cmark_node *node,
                                 int options) {
  cmark_node *child = cmark_node_first_child(node);
  if (child == NULL) {
    return;
  }
  json_buffer_put(buffer, ",\"children\":[");
  int first = 1;
  for (; child != NULL; child = cmark_node_next(child)) {
    if (!first) {
      json_buffer_put(buffer, ",");
    }
    first = 0;
    json_append_node(buffer, child, options);
  }
  json_buffer_put(buffer, "]");
}

static void json_append_node(json_buffer *buffer, cmark_node *node,
                             int options) {
  const char *type = cmark_node_get_type_string(node);
  if (type == NULL) {
    type = "unknown";
  }
  // cmark-gfm reports header rows as "table_header"; normalize so consumers
  // only see "table_row" plus a boolean header flag.
  const char *json_type =
      strcmp(type, "table_header") == 0 ? "table_row" : type;

  json_buffer_put(buffer, "{\"type\":");
  json_buffer_put_string(buffer, json_type);

  if (strcmp(type, "heading") == 0) {
    json_buffer_put(buffer, ",\"level\":");
    json_buffer_put_int(buffer, cmark_node_get_heading_level(node));
  } else if (strcmp(type, "list") == 0) {
    cmark_list_type list_type = cmark_node_get_list_type(node);
    int ordered = list_type == CMARK_ORDERED_LIST;
    json_buffer_put(buffer, ",\"listType\":");
    json_buffer_put_string(buffer, ordered ? "ordered" : "bullet");
    if (ordered) {
      json_buffer_put(buffer, ",\"start\":");
      json_buffer_put_int(buffer, cmark_node_get_list_start(node));
      json_buffer_put(buffer, ",\"delim\":");
      json_buffer_put_string(
          buffer,
          cmark_node_get_list_delim(node) == CMARK_PAREN_DELIM ? "paren"
                                                               : "period");
    }
    json_buffer_put(buffer, ",\"tight\":");
    json_buffer_put_bool(buffer, cmark_node_get_list_tight(node) != 0);
  } else if (strcmp(type, "link") == 0 || strcmp(type, "image") == 0) {
    const char *url = cmark_node_get_url(node);
    const char *title = cmark_node_get_title(node);
    json_buffer_put(buffer, ",\"url\":");
    json_buffer_put_string(buffer, url != NULL ? url : "");
    if (title != NULL && title[0] != '\0') {
      json_buffer_put(buffer, ",\"title\":");
      json_buffer_put_string(buffer, title);
    }
  } else if (strcmp(type, "code_block") == 0) {
    const char *info = cmark_node_get_fence_info(node);
    if (info != NULL && info[0] != '\0') {
      json_buffer_put(buffer, ",\"info\":");
      json_buffer_put_string(buffer, info);
    }
  } else if (strcmp(type, "item") == 0 || strcmp(type, "tasklist") == 0) {
    if (strcmp(type, "tasklist") == 0) {
      json_buffer_put(buffer, ",\"tasklist\":true,\"checked\":");
      json_buffer_put_bool(
          buffer, cmark_gfm_extensions_get_tasklist_item_checked(node) ? 1 : 0);
    }
  } else if (strcmp(type, "table") == 0) {
    uint16_t columns = cmark_gfm_extensions_get_table_columns(node);
    uint8_t *alignments = cmark_gfm_extensions_get_table_alignments(node);
    json_buffer_put(buffer, ",\"columns\":");
    json_buffer_put_int(buffer, (int)columns);
    json_buffer_put(buffer, ",\"alignments\":[");
    for (uint16_t index = 0; index < columns; ++index) {
      if (index > 0) {
        json_buffer_put(buffer, ",");
      }
      json_buffer_put_string(
          buffer, table_alignment_name(alignments != NULL ? alignments[index]
                                                          : 0));
    }
    json_buffer_put(buffer, "]");
  } else if (strcmp(type, "table_row") == 0 ||
             strcmp(type, "table_header") == 0) {
    json_buffer_put(buffer, ",\"header\":");
    json_buffer_put_bool(
        buffer, cmark_gfm_extensions_get_table_row_is_header(node) != 0);
  }

  const char *literal = cmark_node_get_literal(node);
  if (literal != NULL) {
    json_buffer_put(buffer, ",\"literal\":");
    if ((strcmp(type, "html_block") == 0 || strcmp(type, "html_inline") == 0) &&
        (options & CMARK_OPT_UNSAFE) == 0) {
      json_buffer_put_string(buffer, "<!-- raw HTML omitted -->");
    } else {
      json_buffer_put_string(buffer, literal);
    }
  }

  json_append_children(buffer, node, options);

  json_buffer_put(buffer, "}");
}

char *uni_cmark_markdown_to_json(const uint8_t *markdown,
                                 size_t markdown_length,
                                 size_t *json_length) {
  if (json_length != NULL) {
    *json_length = 0;
  }

  cmark_parser *parser = NULL;
  cmark_node *document = parse_document(markdown, markdown_length, &parser);
  if (document == NULL) {
    return NULL;
  }

  json_buffer buffer;
  json_buffer_init(&buffer, cmark_get_default_mem_allocator());
  json_append_node(&buffer, document, UNI_CMARK_OPTIONS);

  cmark_node_free(document);
  cmark_parser_free(parser);

  if (buffer.data == NULL) {
    return NULL;
  }
  if (json_length != NULL) {
    *json_length = buffer.length;
  }
  return buffer.data;
}

void uni_cmark_free_json(char *json) {
  if (json != NULL) {
    cmark_get_default_mem_allocator()->free(json);
  }
}

#if defined(__ANDROID__) && !defined(UNI_CMARK_NO_JNI)
static void throw_conversion_error(JNIEnv *env, const char *message) {
  jclass exception_class = (*env)->FindClass(env, "java/lang/IllegalStateException");
  if (exception_class != NULL) {
    (*env)->ThrowNew(env, exception_class, message);
  }
}

static jbyteArray markdown_bytes_to_result(JNIEnv *env, jbyteArray markdown_utf8,
                                           int to_html) {
  if (markdown_utf8 == NULL) {
    throw_conversion_error(env, "Markdown input must not be null");
    return NULL;
  }

  const jsize markdown_length = (*env)->GetArrayLength(env, markdown_utf8);
  jbyte *markdown = (*env)->GetByteArrayElements(env, markdown_utf8, NULL);
  if (markdown == NULL) {
    return NULL;
  }

  size_t result_length = 0;
  char *result = to_html
                     ? uni_cmark_markdown_to_html(
                           (const uint8_t *)markdown, (size_t)markdown_length,
                           &result_length)
                     : uni_cmark_markdown_to_json(
                           (const uint8_t *)markdown, (size_t)markdown_length,
                           &result_length);
  (*env)->ReleaseByteArrayElements(env, markdown_utf8, markdown, JNI_ABORT);
  if (result == NULL) {
    throw_conversion_error(env, to_html ? "Failed to convert Markdown to HTML"
                                        : "Failed to convert Markdown to JSON");
    return NULL;
  }
  if (result_length > (size_t)INT32_MAX) {
    if (to_html) {
      uni_cmark_free_html(result);
    } else {
      uni_cmark_free_json(result);
    }
    throw_conversion_error(env, "Generated output is too large");
    return NULL;
  }

  jbyteArray output = (*env)->NewByteArray(env, (jsize)result_length);
  if (output != NULL && result_length > 0) {
    (*env)->SetByteArrayRegion(env, output, 0, (jsize)result_length,
                              (const jbyte *)result);
  }
  if (to_html) {
    uni_cmark_free_html(result);
  } else {
    uni_cmark_free_json(result);
  }
  return output;
}

JNIEXPORT jbyteArray JNICALL
Java_com_dcloud_cmark_MainActivity_md2htmlUtf8(JNIEnv *env, jobject instance,
                                               jbyteArray markdown_utf8) {
  (void)instance;
  return markdown_bytes_to_result(env, markdown_utf8, 1);
}

JNIEXPORT jbyteArray JNICALL
Java_com_dcloud_cmark_MainActivity_md2jsonUtf8(JNIEnv *env, jobject instance,
                                               jbyteArray markdown_utf8) {
  (void)instance;
  return markdown_bytes_to_result(env, markdown_utf8, 0);
}
#endif
