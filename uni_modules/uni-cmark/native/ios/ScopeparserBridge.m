#import "ScopeparserBridge.h"

#include "md2html.h"

double scopeparser4iosVersionNumber = 1.0;
const unsigned char scopeparser4iosVersionString[] = "1.0.0";

@implementation ScopeparserBridge

- (BOOL)initializeCmarkGfm {
  return YES;
}

- (nullable NSString *)md2html:(NSString *)markdownText {
  NSData *markdownData = [markdownText dataUsingEncoding:NSUTF8StringEncoding];
  if (markdownData == nil) {
    return nil;
  }

  size_t htmlLength = 0;
  char *html = uni_cmark_markdown_to_html(
      (const uint8_t *)markdownData.bytes, markdownData.length, &htmlLength);
  if (html == NULL) {
    return nil;
  }

  NSString *result = [[NSString alloc] initWithBytes:html
                                              length:htmlLength
                                            encoding:NSUTF8StringEncoding];
  uni_cmark_free_html(html);
  return result;
}

- (nullable NSString *)md2json:(NSString *)markdownText {
  NSData *markdownData = [markdownText dataUsingEncoding:NSUTF8StringEncoding];
  if (markdownData == nil) {
    return nil;
  }

  size_t jsonLength = 0;
  char *json = uni_cmark_markdown_to_json(
      (const uint8_t *)markdownData.bytes, markdownData.length, &jsonLength);
  if (json == NULL) {
    return nil;
  }

  NSString *result = [[NSString alloc] initWithBytes:json
                                              length:jsonLength
                                            encoding:NSUTF8StringEncoding];
  uni_cmark_free_json(json);
  return result;
}

@end
