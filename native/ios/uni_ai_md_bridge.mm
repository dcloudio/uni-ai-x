#include "UniAiMdBridge.h"

#include "uni-ai-md/core.h"
#include "uni-ai-md/plugin.h"
#include "uni-ai-md/render.h"
#include "uni-ai-md/session.h"
#include "math_plugin.h"
#include "mermaid_plugin.h"

#import <CommonCrypto/CommonDigest.h>
#import <CoreText/CoreText.h>
#import <Foundation/Foundation.h>

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <string>
#include <utility>
#include <vector>

struct BridgeOp {
  uint32_t op = 0;
  uint32_t kind = 0;
  size_t index = 0;
  bool unchanged = false;
  std::string text;
};

struct uni_ai_md_ios_session {
  uni_ai_md_runtime *runtime = nullptr;
  uni_ai_md_session *session = nullptr;
  CTFontRef font = nullptr;
  std::string tail;
  uint32_t tail_kind = 0;
  bool has_tail = false;
  std::vector<BridgeOp> ops;
};

namespace {

int OnEvent(const uni_ai_md_event *event, void *user_data) {
  auto *state = static_cast<uni_ai_md_ios_session *>(user_data);
  if (!state || !event) return 1;
  if (event->type == UNI_AI_MD_EVENT_RESET) {
    state->tail.clear();
    state->has_tail = false;
    state->ops.clear();
    state->ops.push_back({4});
    return 0;
  }
  if (event->type != UNI_AI_MD_EVENT_BLOCK &&
      event->type != UNI_AI_MD_EVENT_TAIL_BLOCK_PARTIAL &&
      event->type != UNI_AI_MD_EVENT_TAIL_BLOCK_COMPLETE) return 0;

  std::string payload;
  for (size_t i = 0; i < event->span_count; ++i) {
    if (event->spans[i].data && event->spans[i].size)
      payload.append(reinterpret_cast<const char *>(event->spans[i].data), event->spans[i].size);
  }
  const uint32_t kind = event->content_type == UNI_AI_MD_CONTENT_DATA
                            ? 1 : (event->content_type == UNI_AI_MD_CONTENT_AST ? 2 : 0);
  if (event->type == UNI_AI_MD_EVENT_BLOCK) {
    if (payload.empty()) return 0;
    state->ops.push_back({1, kind, event->top_level_block_index, false, std::move(payload)});
    state->tail.clear();
    state->has_tail = false;
    return 0;
  }

  const bool unchanged = payload.empty() && event->retain_tail_bytes != 0;
  if (state->has_tail && state->tail_kind == kind) {
    const size_t keep = event->retain_tail_bytes < state->tail.size()
                            ? event->retain_tail_bytes : state->tail.size();
    state->tail.resize(keep);
    state->tail.append(payload);
  } else {
    if (event->retain_tail_bytes != 0) return 1;
    state->tail = std::move(payload);
  }
  state->tail_kind = kind;
  state->has_tail = true;
  state->ops.push_back({event->type == UNI_AI_MD_EVENT_TAIL_BLOCK_COMPLETE ? 3u : 2u,
                        kind, event->top_level_block_index, unchanged, state->tail});
  if (event->type == UNI_AI_MD_EVENT_TAIL_BLOCK_COMPLETE) {
    state->tail.clear();
    state->has_tail = false;
  }
  return 0;
}

void AppendJsonString(std::string &out, const std::string &value) {
  static const char hex[] = "0123456789abcdef";
  out.push_back('"');
  for (unsigned char c : value) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\b': out += "\\b"; break;
      case '\f': out += "\\f"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) {
          out += "\\u00";
          out.push_back(hex[c >> 4]);
          out.push_back(hex[c & 15]);
        } else {
          out.push_back(static_cast<char>(c));
        }
    }
  }
  out.push_back('"');
}

char *CopyResult(const std::string &text) {
  auto *result = static_cast<char *>(std::malloc(text.size() + 1));
  if (!result) return nullptr;
  std::memcpy(result, text.data(), text.size());
  result[text.size()] = '\0';
  return result;
}

char *CollectResult(uni_ai_md_ios_session *state, uni_ai_md_status status) {
  if (status != UNI_AI_MD_STATUS_OK) return CopyResult("{\"error\":\"uni-ai-md session step failed\"}");
  if (state->ops.empty()) return nullptr;
  std::string out = "{\"ops\":[";
  for (size_t i = 0; i < state->ops.size(); ++i) {
    const BridgeOp &op = state->ops[i];
    if (i) out.push_back(',');
    out += "{\"op\":" + std::to_string(op.op) + ",\"kind\":\"";
    out += op.kind == 1 ? "data" : (op.kind == 2 ? "ast" : "html");
    out += "\",\"content\":";
    AppendJsonString(out, op.text);
    out += ",\"index\":" + std::to_string(op.index);
    out += op.unchanged ? ",\"unchanged\":true}" : ",\"unchanged\":false}";
  }
  out += "]}";
  return CopyResult(out);
}

CTFontRef CreateSystemFont(const std::string &language_tags) {
  CTFontRef base = CTFontCreateWithName(CFSTR(".AppleSystemUIFont"), 14, nullptr);
  if (!base) return nullptr;
  CFStringRef sample = language_tags.find("zh-Hant") != std::string::npos
                           ? CFSTR("漢字") : CFSTR("汉字");
  CTFontRef selected = CTFontCreateForString(
      base, sample, CFRangeMake(0, CFStringGetLength(sample)));
  CFRelease(base);
  if (!selected) return nullptr;
  CTFontRef font = CTFontCreateCopyWithAttributes(
      selected, CTFontGetUnitsPerEm(selected), nullptr, nullptr);
  CFRelease(selected);
  return font;
}

void FillGlyphMetrics(CTFontRef font, CGGlyph glyph, uni_ai_md_glyph_result_v1 *result) {
  result->glyph_id = glyph;
  result->units_per_em = CTFontGetUnitsPerEm(font);
  if (glyph == 0) {
    result->advance_x = 0;
    result->x_min = result->y_min = result->x_max = result->y_max = 0;
    return;
  }
  CGSize advance{};
  CGRect bounds{};
  CTFontGetAdvancesForGlyphs(font, kCTFontOrientationHorizontal, &glyph, &advance, 1);
  CTFontGetBoundingRectsForGlyphs(font, kCTFontOrientationHorizontal, &glyph, &bounds, 1);
  result->advance_x = static_cast<uni_ai_md_fixed26_6>(std::llround(advance.width * 64));
  result->x_min = static_cast<uni_ai_md_fixed26_6>(std::llround(CGRectGetMinX(bounds) * 64));
  result->x_max = static_cast<uni_ai_md_fixed26_6>(std::llround(CGRectGetMaxX(bounds) * 64));
  result->y_min = static_cast<uni_ai_md_fixed26_6>(std::llround(-CGRectGetMaxY(bounds) * 64));
  result->y_max = static_cast<uni_ai_md_fixed26_6>(std::llround(-CGRectGetMinY(bounds) * 64));
}

uni_ai_md_status CoreTextRequestGlyphs(void *context,
    const uni_ai_md_glyph_request_v1 *requests, size_t request_count,
    size_t request_stride, uni_ai_md_glyph_result_v1 *results, size_t result_stride) {
  if (!context || !requests || !results) return UNI_AI_MD_STATUS_INVALID_ARGUMENT;
  CTFontRef font = static_cast<CTFontRef>(context);
  for (size_t index = 0; index < request_count; ++index) {
    const auto *request = reinterpret_cast<const uni_ai_md_glyph_request_v1 *>(
        reinterpret_cast<const uint8_t *>(requests) + index * request_stride);
    auto *result = reinterpret_cast<uni_ai_md_glyph_result_v1 *>(
        reinterpret_cast<uint8_t *>(results) + index * result_stride);
    uni_ai_md_glyph_result_v1 full{sizeof(full)};
    uint32_t codepoint = request->codepoint;
    UniChar chars[2]{};
    CFIndex count = 1;
    if (codepoint <= 0xffff) {
      chars[0] = static_cast<UniChar>(codepoint);
    } else {
      uint32_t value = codepoint - 0x10000;
      chars[0] = static_cast<UniChar>(0xd800 + (value >> 10));
      chars[1] = static_cast<UniChar>(0xdc00 + (value & 0x3ff));
      count = 2;
    }
    CGGlyph glyphs[2]{};
    if (!CTFontGetGlyphsForCharacters(font, chars, glyphs, count)) glyphs[0] = 0;
    FillGlyphMetrics(font, glyphs[0], &full);
    full.struct_size = result->struct_size;
    std::memcpy(result, &full, std::min<size_t>(result->struct_size, sizeof(full)));
  }
  return UNI_AI_MD_STATUS_OK;
}

uni_ai_md_status CoreTextQueryMetrics(void *context, uni_ai_md_font_metrics_v1 *metrics) {
  if (!context || !metrics || metrics->struct_size < sizeof(*metrics))
    return UNI_AI_MD_STATUS_INVALID_ARGUMENT;
  CTFontRef font = static_cast<CTFontRef>(context);
  metrics->units_per_em = CTFontGetUnitsPerEm(font);
  metrics->ascender = static_cast<uni_ai_md_fixed26_6>(std::llround(CTFontGetAscent(font) * 64));
  metrics->descender = -static_cast<uni_ai_md_fixed26_6>(std::llround(CTFontGetDescent(font) * 64));
  metrics->line_gap = static_cast<uni_ai_md_fixed26_6>(std::llround(CTFontGetLeading(font) * 64));
  metrics->x_height = static_cast<uni_ai_md_fixed26_6>(std::llround(CTFontGetXHeight(font) * 64));
  metrics->cap_height = static_cast<uni_ai_md_fixed26_6>(std::llround(CTFontGetCapHeight(font) * 64));
  metrics->underline_position = static_cast<uni_ai_md_fixed26_6>(
      std::llround(CTFontGetUnderlinePosition(font) * 64));
  metrics->underline_thickness = static_cast<uni_ai_md_fixed26_6>(
      std::llround(CTFontGetUnderlineThickness(font) * 64));
  metrics->strikeout_position = 0;
  metrics->strikeout_thickness = 0;
  return UNI_AI_MD_STATUS_OK;
}

struct CoreTextOutlineContext {
  const uni_ai_md_outline_sink_v1 *sink;
  uni_ai_md_status status = UNI_AI_MD_STATUS_OK;
};

uni_ai_md_outline_point_v1 OutlinePoint(const CGPoint &point) {
  return {static_cast<uni_ai_md_fixed26_6>(std::llround(point.x * 64)),
          static_cast<uni_ai_md_fixed26_6>(std::llround(-point.y * 64))};
}

void EmitPathElement(void *context, const CGPathElement *element) {
  auto *forwarder = static_cast<CoreTextOutlineContext *>(context);
  if (forwarder->status != UNI_AI_MD_STATUS_OK) return;
  uni_ai_md_outline_point_v1 points[3]{};
  uint32_t kind;
  switch (element->type) {
    case kCGPathElementMoveToPoint:
      kind = UNI_AI_MD_OUTLINE_MOVE; points[0] = OutlinePoint(element->points[0]); break;
    case kCGPathElementAddLineToPoint:
      kind = UNI_AI_MD_OUTLINE_LINE; points[0] = OutlinePoint(element->points[0]); break;
    case kCGPathElementAddQuadCurveToPoint:
      kind = UNI_AI_MD_OUTLINE_QUAD; points[0] = OutlinePoint(element->points[0]);
      points[1] = OutlinePoint(element->points[1]); break;
    case kCGPathElementAddCurveToPoint:
      kind = UNI_AI_MD_OUTLINE_CUBIC; points[0] = OutlinePoint(element->points[0]);
      points[1] = OutlinePoint(element->points[1]);
      points[2] = OutlinePoint(element->points[2]); break;
    case kCGPathElementCloseSubpath:
      kind = UNI_AI_MD_OUTLINE_CLOSE; break;
    default: return;
  }
  forwarder->status = forwarder->sink->emit(forwarder->sink->context, kind, points);
}

uni_ai_md_status CoreTextOutlineGlyph(void *context, uint32_t glyph_id,
                                     const uni_ai_md_outline_sink_v1 *sink,
                                     uni_ai_md_glyph_result_v1 *metrics) {
  if (!context || !sink || !sink->emit || !metrics || metrics->struct_size < sizeof(*metrics) ||
      glyph_id == 0 || glyph_id > UINT16_MAX)
    return UNI_AI_MD_STATUS_INVALID_ARGUMENT;
  CTFontRef font = static_cast<CTFontRef>(context);
  CGGlyph glyph = static_cast<CGGlyph>(glyph_id);
  FillGlyphMetrics(font, glyph, metrics);
  CGPathRef outline = CTFontCreatePathForGlyph(font, glyph, nullptr);
  if (outline) {
    CoreTextOutlineContext forwarder{sink};
    CGPathApply(outline, &forwarder, EmitPathElement);
    CFRelease(outline);
    return forwarder.status;
  }
  return UNI_AI_MD_STATUS_OK;
}

std::string NormalizeBackground(const char *background) {
  const std::string value = background ? background : "";
  if (value.size() != 7 || value[0] != '#') return "#f5f5f5";
  for (size_t i = 1; i < value.size(); ++i) {
    const char c = value[i];
    if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') ||
          (c >= 'A' && c <= 'F'))) return "#f5f5f5";
  }
  return value;
}

}  // namespace

extern "C" uni_ai_md_ios_session *uni_ai_md_ios_create(
    const char *mode, const char *language_tags, int dark_mode, const char *background) {
  auto *state = new uni_ai_md_ios_session();
  const std::string tags = language_tags ? language_tags : "";
  const std::string color = NormalizeBackground(background);
  const auto scheme = dark_mode ? UNI_AI_MD_COLOR_SCHEME_DARK : UNI_AI_MD_COLOR_SCHEME_LIGHT;
  state->font = CreateSystemFont(tags);
  const bool has_font = state->font != nullptr;
  const uni_ai_md_font_provider_v1 provider = {
      sizeof(provider), const_cast<void *>(static_cast<const void *>(state->font)),
      CoreTextRequestGlyphs, CoreTextQueryMetrics,
      CoreTextOutlineGlyph};
  static const char font_id[] = "mermaid-text";
  const uni_ai_md_font_coverage_v1 coverage = {
      sizeof(uni_ai_md_font_coverage_v1), 0, UINT32_C(0x10ffff)};
  uni_ai_md_font_descriptor_v1 descriptor{};
  if (has_font) {
    descriptor.struct_size = sizeof(descriptor);
    descriptor.stable_id = {reinterpret_cast<const uint8_t *>(font_id), sizeof(font_id) - 1};
    descriptor.source.struct_size = sizeof(descriptor.source);
    descriptor.source.ownership = UNI_AI_MD_FONT_SOURCE_BORROWED;
    descriptor.style_flags = UNI_AI_MD_FONT_STYLE_NORMAL;
    descriptor.coverage = &coverage;
    descriptor.coverage_count = 1;
    descriptor.coverage_stride = sizeof(coverage);
    descriptor.provider = &provider;
    static const char identity[] = "ios-coretext-system-font-v1";
    CC_SHA256(identity, sizeof(identity) - 1, descriptor.content_identity);
  }
  uni_ai_md_mermaid_font_v1 mermaid_font{};
  mermaid_font.struct_size = sizeof(mermaid_font);
  mermaid_font.font_id = {reinterpret_cast<const uint8_t *>(font_id), sizeof(font_id) - 1};
  mermaid_font.style_flags = UNI_AI_MD_FONT_STYLE_NORMAL;
  mermaid_font.role = UNI_AI_MD_MERMAID_FONT_TEXT;
  uni_ai_md_mermaid_options_v1 mermaid{};
  mermaid.struct_size = sizeof(mermaid);
  mermaid.block_output = UNI_AI_MD_MERMAID_BLOCK_OUTPUT_SVG;
  mermaid.max_nodes = 1000;
  mermaid.max_subgraph_depth = 32;
  mermaid.max_label_bytes = 50000;
  mermaid.max_svg_bytes = 4 * 1024 * 1024;
  mermaid.background_color = {reinterpret_cast<const uint8_t *>(color.data()), color.size()};
  mermaid.color_scheme = scheme;
  if (has_font) {
    mermaid.fonts = &mermaid_font;
    mermaid.font_count = 1;
    mermaid.font_stride = sizeof(mermaid_font);
  }
  uni_ai_md_plugin_registration_options registration{};
  registration.struct_size = sizeof(registration);
  registration.flags = UNI_AI_MD_PLUGIN_REGISTRATION_PROGRESSIVE;
  if (uni_ai_md_runtime_create(nullptr, &state->runtime) != UNI_AI_MD_STATUS_OK ||
      uni_ai_md_runtime_register_render(state->runtime, uni_ai_md_render_module_entry_v1()) !=
          UNI_AI_MD_STATUS_OK) {
    uni_ai_md_ios_destroy(state);
    return nullptr;
  }
  const bool font_registered = has_font &&
      uni_ai_md_runtime_register_font(state->runtime, &descriptor) == UNI_AI_MD_STATUS_OK;
  if (!font_registered) {
    mermaid.fonts = nullptr;
    mermaid.font_count = 0;
  }
  if (uni_ai_md_runtime_register_plugin(state->runtime, uni_ai_md_math_plugin_entry_v1(),
                                        &registration) != UNI_AI_MD_STATUS_OK ||
      uni_ai_md_runtime_register_plugin(state->runtime, uni_ai_md_mermaid_plugin_entry_v1(),
                                        nullptr) != UNI_AI_MD_STATUS_OK ||
      uni_ai_md_runtime_seal(state->runtime) != UNI_AI_MD_STATUS_OK) {
    uni_ai_md_ios_destroy(state);
    return nullptr;
  }
  uni_ai_md_math_text_font_v1 math_font{};
  math_font.struct_size = sizeof(math_font);
  math_font.font_id = mermaid_font.font_id;
  math_font.style_flags = UNI_AI_MD_FONT_STYLE_NORMAL;
  uni_ai_md_math_options_v1 math{};
  math.struct_size = sizeof(math);
  math.inline_output = UNI_AI_MD_MATH_INLINE_OUTPUT_IMAGE;
  math.background_color = {reinterpret_cast<const uint8_t *>(color.data()), color.size()};
  math.color_scheme = scheme;
  if (font_registered) {
    math.text_fonts = &math_font;
    math.text_font_count = 1;
    math.text_font_stride = sizeof(math_font);
  }
  uni_ai_md_plugin_session_config configs[2]{};
  configs[0].struct_size = sizeof(configs[0]);
  configs[0].plugin_id = {reinterpret_cast<const uint8_t *>("org.uni-ai-md.math"), 18};
  configs[0].options = &math;
  configs[0].options_size = sizeof(math);
  configs[1].struct_size = sizeof(configs[1]);
  configs[1].plugin_id = {reinterpret_cast<const uint8_t *>("mermaid"), 7};
  configs[1].options = &mermaid;
  configs[1].options_size = sizeof(mermaid);
  uni_ai_md_session_options options{};
  options.struct_size = sizeof(options);
  options.flags = mode && std::strcmp(mode, "ast") == 0
                      ? (UNI_AI_MD_SESSION_FLAG_DELIVER_AST | UNI_AI_MD_SESSION_FLAG_AST_PAYLOAD)
                      : 0;
  options.delivery_mode = UNI_AI_MD_DELIVERY_PROGRESSIVE;
  options.event_callback = OnEvent;
  options.event_user_data = state;
  options.plugins = configs;
  options.plugin_count = 2;
  options.plugin_stride = sizeof(configs[0]);
  if (uni_ai_md_session_create(state->runtime, &options, &state->session) != UNI_AI_MD_STATUS_OK) {
    uni_ai_md_ios_destroy(state);
    return nullptr;
  }
  return state;
}

extern "C" char *uni_ai_md_ios_feed(uni_ai_md_ios_session *state,
                                    const char *utf8, uintptr_t size) {
  if (!state || !state->session || (!utf8 && size))
    return CopyResult("{\"error\":\"invalid uni-ai-md session or chunk\"}");
  state->ops.clear();
  return CollectResult(state, uni_ai_md_session_feed(
      state->session, reinterpret_cast<const uint8_t *>(utf8), size));
}

extern "C" char *uni_ai_md_ios_finish(uni_ai_md_ios_session *state) {
  if (!state || !state->session)
    return CopyResult("{\"error\":\"invalid uni-ai-md session\"}");
  state->ops.clear();
  return CollectResult(state, uni_ai_md_session_finish(state->session));
}

extern "C" void uni_ai_md_ios_destroy(uni_ai_md_ios_session *state) {
  if (!state) return;
  if (state->session) uni_ai_md_session_destroy(state->session);
  if (state->runtime) uni_ai_md_runtime_destroy(state->runtime);
  if (state->font) CFRelease(state->font);
  delete state;
}

extern "C" void uni_ai_md_ios_free(char *text) { std::free(text); }
