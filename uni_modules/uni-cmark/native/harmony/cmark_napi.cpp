#include <napi/native_api.h>

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

#include "md2html.h"

static napi_value Md2html(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc != 1) {
    napi_throw_type_error(env, nullptr, "md2html expects one Markdown string");
    return nullptr;
  }

  size_t markdown_length = 0;
  if (napi_get_value_string_utf8(env, args[0], nullptr, 0,
                                 &markdown_length) != napi_ok) {
    napi_throw_type_error(env, nullptr, "Markdown input must be a string");
    return nullptr;
  }
  std::vector<char> markdown(markdown_length + 1);
  napi_get_value_string_utf8(env, args[0], markdown.data(), markdown.size(),
                             &markdown_length);

  size_t html_length = 0;
  char *html = uni_cmark_markdown_to_html(
      reinterpret_cast<const uint8_t *>(markdown.data()), markdown_length,
      &html_length);
  if (html == nullptr) {
    napi_throw_error(env, nullptr, "cmark-gfm failed to convert Markdown to HTML");
    return nullptr;
  }

  napi_value result;
  napi_status status = napi_create_string_utf8(env, html, html_length, &result);
  uni_cmark_free_html(html);
  if (status != napi_ok) {
    napi_throw_error(env, nullptr, "Failed to create the Markdown HTML string");
    return nullptr;
  }
  return result;
}

EXTERN_C_START
static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor descriptors[] = {
      {"md2html", nullptr, Md2html, nullptr, nullptr, nullptr, napi_default,
       nullptr},
  };
  napi_define_properties(env, exports,
                         sizeof(descriptors) / sizeof(descriptors[0]),
                         descriptors);
  return exports;
}
EXTERN_C_END

static napi_module cmark_module = {
    .nm_version = 1,
    .nm_flags = 0,
    .nm_filename = nullptr,
    .nm_register_func = Init,
    .nm_modname = "cmark",
    .nm_priv = nullptr,
    .reserved = {0},
};

extern "C" __attribute__((constructor)) void RegisterCmarkModule(void) {
  napi_module_register(&cmark_module);
}
