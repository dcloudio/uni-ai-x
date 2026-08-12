#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ScopeparserBridge : NSObject

- (BOOL)initializeCmarkGfm;
- (nullable NSString *)md2html:(NSString *)markdownText;

@end

NS_ASSUME_NONNULL_END
