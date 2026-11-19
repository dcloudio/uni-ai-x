# Android 真机能力验证

日期：2026-11-19。设备：小米 M2102K1AC / Android 14，Wi-Fi ADB `192.168.2.3:42423`。使用用户重新打包的 Vapor 自定义基座，HBuilderX Dev 5.41。先测 Uni AI／七牛网关，再测 DeepSeek 官方直连。

## 10 项结果

| 功能 | Uni AI／七牛网关 | DeepSeek 官方直连 |
| --- | --- | --- |
| 1. 联网搜索 | ✅ 真实搜索返回来源并生成回答 | ✅ 官方原生 search 返回来源及 API 地址 |
| 2. 深度思考搜索 | ✅ 思考、多轮搜索及来源展示正常 | ✅ 思考、搜索及阅读官方资料成功，24 条来源 |
| 3. 文件输入／文档问答 | 🟡 图片上传识别通过；PDF/DOCX 灰色入口正确提示切换官网 | ✅ PDF、DOCX 均读出随机验证码 BIRCH-788099B737 和数量 47 |
| 4. 阅读链接 | ✅ 网关工具读取 example.com，正确回答标题及用途 | ✅ 官方 read_link，正确回答并显示来源 |
| 5. 模型安全 | 🟡 风险样例拒答；未验证平台独立审核 | 🟡 已有官方安全参数，风险样例拒答；未观察到 content_filter 撤回事件 |
| 6. Search 工具 | ✅ 本次安卓临时配置走 /v1/search/web，搜索结果展示正常 | ✅ 本项目走原生搜索；没有另行测试独立 Search HTTP 接口 |
| 7. Fetch 工具 | ✅ 网关 Fetch 读取页面成功 | ✅ 本项目走原生阅读；没有另行测试独立 Fetch HTTP 接口 |
| 8. OCR | ✅ 相册上传云存储后发图片 URL，准确识别 CODE 83983327 / COUNT 73；专用 OCR 入口正确限制 | ✅ 安卓文件选择器选图，官方 OCR 准确回填同一文本 |
| 9. ASR | 🟡 标准音频真实上传识别成功，约 70–100 秒；录音权限及录音界面通过 | ✅ 同一标准音频约 2 秒识别成功 |
| 10. TTS | — 灰色入口正确提示；未借用官网朗读 | ✅ SDK 调用及实际回答朗读按钮均进入 loading → playing → idle |

✅ 表示本轮样例通过，不能外推为任意图片、文档、音频均准确。ASR 标准样例为 11 秒 JFK 语音。手机录音权限、长按录音及滑动操作已观察；电脑播放标准音频失败，因此没有把已知音频通过手机实体麦克风录入并完成准确性验证。TTS 以真实原生播放器状态为证，没有另做外部收音确认。

PDF 通过真实 Android DocumentsUI 选择并上传，返回 file ID、展示已就绪后点击发送；DOCX 通过临时测试钩子调用原有文档上传逻辑，在独立新会话问答。OCR 通过真实识字按钮及 DocumentsUI 选择。部分模型选项、测试问题和音频样例由临时钩子输入，网络接口、解析、渲染和播放器均使用产品原代码，不伪造响应。

## 发现与修复

1. 网关多轮工具请求复用过期临时 Token，出现 auth_api_key_expired。改为每轮模型请求前重新取 Token，增加逐轮鉴权测试，多轮搜索／阅读回归成功。
2. 当前 Wi-Fi 的七牛 IPv6 连接超时，而 IPv4 /v1/models 约 0.17 秒返回。Android uni.request 加 firstIpv4 后模型与读取请求恢复到约 1–3 秒。uni.uploadFile 没有该选项，网关 ASR 仍慢，未声称已解决上传耗时。
3. Android 原生 uni.showModal 的部分限制确认流程触发 CDOMThread / libuniappx.so SIGSEGV。Android 改为页面内确认层，其他平台继续原有弹窗；保留“功能使用限制”“当前 Uni AI 网关”“DeepSeek 官方直连”“暂不切换／立即切换”。文件、OCR、TTS 已回归，返回键、取消与确认切换正常，测试进程 5715 未再崩溃。没有据此断言底层框架所有弹窗崩溃均已解决。

## 清理与验证

临时脚本 scripts/android-capability-temporary.uts 及 App.uvue 启动钩子已移除。没有改动既有提供商配置或凭据；原配置七牛处于注释状态，本轮仅临时注册七牛测试。切换后留在官方直连。未提交 Git。

相关 9 组 Node 测试 34 项通过、0 失败，git diff --check 通过。此前更广回归 40 项通过；本报告只将最终实际重跑的 34 项计入最终测试数。

从项目根目录执行最终清理后的运行与日志检查：

```sh
/Applications/HBuilderX-Dev.app/Contents/MacOS/cli launch app-android --project /Users/json/Desktop/code/uni-ai-x --deviceId 192.168.2.3:42423 --playground custom --customType local --native-log false
/Applications/HBuilderX-Dev.app/Contents/MacOS/cli logcat app-android --project /Users/json/Desktop/code/uni-ai-x
```

最终清理后重新编译、同步并启动成功。直接 ADB 操作输入并发送 `Reply only: ANDROID_OK`，页面正确返回 `ANDROID_OK`，见 final-smoke.png。HBuilderX 最终 logcat 无新增相关编译或运行错误，仍有 code/errCode 弃用提醒；最终进程 8895 的 Android 日志含 Invalid resource ID、OpenGLRenderer、FramePredict 等系统／渲染信息，未见新的 JavaScript 异常或 SIGSEGV，不声称系统日志全零错误。

证据见 [截图目录](evidence/android-capability-20261119/) 与 [脱敏运行观察](evidence/android-capability-20261119/runtime-observations.log)。旧 native 限制弹窗截图保留为修复前证据，以 android-confirmation-fixed.png 和 gateway-tts-confirm-fixed.png 为修复后界面。
