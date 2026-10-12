/*
 * Android JNI 桥接：把 libmark 统一输出事件转换为块级操作，交给 UTS 插件的 Kotlin 包装类。
 *
 * 与 HarmonyOS 的 N-API 桥（native/harmony/libmark_bridge.cpp）保持同一份事件语义：
 * BLOCK 追加新块，tail 事件更新当前未闭合块，RESET 清空块列表；未闭合 HTML 块在桥内完成
 * 前缀 patch，DATA 与 AST 每次都是完整快照。操作带顶层块序号，便于宿主把 HTML、DATA、AST
 * 三种通道对齐到同一槽位。
 *
 * 事件以 JSON 字符串跨 JNI 传递，字段与 UTS 侧的 LibmarkEvent/LibmarkOp 一致：
 *   {"ops":[{"op":1,"kind":"html","content":"...","index":0,"unchanged":false}]}
 * 没有事件时返回 null，UTS 侧归一为 undefined。
 */

#include <jni.h>

#include "libmark/core.h"
#include "libmark/plugin.h"
#include "libmark/render.h"
#include "libmark/session.h"
#include "math_plugin.h"
#include "mermaid_plugin.h"

#include <android/api-level.h>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <dlfcn.h>
#include <string>
#include <vector>

namespace {

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
};

int OnEvent(const libmark_event *event, void *user_data) {
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

void CleanupSession(BridgeSession *state) {
  if (!state) return;
  if (state->session) libmark_session_destroy(state->session);
  if (state->runtime) libmark_runtime_destroy(state->runtime);
  state->session = nullptr;
  state->runtime = nullptr;
}

void DestroySession(BridgeSession *state) {
  CleanupSession(state);
  delete state;
}

/* JSON 字符串转义：控制字符按 \u00XX 输出，其余字节（含 UTF-8 多字节序列）原样保留。 */
void AppendJsonString(std::string &out, const char *data, size_t size) {
  static const char kHexDigits[] = "0123456789abcdef";
  out.push_back('"');
  for (size_t i = 0; i < size; ++i) {
    const unsigned char c = static_cast<unsigned char>(data[i]);
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
          out.push_back(kHexDigits[(c >> 4) & 0x0f]);
          out.push_back(kHexDigits[c & 0x0f]);
        } else {
          out.push_back(static_cast<char>(c));
        }
    }
  }
  out.push_back('"');
}

std::string MakeEventJson(const BridgeSession &state) {
  std::string out;
  out += "{\"ops\":[";
  for (size_t i = 0; i < state.ops.size(); ++i) {
    const BridgeOp &op = state.ops[i];
    if (i != 0) out.push_back(',');
    out += "{\"op\":";
    out += std::to_string(op.op);
    out += ",\"kind\":\"";
    out += op.kind == kKindData ? "data" : (op.kind == kKindAst ? "ast" : "html");
    out += "\",\"content\":";
    AppendJsonString(out, op.text.data(), op.text.size());
    out += ",\"index\":";
    out += std::to_string(op.index);
    out += ",\"unchanged\":";
    out += op.unchanged ? "true" : "false";
    out.push_back('}');
  }
  out += "]}";
  return out;
}

/*
 * Java/Kotlin 字符串是 UTF-16，直接 GetStringUTFChars 会把非 BMP 字符编成 CESU-8。
 * 这里显式做 UTF-16 → UTF-8，保证 emoji 等四字节字符交给 libmark 时仍是合法 UTF-8。
 */
std::string ToUtf8(JNIEnv *env, jstring value) {
  if (!value) return {};
  const jsize length = env->GetStringLength(value);
  if (length <= 0) return {};
  std::vector<jchar> units(static_cast<size_t>(length));
  env->GetStringRegion(value, 0, length, units.data());
  if (env->ExceptionCheck()) {
    env->ExceptionClear();
    return {};
  }
  std::string out;
  out.reserve(static_cast<size_t>(length));
  for (jsize i = 0; i < length; ++i) {
    uint32_t code = units[static_cast<size_t>(i)];
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < length &&
        units[static_cast<size_t>(i) + 1] >= 0xdc00 &&
        units[static_cast<size_t>(i) + 1] <= 0xdfff) {
      code = 0x10000u + ((code - 0xd800u) << 10) +
             (units[static_cast<size_t>(i) + 1] - 0xdc00u);
      ++i;
    } else if (code >= 0xd800 && code <= 0xdfff) {
      code = 0xfffdu; /* 孤立代理，替换为 U+FFFD */
    }
    if (code < 0x80u) {
      out.push_back(static_cast<char>(code));
    } else if (code < 0x800u) {
      out.push_back(static_cast<char>(0xc0u | (code >> 6)));
      out.push_back(static_cast<char>(0x80u | (code & 0x3fu)));
    } else if (code < 0x10000u) {
      out.push_back(static_cast<char>(0xe0u | (code >> 12)));
      out.push_back(static_cast<char>(0x80u | ((code >> 6) & 0x3fu)));
      out.push_back(static_cast<char>(0x80u | (code & 0x3fu)));
    } else {
      out.push_back(static_cast<char>(0xf0u | (code >> 18)));
      out.push_back(static_cast<char>(0x80u | ((code >> 12) & 0x3fu)));
      out.push_back(static_cast<char>(0x80u | ((code >> 6) & 0x3fu)));
      out.push_back(static_cast<char>(0x80u | (code & 0x3fu)));
    }
  }
  return out;
}

/* 反向转换：UTF-8 → UTF-16，避免 NewStringUTF 把四字节序列按 CESU-8 解释。 */
jstring ToJString(JNIEnv *env, const std::string &text) {
  std::vector<jchar> units;
  units.reserve(text.size());
  size_t i = 0;
  const size_t size = text.size();
  while (i < size) {
    const unsigned char lead = static_cast<unsigned char>(text[i]);
    uint32_t code = 0xfffdu;
    size_t extra = 0;
    if ((lead & 0x80u) == 0x00u) {
      code = lead;
    } else if ((lead & 0xe0u) == 0xc0u) {
      code = lead & 0x1fu;
      extra = 1;
    } else if ((lead & 0xf0u) == 0xe0u) {
      code = lead & 0x0fu;
      extra = 2;
    } else if ((lead & 0xf8u) == 0xf0u) {
      code = lead & 0x07u;
      extra = 3;
    }
    /* 首字节总是要消费掉，否则 ASCII 分支会原地打转。 */
    ++i;
    for (size_t k = 0; k < extra; ++k) {
      if (i >= size || (static_cast<unsigned char>(text[i]) & 0xc0u) != 0x80u) {
        code = 0xfffdu;
        break;
      }
      code = (code << 6) | (static_cast<unsigned char>(text[i]) & 0x3fu);
      ++i;
    }
    if (code <= 0xffffu) {
      units.push_back(static_cast<jchar>(code));
    } else if (code <= 0x10ffffu) {
      const uint32_t adjusted = code - 0x10000u;
      units.push_back(static_cast<jchar>(0xd800u + (adjusted >> 10)));
      units.push_back(static_cast<jchar>(0xdc00u + (adjusted & 0x3ffu)));
    } else {
      units.push_back(static_cast<jchar>(0xfffdu));
    }
  }
  if (units.empty()) return env->NewString(nullptr, 0);
  return env->NewString(units.data(), static_cast<jsize>(units.size()));
}

BridgeSession *ToSession(jlong handle) {
  return reinterpret_cast<BridgeSession *>(static_cast<uintptr_t>(handle));
}

jint ThrowIllegalState(JNIEnv *env, const char *message) {
  env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), message);
  return 0;
}

/*
 * mermaid 插件不内置字体，需要宿主在 render seal 前注册文本字体。Android 系统字体
 * 目录中的候选字体按顺序尝试：第一个能完整读出的即可用。font bytes 以 BORROWED
 * 注册，render registry 会复制一份，因此本地缓冲在 register_font 返回后可释放。
 */
struct LoadedFont {
  std::vector<uint8_t> bytes;
  uint32_t face_index = 0;
  std::string path;
};

const char *const kSystemFontCandidates[] = {
    "/system/fonts/NotoSansCJK-Regular.ttc",
    "/system/fonts/NotoSansSC-Regular.otf",
    "/system/fonts/NotoSansSC-Regular.ttf",
    "/system/fonts/DroidSansFallbackFull.ttf",
    "/system/fonts/Roboto-Regular.ttf",
};

bool ReadWholeFile(const char *path, std::vector<uint8_t> *out) {
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

/*
 * AFontMatcher 是 Android 10（API 29）才引入的符号，而桥接库按 android-24 构建，
 * 因此用 dlsym 取符号：拿到了就交给系统字体引擎按语言解析「文件 + 集合内 face
 * 序号」，拿不到就退回候选字体列表 + libmark_render_select_face。
 */
struct PlatformFontApi {
  bool available = false;
  void *(*matcher_create)() = nullptr;
  void (*matcher_destroy)(void *) = nullptr;
  void (*matcher_set_locales)(void *, const char *) = nullptr;
  void *(*matcher_match)(const void *, const char *, const uint16_t *, uint32_t, uint32_t *) =
      nullptr;
  void (*font_close)(void *) = nullptr;
  const char *(*font_path)(const void *) = nullptr;
  size_t (*font_collection_index)(const void *) = nullptr;
};

const PlatformFontApi &PlatformFont() {
  static const PlatformFontApi api = [] {
    PlatformFontApi loaded;
    if (android_get_device_api_level() < 29) return loaded;
    void *handle = dlopen("libandroid.so", RTLD_NOW | RTLD_LOCAL);
    if (!handle) return loaded;
    loaded.matcher_create =
        reinterpret_cast<decltype(loaded.matcher_create)>(dlsym(handle, "AFontMatcher_create"));
    loaded.matcher_destroy =
        reinterpret_cast<decltype(loaded.matcher_destroy)>(dlsym(handle, "AFontMatcher_destroy"));
    loaded.matcher_set_locales = reinterpret_cast<decltype(loaded.matcher_set_locales)>(
        dlsym(handle, "AFontMatcher_setLocales"));
    loaded.matcher_match =
        reinterpret_cast<decltype(loaded.matcher_match)>(dlsym(handle, "AFontMatcher_match"));
    loaded.font_close =
        reinterpret_cast<decltype(loaded.font_close)>(dlsym(handle, "AFont_close"));
    loaded.font_path =
        reinterpret_cast<decltype(loaded.font_path)>(dlsym(handle, "AFont_getFontFilePath"));
    loaded.font_collection_index = reinterpret_cast<decltype(loaded.font_collection_index)>(
        dlsym(handle, "AFont_getCollectionIndex"));
    loaded.available = loaded.matcher_create && loaded.matcher_destroy &&
                       loaded.matcher_set_locales && loaded.matcher_match && loaded.font_close &&
                       loaded.font_path && loaded.font_collection_index;
    return loaded;
  }();
  return api;
}

/* 交给系统字体引擎按语言优先级解析；不可用或读不到文件时返回 false。 */
bool LoadPlatformFont(const std::string &language_tags, LoadedFont *out) {
  const PlatformFontApi &api = PlatformFont();
  static const uint16_t kSampleText[] = {0x6C49u, 0x5B57u}; /* 汉字 */
  if (!api.available) return false;
  void *matcher = api.matcher_create();
  if (!matcher) return false;
  if (!language_tags.empty()) api.matcher_set_locales(matcher, language_tags.c_str());
  uint32_t run_length = 0;
  void *font = api.matcher_match(matcher, "sans-serif", kSampleText, 2, &run_length);
  if (font) {
    const char *path = api.font_path(font);
    const bool loaded = path != nullptr && ReadWholeFile(path, &out->bytes);
    if (loaded) {
      out->path = path;
      out->face_index = static_cast<uint32_t>(api.font_collection_index(font));
    }
    api.font_close(font);
    api.matcher_destroy(matcher);
    if (loaded) return true;
    out->bytes.clear();
  } else {
    api.matcher_destroy(matcher);
  }
  return false;
}

uint32_t SelectFace(const std::vector<uint8_t> &bytes, const std::string &language_tags) {
  uint32_t face_index = 0;
  const libmark_string_view tags{(const uint8_t *)language_tags.data(), language_tags.size()};
  if (libmark_render_select_face(bytes.data(), bytes.size(), tags, &face_index) !=
      LIBMARK_STATUS_OK)
    return 0;
  return face_index;
}

/*
 * 先让系统字体引擎按语言优先级解析，失败再按候选列表顺序取第一个能完整读出的
 * 字体，并用 libmark_render_select_face 在集合字体里选面。
 */
bool LoadSystemFont(const std::string &language_tags, LoadedFont *out) {
  if (LoadPlatformFont(language_tags, out)) return true;
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
uint32_t RotateRight(uint32_t value, uint32_t amount) {
  return (value >> amount) | (value << (32 - amount));
}

void Sha256Transform(uint32_t state[8], const uint8_t block[64]) {
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

void Sha256(const uint8_t *data, size_t size, uint8_t out[32]) {
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
 * createSession(mode, locales)。mode 为 "ast" 时只交付 AST 通道并打开节点 payload，
 * 其余取值交付 HTML + DATA，与 HarmonyOS 桥一致。locales 是逗号分隔的 BCP-47 语言
 * 优先级列表（内容语言在前、设备语言在后），用于挑 mermaid 文本字体与集合字体的 face。
 */
jlong CreateSession(JNIEnv *env, jobject /*unused*/, jstring mode, jstring locales) {
  const std::string mode_text = ToUtf8(env, mode);
  const std::string locale_text = ToUtf8(env, locales);
  const bool ast_only = mode_text == "ast";
  auto *state = new BridgeSession();
  /*
   * mermaid 插件不内置字体，注册前先按语言解析一份文本字体；字体字节以 BORROWED
   * 注册，content_identity 取字体字节的 SHA-256。找不到字体时仍注册插件，
   * flowchart 块按普通代码块回退并给诊断。
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
      libmark_runtime_register_render(state->runtime, libmark_render_module_entry_v1()) !=
          LIBMARK_STATUS_OK) {
    DestroySession(state);
    ThrowIllegalState(env, "libmark runtime initialization failed");
    return 0;
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
  if (libmark_runtime_register_plugin(state->runtime, libmark_math_plugin_entry_v1(),
                                     &registration) != LIBMARK_STATUS_OK ||
      libmark_runtime_register_plugin(state->runtime, libmark_mermaid_plugin_entry_v1(),
                                     nullptr) != LIBMARK_STATUS_OK ||
      libmark_runtime_seal(state->runtime) != LIBMARK_STATUS_OK) {
    DestroySession(state);
    ThrowIllegalState(env, "libmark runtime initialization failed");
    return 0;
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
  options.flags = ast_only ? (LIBMARK_SESSION_FLAG_DELIVER_AST | LIBMARK_SESSION_FLAG_AST_PAYLOAD)
                           : 0;
  options.delivery_mode = LIBMARK_DELIVERY_PROGRESSIVE;
  options.event_callback = OnEvent;
  options.event_user_data = state;
  options.plugins = configs;
  options.plugin_count = 2;
  options.plugin_stride = sizeof(configs[0]);
  if (libmark_session_create(state->runtime, &options, &state->session) != LIBMARK_STATUS_OK) {
    DestroySession(state);
    ThrowIllegalState(env, "libmark session creation failed");
    return 0;
  }
  return static_cast<jlong>(reinterpret_cast<uintptr_t>(state));
}

jstring CollectEvent(JNIEnv *env, BridgeSession *state, libmark_status status) {
  if (status != LIBMARK_STATUS_OK) {
    ThrowIllegalState(env, "libmark session step failed");
    return nullptr;
  }
  if (state->ops.empty()) return nullptr;
  const std::string json = MakeEventJson(*state);
  return ToJString(env, json);
}

jstring FeedChunk(JNIEnv *env, jobject /*unused*/, jlong handle, jstring chunk) {
  BridgeSession *state = ToSession(handle);
  if (!state || !state->session) {
    ThrowIllegalState(env, "invalid libmark session handle");
    return nullptr;
  }
  const std::string chunk_text = ToUtf8(env, chunk);
  state->ops.clear();
  const libmark_status status = libmark_session_feed(
      state->session, reinterpret_cast<const uint8_t *>(chunk_text.data()), chunk_text.size());
  return CollectEvent(env, state, status);
}

jstring FinishSession(JNIEnv *env, jobject /*unused*/, jlong handle) {
  BridgeSession *state = ToSession(handle);
  if (!state || !state->session) {
    ThrowIllegalState(env, "invalid libmark session handle");
    return nullptr;
  }
  state->ops.clear();
  return CollectEvent(env, state, libmark_session_finish(state->session));
}

void DestroySession(JNIEnv *env, jobject /*unused*/, jlong handle) {
  BridgeSession *state = ToSession(handle);
  if (!state) return;
  CleanupSession(state);
  delete state;
}

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_uts_sdk_modules_libmark_LibmarkBridge_nativeCreateSession(JNIEnv *env, jobject thiz,
                                                               jstring mode, jstring locales) {
  return CreateSession(env, thiz, mode, locales);
}

extern "C" JNIEXPORT jstring JNICALL
Java_uts_sdk_modules_libmark_LibmarkBridge_nativeFeedChunk(JNIEnv *env, jobject thiz, jlong handle,
                                                           jstring chunk) {
  return FeedChunk(env, thiz, handle, chunk);
}

extern "C" JNIEXPORT jstring JNICALL
Java_uts_sdk_modules_libmark_LibmarkBridge_nativeFinishSession(JNIEnv *env, jobject thiz,
                                                               jlong handle) {
  return FinishSession(env, thiz, handle);
}

extern "C" JNIEXPORT void JNICALL
Java_uts_sdk_modules_libmark_LibmarkBridge_nativeDestroySession(JNIEnv *env, jobject thiz,
                                                                jlong handle) {
  DestroySession(env, thiz, handle);
}
