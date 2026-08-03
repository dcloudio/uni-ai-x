#ifndef UNI_CMARK_MD2HTML_H
#define UNI_CMARK_MD2HTML_H

#include <stddef.h>
#include <stdint.h>

#if defined(__GNUC__)
#define UNI_CMARK_INTERNAL __attribute__((visibility("hidden")))
#else
#define UNI_CMARK_INTERNAL
#endif

UNI_CMARK_INTERNAL char *uni_cmark_markdown_to_html(
    const uint8_t *markdown, size_t markdown_length, size_t *html_length);
UNI_CMARK_INTERNAL void uni_cmark_free_html(char *html);

#endif
