#include "libmark_bridge.h"

#include "libmark/core.h"
#include "libmark/plugin.h"
#include "libmark/render.h"
#include "libmark/session.h"
#include "math_plugin.h"
#include "mermaid_plugin.h"

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

/*
 * bridge 把 libmark 事件转换为块级操作交给 ArkTS：BLOCK 追加新块，tail 事件
 * 更新当前未闭合块，RESET 清空块列表。未闭合 HTML 块在 bridge 内完成前缀 patch；
 * DATA 与 AST 块每次都是完整快照，直接整段替换。操作带顶层块序号，便于宿主把
 * HTML、DATA、AST 三种通道的块对齐到同一槽位。
 */
enum BridgeKind {
  kKindHtml = 0,
  kKindData = 1,
  kKindAst = 2
};

struct BridgeSegment {
  BridgeKind kind = kKindHtml;
  std::string text;
};

struct BridgeOp {
  uint32_t op = 0;
  BridgeKind kind = kKindHtml;
  size_t index = 0;
  /* 内容未变的 tail 提交：载荷为空、retain 指向上一份内容。 */
  bool unchanged = false;
  std::string text;
};

const uint32_t kOpAppend = 1;
const uint32_t kOpTail = 2;
const uint32_t kOpCommit = 3;
const uint32_t kOpReset = 4;

struct BridgeSession {
  libmark_runtime *runtime = nullptr;
  libmark_session *session = nullptr;
  BridgeSegment tail;
  bool has_tail = false;
  std::vector<BridgeOp> ops;
  bool callback_error = false;
};

static int OnEvent(const libmark_event *event, void *user_data) {
  auto *state = static_cast<BridgeSession *>(user_data);
  if (!state || !event) return 1;
  if (event->type == LIBMARK_EVENT_RESET) {
    state->tail = BridgeSegment();
    state->has_tail = false;
    state->ops.clear();
    BridgeOp op;
    op.op = kOpReset;
    state->ops.push_back(std::move(op));
    return 0;
  }
  if (event->type != LIBMARK_EVENT_BLOCK &&
      event->type != LIBMARK_EVENT_TAIL_BLOCK_PARTIAL &&
      event->type != LIBMARK_EVENT_TAIL_BLOCK_COMPLETE) {
    return 0;
  }
  std::string payload;
  for (size_t i = 0; i < event->span_count; ++i) {
    if (event->spans[i].data && event->spans[i].size)
      payload.append(reinterpret_cast<const char *>(event->spans[i].data), event->spans[i].size);
  }
  const BridgeKind kind = event->content_type == LIBMARK_CONTENT_DATA
                              ? kKindData
                              : (event->content_type == LIBMARK_CONTENT_AST
                                     ? kKindAst
                                     : kKindHtml);
  const bool unchanged = payload.empty() && event->retain_tail_bytes != 0;
  if (event->type == LIBMARK_EVENT_BLOCK) {
    if (payload.empty()) return 0;
    BridgeOp op;
    op.op = kOpAppend;
    op.kind = kind;
    op.index = event->top_level_block_index;
    op.text = std::move(payload);
    state->ops.push_back(std::move(op));
    state->tail = BridgeSegment();
    state->has_tail = false;
  } else {
    /*
     * tail 事件用 retain_tail_bytes 表达"保留上一份 tail 的前 N 字节"：HTML 用
     * 增量前缀 patch，AST/DATA 的 complete 在内容未变时给出 retain = 上一份整块
     * 快照且不带载荷，此时沿用原内容即可。
     */
    if (state->has_tail && state->tail.kind == kind) {
      size_t keep = event->retain_tail_bytes;
      if (keep > state->tail.text.size()) keep = state->tail.text.size();
      state->tail.text.resize(keep);
      state->tail.text.append(payload);
    } else {
      if (event->retain_tail_bytes != 0) return 1;
      state->tail.text = std::move(payload);
    }
    state->tail.kind = kind;
    state->has_tail = true;
    BridgeOp op;
    op.op = event->type == LIBMARK_EVENT_TAIL_BLOCK_COMPLETE ? kOpCommit : kOpTail;
    op.kind = kind;
    op.index = event->top_level_block_index;
    op.unchanged = unchanged;
    op.text = state->tail.text;
    state->ops.push_back(std::move(op));
    if (event->type == LIBMARK_EVENT_TAIL_BLOCK_COMPLETE) {
      state->tail = BridgeSegment();
      state->has_tail = false;
    }
  }
  return 0;
}

static void CleanupSession(BridgeSession *state) {
  if (!state) return;
  if (state->session) libmark_session_destroy(state->session);
  if (state->runtime) libmark_runtime_destroy(state->runtime);
  state->session = nullptr;
  state->runtime = nullptr;
}

static void DestroySession(BridgeSession *state) {
  CleanupSession(state);
  delete state;
}

static napi_value Throw(napi_env env, const char *message) {
  napi_throw_error(env, nullptr, message);
  return nullptr;
}

/*
 * mermaid 插件不内置字体，需要宿主在 render seal 前注册文本字体。设备系统字体
 * 目录中的候选字体按顺序尝试：第一个能完整读出的即可用。font bytes 以 BORROWED
 * 注册，render registry 会复制一份，因此本地缓冲在 register_font 返回后可释放。
 */
struct LoadedFont {
  std::vector<uint8_t> bytes;
  uint32_t face_index = 0;
  std::string path;
};

static const char *const kSystemFontCandidates[] = {
    "/system/fonts/HarmonyOS_Sans_SC_Regular.ttf",
    "/system/fonts/HarmonyOS_Sans_SC.ttf",
    "/system/fonts/NotoSansCJK-Regular.ttc",
    "/system/fonts/NotoSansCJKsc-Regular.otf",
    "/system/fonts/DroidSansFallbackFull.ttf",
};

static bool ReadWholeFile(const char *path, std::vector<uint8_t> *out) {
  FILE *file = std::fopen(path, "rb");
  if (!file) return false;
  if (std::fseek(file, 0, SEEK_END) != 0) {
    std::fclose(file);
    return false;
  }
  long size = std::ftell(file);
  if (size <= 0 || std::fseek(file, 0, SEEK_SET) != 0) {
    std::fclose(file);
    return false;
  }
  out->resize(static_cast<size_t>(size));
  size_t read = std::fread(out->data(), 1, out->size(), file);
  std::fclose(file);
  if (read != out->size()) {
    out->clear();
    return false;
  }
  return true;
}

/* 候选列表里第一个能完整读出的字体；集合字体（ttc/otc）按语言偏好选 face。 */
static uint32_t SelectFace(const std::vector<uint8_t> &bytes, const std::string &language_tags) {
  uint32_t face_index = 0;
  const libmark_string_view tags{(const uint8_t *)language_tags.data(), language_tags.size()};
  if (libmark_render_select_face(bytes.data(), bytes.size(), tags, &face_index) !=
      LIBMARK_STATUS_OK)
    return 0;
  return face_index;
}

static bool LoadSystemFont(const std::string &language_tags, LoadedFont *out) {
  for (const char *path : kSystemFontCandidates) {
    if (ReadWholeFile(path, &out->bytes)) {
      out->path = path;
      out->face_index = SelectFace(out->bytes, language_tags);
      return true;
    }
  }
  return false;
}

/* render registry 以字体字节的 SHA-256 作为 content_identity，这里在注册前算出。 */
static uint32_t RotateRight(uint32_t value, uint32_t amount) {
  return (value >> amount) | (value << (32 - amount));
}

static void Sha256Transform(uint32_t state[8], const uint8_t block[64]) {
  static const uint32_t k[64] = {
      0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u, 0x3956c25bu,
      0x59f111f1u, 0x923f82a4u, 0xab1c5ed5u, 0xd807aa98u, 0x12835b01u,
      0x243185beu, 0x550c7dc3u, 0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u,
      0xc19bf174u, 0xe49b69c1u, 0xefbe4786u, 0x0fc19dc6u, 0x240ca1ccu,
      0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau, 0x983e5152u,
      0xa831c66du, 0xb00327c8u, 0xbf597fc7u, 0xc6e00bf3u, 0xd5a79147u,
      0x06ca6351u, 0x14292967u, 0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu,
      0x53380d13u, 0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u,
      0xa2bfe8a1u, 0xa81a664bu, 0xc24b8b70u, 0xc76c51a3u, 0xd192e819u,
      0xd6990624u, 0xf40e3585u, 0x106aa070u, 0x19a4c116u, 0x1e376c08u,
      0x2748774cu, 0x34b0bcb5u, 0x391c0cb3u, 0x4ed8aa4au, 0x5b9cca4fu,
      0x682e6ff3u, 0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u,
      0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u};
  uint32_t w[64];
  uint32_t a, b, c, d, e, f, g, h;
  for (int i = 0; i < 16; ++i) {
    w[i] = (static_cast<uint32_t>(block[i * 4]) << 24) |
           (static_cast<uint32_t>(block[i * 4 + 1]) << 16) |
           (static_cast<uint32_t>(block[i * 4 + 2]) << 8) |
           static_cast<uint32_t>(block[i * 4 + 3]);
  }
  for (int i = 16; i < 64; ++i) {
    uint32_t s0 = RotateRight(w[i - 15], 7) ^ RotateRight(w[i - 15], 18) ^ (w[i - 15] >> 3);
    uint32_t s1 = RotateRight(w[i - 2], 17) ^ RotateRight(w[i - 2], 19) ^ (w[i - 2] >> 10);
    w[i] = w[i - 16] + s0 + w[i - 7] + s1;
  }
  a = state[0]; b = state[1]; c = state[2]; d = state[3];
  e = state[4]; f = state[5]; g = state[6]; h = state[7];
  for (int i = 0; i < 64; ++i) {
    uint32_t s1 = RotateRight(e, 6) ^ RotateRight(e, 11) ^ RotateRight(e, 25);
    uint32_t ch = (e & f) ^ (~e & g);
    uint32_t temp1 = h + s1 + ch + k[i] + w[i];
    uint32_t s0 = RotateRight(a, 2) ^ RotateRight(a, 13) ^ RotateRight(a, 22);
    uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
    uint32_t temp2 = s0 + maj;
    h = g; g = f; f = e; e = d + temp1;
    d = c; c = b; b = a; a = temp1 + temp2;
  }
  state[0] += a; state[1] += b; state[2] += c; state[3] += d;
  state[4] += e; state[5] += f; state[6] += g; state[7] += h;
}

static void Sha256(const uint8_t *data, size_t size, uint8_t out[32]) {
  uint32_t state[8] = {0x6a09e667u, 0xbb67ae85u, 0x3c6ef372u, 0xa54ff53au,
                       0x510e527fu, 0x9b05688cu, 0x1f83d9abu, 0x5be0cd19u};
  uint64_t bit_count = static_cast<uint64_t>(size) * 8;
  size_t offset = 0;
  while (offset + 64 <= size) {
    Sha256Transform(state, data + offset);
    offset += 64;
  }
  uint8_t tail[128];
  size_t remainder = size - offset;
  std::memcpy(tail, data + offset, remainder);
  tail[remainder] = 0x80;
  size_t padded = remainder <= 55 ? 64 : 128;
  std::memset(tail + remainder + 1, 0, padded - remainder - 1 - 8);
  for (int i = 0; i < 8; ++i)
    tail[padded - 1 - i] = static_cast<uint8_t>(bit_count >> (8 * i));
  for (size_t i = 0; i < padded; i += 64) Sha256Transform(state, tail + i);
  for (int i = 0; i < 8; ++i) {
    out[i * 4] = static_cast<uint8_t>(state[i] >> 24);
    out[i * 4 + 1] = static_cast<uint8_t>(state[i] >> 16);
    out[i * 4 + 2] = static_cast<uint8_t>(state[i] >> 8);
    out[i * 4 + 3] = static_cast<uint8_t>(state[i]);
  }
}

/*
 * createSession(mode?: string, languageTags?: string)。mode 为 "ast" 时只交付 AST
 * 通道：既不产出 HTML，也没有 DATA 通道，插件渲染载荷全部经节点 payload 随 AST 交付；
 * 默认（或 "html"）保持 HTML + DATA。languageTags 是逗号分隔的 BCP-47 语言优先级
 * 列表（内容语言在前），用于挑 mermaid 文本字体与集合字体的 face。
 */
static std::string ReadUtf8Arg(napi_env env, napi_value value) {
  napi_valuetype type = napi_undefined;
  size_t size = 0;
  std::string text;
  if (value == nullptr || napi_typeof(env, value, &type) != napi_ok || type != napi_string)
    return text;
  napi_get_value_string_utf8(env, value, nullptr, 0, &size);
  text.resize(size + 1, '\0');
  napi_get_value_string_utf8(env, value, text.data(), size + 1, &size);
  text.resize(size);
  return text;
}

static napi_value CreateSession(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2] = {nullptr, nullptr};
  napi_value self;
  if (napi_get_cb_info(env, info, &argc, args, &self, nullptr) != napi_ok) {
    return Throw(env, "libmark session creation failed");
  }
  const std::string mode = ReadUtf8Arg(env, args[0]);
  const std::string locale_text = ReadUtf8Arg(env, args[1]);
  const bool ast_only = mode == "ast";
  auto *state = new BridgeSession();
  /*
   * mermaid 插件不内置字体，注册前先从候选系统字体里按语言偏好读取一份文本字体，
   * 集合字体按语言选 face；字体字节以 BORROWED 注册，content_identity 取字体字节的
   * SHA-256。找不到字体时仍注册插件，flowchart 块按普通代码块回退并给诊断。
   */
  LoadedFont font;
  const bool has_font = LoadSystemFont(locale_text, &font);
  static const char kMermaidFontId[] = "mermaid-text";
  static const libmark_font_coverage_v1 font_coverage = {
      sizeof(libmark_font_coverage_v1), 0, UINT32_C(0x10ffff)};
  libmark_font_descriptor_v1 font_descriptor{};
  if (has_font) {
    font_descriptor.struct_size = sizeof(font_descriptor);
    font_descriptor.stable_id = {(const uint8_t *)kMermaidFontId, sizeof(kMermaidFontId) - 1};
    font_descriptor.source.struct_size = sizeof(font_descriptor.source);
    font_descriptor.source.bytes = font.bytes.data();
    font_descriptor.source.size = font.bytes.size();
    font_descriptor.source.ownership = LIBMARK_FONT_SOURCE_BORROWED;
    font_descriptor.face_index = font.face_index;
    font_descriptor.style_flags = LIBMARK_FONT_STYLE_NORMAL;
    font_descriptor.coverage = &font_coverage;
    font_descriptor.coverage_count = 1;
    font_descriptor.coverage_stride = sizeof(font_coverage);
    Sha256(font.bytes.data(), font.bytes.size(), font_descriptor.content_identity);
  }
  libmark_mermaid_font_v1 mermaid_font{};
  mermaid_font.struct_size = sizeof(mermaid_font);
  mermaid_font.font_id = {(const uint8_t *)kMermaidFontId, sizeof(kMermaidFontId) - 1};
  mermaid_font.style_flags = LIBMARK_FONT_STYLE_NORMAL;
  mermaid_font.role = LIBMARK_MERMAID_FONT_TEXT;
  libmark_mermaid_options_v1 mermaid_options{};
  mermaid_options.struct_size = sizeof(mermaid_options);
  mermaid_options.block_output = LIBMARK_MERMAID_BLOCK_OUTPUT_SVG;
  mermaid_options.max_nodes = 1000;
  mermaid_options.max_subgraph_depth = 32;
  mermaid_options.max_label_bytes = 50000;
  mermaid_options.max_svg_bytes = 4 * 1024 * 1024;
  mermaid_options.background_color = {(const uint8_t *)"#f5f5f5", sizeof("#f5f5f5") - 1};
  if (has_font) {
    mermaid_options.fonts = &mermaid_font;
    mermaid_options.font_count = 1;
    mermaid_options.font_stride = sizeof(mermaid_font);
  }
  libmark_plugin_registration_options registration{};
  registration.struct_size = sizeof(registration);
  registration.flags = LIBMARK_PLUGIN_REGISTRATION_PROGRESSIVE;
  if (libmark_runtime_create(nullptr, &state->runtime) != LIBMARK_STATUS_OK ||
      libmark_runtime_register_render(state->runtime, libmark_render_module_entry_v1()) != LIBMARK_STATUS_OK) {
    DestroySession(state);
    return Throw(env, "libmark runtime initialization failed");
  }
  /*
   * 字体注册是可选能力：系统字体读不到、格式不支持或身份校验失败时都不能让整个
   * session 失败，否则宿主会完全渲染不出任何内容。注册失败时按缺字体处理，mermaid
   * 的 flowchart 块回退为普通代码块。
   */
  bool font_registered = false;
  if (has_font)
    font_registered =
        libmark_runtime_register_font(state->runtime, &font_descriptor) == LIBMARK_STATUS_OK;
  if (!font_registered) {
    mermaid_options.fonts = nullptr;
    mermaid_options.font_count = 0;
  }
  if (libmark_runtime_register_plugin(state->runtime, libmark_math_plugin_entry_v1(), &registration) != LIBMARK_STATUS_OK ||
      libmark_runtime_register_plugin(state->runtime, libmark_mermaid_plugin_entry_v1(), nullptr) != LIBMARK_STATUS_OK ||
      libmark_runtime_seal(state->runtime) != LIBMARK_STATUS_OK) {
    DestroySession(state);
    return Throw(env, "libmark runtime initialization failed");
  }
  libmark_math_text_font_v1 math_text_font{};
  math_text_font.struct_size = sizeof(math_text_font);
  math_text_font.font_id = mermaid_font.font_id;
  math_text_font.style_flags = LIBMARK_FONT_STYLE_NORMAL;
  libmark_math_options_v1 math_options{};
  math_options.struct_size = sizeof(math_options);
  math_options.inline_output = LIBMARK_MATH_INLINE_OUTPUT_IMAGE;
  if (font_registered) {
    math_options.text_fonts = &math_text_font;
    math_options.text_font_count = 1;
    math_options.text_font_stride = sizeof(math_text_font);
  }
  libmark_plugin_session_config configs[2]{};
  configs[0].struct_size = sizeof(configs[0]);
  configs[0].plugin_id = {(const uint8_t *)"org.libmark.math", 16};
  configs[0].options = &math_options;
  configs[0].options_size = sizeof(math_options);
  configs[1].struct_size = sizeof(configs[1]);
  configs[1].plugin_id = {(const uint8_t *)"mermaid", 7};
  configs[1].options = &mermaid_options;
  configs[1].options_size = sizeof(mermaid_options);
  libmark_session_options options{};
  options.struct_size = sizeof(options);
  /*
   * AST 模式只交付 AST 通道，并打开节点 payload，让插件（公式、流程图）的渲染载荷
   * 随 AST 节点交付；HTML 模式保持默认的 HTML + DATA，不写插件 payload。
   */
  options.flags = ast_only
                      ? (LIBMARK_SESSION_FLAG_DELIVER_AST |
                         LIBMARK_SESSION_FLAG_AST_PAYLOAD)
                      : 0;
  options.delivery_mode = LIBMARK_DELIVERY_PROGRESSIVE;
  options.event_callback = OnEvent;
  options.event_user_data = state;
  options.plugins = configs;
  options.plugin_count = 2;
  options.plugin_stride = sizeof(configs[0]);
  if (libmark_session_create(state->runtime, &options, &state->session) != LIBMARK_STATUS_OK) {
    DestroySession(state);
    return Throw(env, "libmark session creation failed");
  }
  napi_value external;
  napi_create_external(env, state, [](napi_env, void *data, void *) { DestroySession(static_cast<BridgeSession *>(data)); }, nullptr, &external);
  return external;
}

static bool GetArgs(napi_env env, napi_callback_info info, size_t count, napi_value *args, BridgeSession **state) {
  size_t argc = count;
  napi_value self;
  if (napi_get_cb_info(env, info, &argc, args, &self, nullptr) != napi_ok || argc != count) return false;
  if (napi_get_value_external(env, args[0], reinterpret_cast<void **>(state)) != napi_ok || !*state) return false;
  return true;
}

static napi_value MakeEvent(napi_env env, const BridgeSession *state) {
  napi_value result, ops;
  napi_create_object(env, &result);
  napi_create_array_with_length(env, state->ops.size(), &ops);
  for (size_t i = 0; i < state->ops.size(); ++i) {
    const BridgeOp &op = state->ops[i];
    napi_value item, op_value, kind, content, index, unchanged;
    const char *kind_name = op.kind == kKindData
                                ? "data"
                                : (op.kind == kKindAst ? "ast" : "html");
    napi_create_object(env, &item);
    napi_create_uint32(env, op.op, &op_value);
    napi_create_string_utf8(env, kind_name, NAPI_AUTO_LENGTH, &kind);
    napi_create_string_utf8(env, op.text.data(), op.text.size(), &content);
    napi_create_uint32(env, static_cast<uint32_t>(op.index), &index);
    napi_get_boolean(env, op.unchanged, &unchanged);
    napi_set_named_property(env, item, "op", op_value);
    napi_set_named_property(env, item, "kind", kind);
    napi_set_named_property(env, item, "content", content);
    napi_set_named_property(env, item, "index", index);
    napi_set_named_property(env, item, "unchanged", unchanged);
    napi_set_element(env, ops, static_cast<uint32_t>(i), item);
  }
  napi_set_named_property(env, result, "ops", ops);
  return result;
}

static napi_value FeedChunk(napi_env env, napi_callback_info info) {
  napi_value args[2]; BridgeSession *state = nullptr;
  if (!GetArgs(env, info, 2, args, &state)) return Throw(env, "invalid session handle");
  size_t size = 0;
  if (napi_get_value_string_utf8(env, args[1], nullptr, 0, &size) != napi_ok) return Throw(env, "chunk must be a string");
  std::string chunk(size, '\0');
  napi_get_value_string_utf8(env, args[1], chunk.data(), size + 1, &size);
  state->ops.clear();
  auto status = libmark_session_feed(state->session, reinterpret_cast<const uint8_t *>(chunk.data()), size);
  if (status != LIBMARK_STATUS_OK) return Throw(env, "libmark feed failed");
  if (!state->ops.empty()) return MakeEvent(env, state);
  napi_value undefined; napi_get_undefined(env, &undefined); return undefined;
}

static napi_value FinishSession(napi_env env, napi_callback_info info) {
  napi_value args[1]; BridgeSession *state = nullptr;
  if (!GetArgs(env, info, 1, args, &state)) return Throw(env, "invalid session handle");
  state->ops.clear();
  if (libmark_session_finish(state->session) != LIBMARK_STATUS_OK) return Throw(env, "libmark finish failed");
  if (!state->ops.empty()) return MakeEvent(env, state);
  napi_value undefined; napi_get_undefined(env, &undefined); return undefined;
}

static napi_value DestroySessionJs(napi_env env, napi_callback_info info) {
  napi_value args[1]; BridgeSession *state = nullptr;
  if (!GetArgs(env, info, 1, args, &state)) return Throw(env, "invalid session handle");
  CleanupSession(state);
  napi_value undefined;
  napi_get_undefined(env, &undefined);
  return undefined;
}

napi_value LibmarkBridgeInit(napi_env env, napi_value exports) {
  napi_property_descriptor props[] = {
    {"createSession", nullptr, CreateSession, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"feedChunk", nullptr, FeedChunk, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"finishSession", nullptr, FinishSession, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"destroySession", nullptr, DestroySessionJs, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(props) / sizeof(props[0]), props);
  return exports;
}

EXTERN_C_START
static napi_module g_module = {
  .nm_version = 1,
  .nm_flags = 0,
  .nm_filename = nullptr,
  .nm_register_func = LibmarkBridgeInit,
  .nm_modname = "libmark_bridge",
  .nm_priv = nullptr,
  .reserved = {0},
};
EXTERN_C_END

extern "C" __attribute__((constructor)) void RegisterLibmarkBridge(void) { napi_module_register(&g_module); }
