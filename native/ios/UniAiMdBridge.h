#ifndef UNI_AI_MD_IOS_BRIDGE_H
#define UNI_AI_MD_IOS_BRIDGE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct uni_ai_md_ios_session uni_ai_md_ios_session;

__attribute__((visibility("default"))) uni_ai_md_ios_session *uni_ai_md_ios_create(
    const char *mode, const char *language_tags, int dark_mode, const char *background);

/* 返回值由 uni_ai_md_ios_free 释放；无事件时返回 NULL，失败时返回 error JSON。 */
__attribute__((visibility("default"))) char *uni_ai_md_ios_feed(
    uni_ai_md_ios_session *session, const char *utf8, uintptr_t size);
__attribute__((visibility("default"))) char *uni_ai_md_ios_finish(
    uni_ai_md_ios_session *session);
__attribute__((visibility("default"))) void uni_ai_md_ios_destroy(
    uni_ai_md_ios_session *session);
__attribute__((visibility("default"))) void uni_ai_md_ios_free(char *text);

#ifdef __cplusplus
}
#endif

#endif
