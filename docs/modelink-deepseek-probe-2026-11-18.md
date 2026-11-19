# 仅使用现有 Uni AI 网关的能力实测

日期：2026-11-18。范围：当前项目的 Uni AI / 七牛 Modelink 网关，`https://api.qnaigc.com`，对话模型 `deepseek/deepseek-v4.1-flash`。

**全程只通过项目已有云对象 `uni-ai-x-co.getTmpToken({provider:'qiniu'})` 获取网关临时 Token。没有读取或使用 DeepSeek 官网 API Key，没有请求 `api.deepseek.com`。** 下文“官方协议”仅表示把 DeepSeek 官方参数或路径放到七牛网关上测试，不表示直连官网。

## 结论

| 功能 | 不用 DeepSeek 官网 Key，当前网关能否实现 | 本轮证据 |
| --- | --- | --- |
| 1. 联网搜索 | 能，通过网关独立 Search 接口及项目现有 Function Calling 实现；原样传官方内置工具未成功 | 网关 `/v1/tools/search` 返回 200 和两个真实结果；`tools:[{type:'deepseek_web_search'}]` 返回 400，指出工具 type 无效 |
| 2. 深度思考搜索 | 能做项目已有的“思考 + 应用执行搜索/阅读”循环；官方服务端原生方式未成功 | 开启 thinking 并声明官方搜索工具，重试后仍返回 400；现有应用端多轮循环的 17 项相关回归测试通过，其中包含反复搜索、阅读及引用测试 |
| 3. 文件输入 | 当前 DeepSeek 网关线路未验证成功 | `/v1/files` 按官方 multipart 协议上传 DOCX 返回 400；`/files` 返回 404；对话 `file_url` 请求虽为 200，但模型表示附件没有上传成功，没有读取到文档 |
| 4. 阅读链接 | 能，通过网关独立 Fetch 接口及项目现有 Function Calling 实现；原样传官方内置工具未成功 | 网关 Fetch 返回 200 和 example.com 正文；`deepseek_read_url` 工具声明返回 400 |
| 5. 模型安全 | 不能确认官方安全开关生效 | `safety_check.level=high` 和非法值 `invalid_probe_level` 都返回 200，均未返回安全校验标识。不能据此把官方安全参数标为已支持 |
| 6. 独立 Search | 能 | `/v1/tools/search` 返回 200，有来源标题、链接、摘要 |
| 7. 独立 Fetch | 能 | `/v1/tools/fetch` 返回 200，有标题及正文 |
| 8. 独立 OCR | 当前路径未接通 | 网关 `/v1/tools/ocr` 携带 DOCX、`purpose=text_recognition` 返回 404 |
| 9. ASR | 能，使用网关 Qwen ASR；不是官方 DeepSeek ASR 接口 | `/v1/audio/transcriptions`、`qwen/qwen-audio-3.0-asr-flash` 正确转写 11 秒 JFK 样本，并计量 11 秒；同一文件请求网关 `/v1/tools/asr` 返回 404 |
| 10. TTS | 当前路径未接通 | 网关 `/v1/tools/tts` 携带官方格式文字请求返回 404 |

本轮 Search、Fetch、Qwen ASR 实际调用成功。联网搜索、思考搜索、阅读链接的应用端编排此前已有实测记录；本轮再次运行相关 17 项回归测试全部通过。未把这次独立接口调用描述为重做了整套 UI 真机测试。

## 补测其他对话协议

- 网关 `/v1/messages` 普通对话返回 200；声明 `deepseek_web_search` 后返回 400，提示缺少函数工具名称。
- 网关 `/v1/responses` 普通请求和带官方搜索工具的请求均返回 404。
- 非思考模式使用不存在的工具 type 也返回 400，与拒绝官方工具声明的行为一致。
- 首次思考搜索请求在 55 秒无响应后超时；随后同模型、同工具 type 重试获得明确 400。超时本身不算不支持证据。

## 文件协议与安全参数的判断边界

Modelink 的 `/v1/files` 文档说明这是 Gemini 大文件的 URL 导入接口，接收 JSON `model`、`source_url`，不是 DeepSeek 官方 multipart 上传协议。该 Gemini 接口不在当前 DeepSeek 模型的本轮能力结论内。

通用对话文档列出 `file_url`，不代表每个模型都支持。本轮 DeepSeek Flash 返回“附件好像没有成功传上来”，不能把 HTTP 200 当成文件解析成功。没有据此修改项目的文档能力开关。

安全参数测试仅说明未获得生效证据，不证明网关完全没有内容安全治理，也不证明模型不会主动拒答。模型自己的拒答与 DeepSeek 官方 `safety_check` 接口能力不能混为一谈。

## 可复现脚本与证据

- 脚本：`scripts/probe-modelink-deepseek.py`，仅需 Python 标准库及 curl。
- 脱敏记录：`docs/evidence/modelink-deepseek-20261118/results.json`，含 25 次请求的状态、错误、返回体和测试分组。
- 其中 4 次 ASR 请求使用不足一秒的本地合成样本，不用于判断识别准确性；后来换用完整样本后，Qwen ASR 正确转写。脚本已增加 WAV 时长校验。
- 有效语音样本：`https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/samples/jfk.wav`，16 kHz 单声道、11 秒，已检查 WAV 声明帧数与实际数据长度一致。
- 临时 Token 只存在浏览器、Python 内存以及 curl 标准输入中，不写入结果或请求文件、不出现在进程参数中。
- 脚本在本机随机端口启用一次性地址的凭证桥接，每个 API 请求前通过现有云对象重新获取网关临时 Token，结束后关闭桥接服务。

示例（先启动本项目 Web 页面；输出目录必须是新目录）：

```sh
python3 scripts/probe-modelink-deepseek.py \
  --output benchmark/modelink-probe-new-run \
  --asr-file /private/tmp/modelink-jfk.wav
```

在项目 Web 页面的 DevTools 执行输出目录中的 `bridge.js` 函数以启动临时 Token 获取。使用 MCP 时可以把工作区内的脚本路径交给 `evaluate_script.sourcePath`；输出在工作区之外时需读取并以内联函数执行。仅补测其他协议时使用 `--cases routes`。

本轮未修改应用功能、提供商配置或凭据配置。启动项目使用当前已运行的 HBuilderX 正式版 5.34：

```sh
/Applications/HBuilderX.app/Contents/MacOS/cli launch web --project /Users/json/Desktop/code/uni-ai-x --browser Chrome
/Applications/HBuilderX.app/Contents/MacOS/cli logcat web --project /Users/json/Desktop/code/uni-ai-x --browser Chrome --mode lastBuild
```

Web 编译并启动成功；日志中仍有已有的嵌套类型、代码显示类型和图片来源类型警告，未修改对应应用代码。

## 文档依据

- [DeepSeek Search 使用说明](https://docs.modelink.ai/models-capabilities/model-deepseek-search)
- [网关文件管理](https://docs.modelink.ai/api/files)
- [兼容对话协议](https://docs.modelink.ai/api/chat-openai)
- [语音转写](https://docs.modelink.ai/api/audio-transcriptions)
- [原厂协议 Bypass 支持范围](https://docs.modelink.ai/api-endpoints/native-protocol-bypass)

结论仅适用于本次临时 Token、账号权限、模型及接口路径，不推断网关全部产品或未来版本的支持情况。

补充：图片识字、云函数 URL 转发、文档协议、安全与 TTS 的后续实测见 [补测报告](gateway-vision-and-capabilities-2026-11-18.md)。
