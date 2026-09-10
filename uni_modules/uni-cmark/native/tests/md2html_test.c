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

static char *render_json(const char *markdown) {
  size_t json_length = 0;
  char *json = uni_cmark_markdown_to_json(
      (const uint8_t *)markdown, strlen(markdown), &json_length);
  if (json == NULL || json_length != strlen(json)) {
    fprintf(stderr, "Markdown JSON conversion failed\n");
    exit(1);
  }
  return json;
}

static void test_json(void) {
  char *json = render_json(
      "# Title\n\nText with **bold**, *em* and [link](https://example.com).\n");
  require_contains(json, "\"type\":\"document\"");
  require_contains(json, "\"type\":\"heading\",\"level\":1");
  require_contains(json, "\"type\":\"strong\"");
  require_contains(json, "\"type\":\"emph\"");
  require_contains(json, "\"type\":\"link\",\"url\":\"https://example.com\"");
  uni_cmark_free_json(json);

  json = render_json("| Left | Right |\n| :--- | ---: |\n| a | b |\n");
  require_contains(json, "\"type\":\"table\"");
  require_contains(json, "\"alignments\":[\"left\",\"right\"]");
  require_contains(json, "\"type\":\"table_row\",\"header\":true");
  require_contains(json, "\"type\":\"table_cell\"");
  uni_cmark_free_json(json);

  json = render_json("~~gone~~\n\n- [x] done\n- [ ] todo\n\n3. third\n4. fourth\n");
  require_contains(json, "\"type\":\"strikethrough\"");
  require_contains(json, "\"type\":\"tasklist\",\"tasklist\":true,\"checked\":true");
  require_contains(json, "\"type\":\"tasklist\",\"tasklist\":true,\"checked\":false");
  require_contains(json, "\"listType\":\"ordered\",\"start\":3");
  uni_cmark_free_json(json);

  json = render_json("```js\nconst a = 1;\n```\n");
  require_contains(json, "\"type\":\"code_block\",\"info\":\"js\"");
  require_contains(json, "\"literal\":\"const a = 1;\\n\"");
  uni_cmark_free_json(json);

  json = render_json("a \"quote\" and \\ backslash\n");
  require_contains(json, "\\\"quote\\\"");
  require_contains(json, "\\\\ backslash");
  uni_cmark_free_json(json);

  json = render_json("<script>alert(1)</script>\n");
  require_contains(json, "<!-- raw HTML omitted -->");
  require_not_contains(json, "<script>");
  uni_cmark_free_json(json);

  puts("md2json native tests passed");
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

  test_json();

  puts("md2html native tests passed");
  return 0;
}
