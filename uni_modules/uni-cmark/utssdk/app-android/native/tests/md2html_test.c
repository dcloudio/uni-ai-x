#include "md2html.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void require_contains(const char *html, const char *expected) {
  if (strstr(html, expected) == NULL) {
    fprintf(stderr, "Expected HTML to contain:\n%s\nActual HTML:\n%s\n",
            expected, html);
    exit(1);
  }
}

static void require_not_contains(const char *html, const char *unexpected) {
  if (strstr(html, unexpected) != NULL) {
    fprintf(stderr, "Expected HTML not to contain:\n%s\nActual HTML:\n%s\n",
            unexpected, html);
    exit(1);
  }
}

static char *render(const char *markdown) {
  size_t html_length = 0;
  char *html = uni_cmark_markdown_to_html(
      (const uint8_t *)markdown, strlen(markdown), &html_length);
  if (html == NULL || html_length != strlen(html)) {
    fprintf(stderr, "Markdown conversion failed\n");
    exit(1);
  }
  return html;
}

int main(void) {
  char *html = render("# Title\n\nText with **bold** and [link](https://example.com).\n");
  require_contains(html, "<h1>Title</h1>");
  require_contains(html, "<strong>bold</strong>");
  require_contains(html, "<a href=\"https://example.com\">link</a>");
  uni_cmark_free_html(html);

  html = render("| Left | Right |\n| :--- | ---: |\n| a | b |\n");
  require_contains(html, "<table>");
  require_contains(html, "style=\"text-align: left\"");
  require_contains(html, "style=\"text-align: right\"");
  uni_cmark_free_html(html);

  html = render("~~gone~~\n\nhttps://example.com\n\n- [x] done\n- [ ] todo\n");
  require_contains(html, "<del>gone</del>");
  require_contains(html, "<a href=\"https://example.com\">https://example.com</a>");
  require_contains(html, "type=\"checkbox\"");
  require_contains(html, "checked=\"\"");
  uni_cmark_free_html(html);

  html = render("<script>alert(1)</script>\n\n[x](javascript:alert(1))\n");
  require_not_contains(html, "<script>");
  require_not_contains(html, "javascript:");
  require_contains(html, "raw HTML omitted");
  uni_cmark_free_html(html);

  html = render("\xe4\xb8\xad\xe6\x96\x87 \xf0\x9f\x98\x80\n");
  require_contains(html, "<p>\xe4\xb8\xad\xe6\x96\x87 \xf0\x9f\x98\x80</p>");
  uni_cmark_free_html(html);

  html = render("");
  if (html[0] != '\0') {
    fprintf(stderr, "Expected empty Markdown to produce empty HTML\n");
    return 1;
  }
  uni_cmark_free_html(html);

  puts("md2html native tests passed");
  return 0;
}
