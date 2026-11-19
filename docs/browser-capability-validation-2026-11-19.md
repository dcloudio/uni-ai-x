# 浏览器验证：Uni AI 网关与 DeepSeek 官网直连

日期：2026-11-19。项目：`/Users/json/Desktop/code/uni-ai-x`。测试页面：`http://localhost:5173/#/`。按用户要求先验证七牛网关，再验证官网直连；两边均从设置页面选择模型。

**结论：本轮覆盖的实际功能、限制提示及方案切换流程均已通过。修复了取消选图误报 error、缺少 favicon 导致 404 的问题，并完成回归。最终刷新、发送测试问题后，浏览器控制台无 error/warn。**

## 10 项功能实测结果

| 功能 | Uni AI／七牛网关：DeepSeek Flash | DeepSeek 官网直连：Flash |
| --- | --- | --- |
| 1. 联网搜索 | 通过：点击开启联网搜索，Search 返回真实来源，模型正确回答 Modelink ASR 路径 | 通过：官方原生 `search` 返回来源，正确回答 API 基础地址 |
| 2. 深度思考搜索 | 通过：点击开启思考及搜索，多轮搜索成功，思考文本 1066 字符，14 条来源 | 通过：思考文本 448 字符，返回三次 `deep_search` 服务端工具记录 |
| 3. 文件输入／文档问答 | 图片输入通过；PDF/DOCX 入口灰色，点击限制提示，无官网请求 | PDF、DOCX 分别在新会话上传成功，展示“已就绪”，均准确读出随机验证码和数量 |
| 4. 阅读链接 | 通过：Fetch HTTP 200，模型正确回答 example.com 标题及用途 | 通过：官方 `read_link` 记录及来源，正确回答标题和用途 |
| 5. 模型安全 | 风险问题得到模型拒答；仍不能据此确认平台独立审核机制 | 请求携带 `safety_check.level=high`，风险问题得到拒答；本轮没有触发 `content_filter` 撤回事件 |
| 6. Search 工具 | 应用实际请求 `/v1/tools/search`，HTTP 200，来源展示正常 | 项目通过官方原生搜索实现；本轮没有另外直接请求独立 Search 接口 |
| 7. Fetch 工具 | 应用实际请求 `/v1/tools/fetch`，HTTP 200 | 项目通过官方原生阅读实现；本轮没有另外直接请求独立 Fetch 接口 |
| 8. OCR | 相册入口上传中文订单图，云存储上传完成后发送 URL 给模型，四行原文全部匹配。专用 OCR 入口置灰且提示正确 | 点击识字入口，官方 `/v1/tools/ocr` HTTP 200，中文原文准确回填输入框 |
| 9. ASR | 页面按住录音、松手识别，`/v1/audio/transcriptions` HTTP 200，正确转写并自动发送 | 同样的页面流程调用 `/v1/tools/asr`，HTTP 200，正确转写并自动发送 |
| 10. TTS | 朗读入口灰色，点击提示，不借用官网 TTS | `/v1/tools/tts` HTTP 200，播放器实际进入 playing 后正常结束 |

网关文档/TTS 的“不支持”在本轮主要验证入口限制，不重复发送此前已失败的文件协议及 404 路径。官网独立 Search/Fetch 与原生搜索/阅读的调用方式不同；本报告不把原生工具记录冒充独立接口请求。

## 测试素材与方法

- 中文订单图片：`订单编号：松柏-83983327`、`商品：蓝色文件夹`、`数量：73`、`金额：1284.60元`。网关视觉模型和官方 OCR 均逐行匹配。
- PDF、DOCX：`Verification code: BIRCH-788099B737. Quantity: 47.`。分别在无该答案历史的新会话测试，排除从前一份文档答案推断。
- ASR：11 秒 JFK 标准语音，作为浏览器虚拟麦克风输入；页面实际执行 MediaRecorder 录音、WAV 转换、上传、识别及发送，AI 接口均为真实请求。没有验证实体麦克风硬件、环境噪声或手机权限。
- 浏览器文件工具无法访问本机素材路径，因此通过真实文件入口创建的 input 注入测试 File，并触发原有 change 回调。上传、解析、模型请求没有替换；这不等于实测每个系统文件选择器的手动选取体验。
- 只记录请求地址、模型、工具类型、参数摘要、HTTP 状态及耗时，不记录 API Key 或 Authorization。
- 第一条网页阅读的模型请求发生在 fetch 观察器安装前；Fetch 请求、页面答案和工具日志均已观察到。后续同时观察 fetch 与 XHR。
- 耗时是浏览器观察到响应头／请求结束的时间，流式 fetch 的时间不等于完整回答耗时。

## 发现并解决的问题

1. **正常取消选图被记录为 error。** 控制台原始错误为 `chooseAndUploadFile:fail cancel`。现在对取消不报错、不显示上传失败；真正的网络上传错误仍保留日志和失败提示。增加了取消及真实失败两项测试，刷新后的页面通过受控取消回放验证无日志、无失败提示，再完成一次真实图片上传及识字回归。
2. **缺少 favicon 产生 404。** 在 `index.html` 配置现有 `static/logo.png`。最终刷新使用该图标，控制台不再出现该 404。
3. **网关 DeepSeek 与官网 DeepSeek 易混淆。** 文件、专用识字、朗读入口仍置灰并可点击；提示标题为“功能使用限制”，说明当前“Uni AI 网关 · DeepSeek Flash”，询问是否切换到“DeepSeek 官方 · DeepSeek Flash”。按钮为“暂不切换”“立即切换”。暂不切换保留网关；立即切换只改变模型选择，不自动上传、识字或朗读。未配置官网时会提示先完成配置。

测试过程中还有自动化自身引起的日志：首次调试 import 时漏写 `?import` 产生模块 MIME 错误、脚本打开原生文件框产生用户激活警告。均已在最终刷新前移除对应操作，不属于应用功能缺陷。网关模型省略工具调用 ID 的警告由现有适配器生成兼容 ID 后继续，实际工具调用成功；不能把它描述为本轮修复的问题。

## 修改后回归

- 网关：取消选图不报错；随后真实上传英文数字图，正确识别 `CODE 83983327 / COUNT 73`，模型 HTTP 200。
- 灰色入口：逐个点击文件、识字、朗读，限制提示正确且没有额外官网请求。
- 切换确认：浏览器点击“暂不切换”后 provider 仍为 `qiniu`；点击“立即切换”后为 `deepseek / deepseek-flash`，入口恢复正常颜色，没有自动执行付费操作。
- 切换后：官方 OCR 再次正确识字；朗读再次 HTTP 200，监测到 `loading → playing → idle`。
- 最终刷新：选中的官网 Flash 正确持久化，发送“请只回答最终回归通过”，页面返回“最终回归通过”，官方 HTTP 200；检查控制台没有 error/warn。
- 10 组相关 Node 测试共 **41 项通过、0 失败**，包含两套 ASR 路由、文档重试、切换时取消及迟到结果、搜索编排、官网能力、图片取消、限制提示和确认切换。
- `git diff --check` 通过。未修改既有本地提供商配置或凭据，未提交 Git。

网关主测试记录中的 AI 请求全部走 `api.qnaigc.com`；官网主测试共 12 次请求全部走 `api.deepseek.com`，没有七牛请求。切换后的回归按各自阶段检查，没有自动跨线路兜底。

HBuilderX Dev 5.41 从项目根目录执行：

```sh
/Applications/HBuilderX-Dev.app/Contents/MacOS/cli launch web --project /Users/json/Desktop/code/uni-ai-x --browser Built
/Applications/HBuilderX-Dev.app/Contents/MacOS/cli logcat web --project /Users/json/Desktop/code/uni-ai-x --browser Built --mode lastBuild
```

项目编译并启动成功；最终变更的 HMR 日志正常，无新增相关编译错误。启动时仍有原有的嵌套类型、代码渲染类型和图片来源类型警告，不声称所有 HBuilderX 警告已清零。本轮平台为 Web，未重做 Android/iOS 真机验证。

## 证据

- [网关主测试](evidence/browser-capability-20261119/gateway.json)
- [官网主测试](evidence/browser-capability-20261119/official.json)
- [修改后回归及切换结果](evidence/browser-capability-20261119/regression.json)
- [最终刷新及回答](evidence/browser-capability-20261119/final-smoke.json)
- [最终控制台检查](evidence/browser-capability-20261119/final-console.json)
- 浏览器只读请求观察脚本：`scripts/browser-capability-observer.js`；页面刷新后移除所有测试替身，最终恢复该观察器的原始方法。

能力范围仍按已测样本判断：图片 OCR 不保证任意模糊图、手写字或复杂版面准确；网关独立安全审核仍未确认。
