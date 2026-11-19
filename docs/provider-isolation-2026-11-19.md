# DeepSeek 官网与七牛网关能力隔离

日期：2026-11-19。目标：所有 AI 能力跟随用户选择的方案，不跨方案借用凭据或服务。

## 检查与整改

| 能力 | 官网方案 | 七牛网关方案 |
| --- | --- | --- |
| 模型、思考、安全 | 官网适配器、官方参数 | 网关模型适配器，不注入官方安全参数 |
| 搜索、阅读链接 | 官方原生服务端工具 | Function Calling + 网关 Search / Fetch |
| 文档 | 官网文件上传及 file ID 问答 | 拦截官方文件附件；不自动调用官网 |
| OCR | 官方 OCR 接口 | 图片聊天使用网关视觉模型；独立识字按钮提示使用图片问答，不调用官网 |
| ASR | `api.deepseek.com/v1/tools/asr`，官网 Key | `api.qnaigc.com/v1/audio/transcriptions`，Qwen ASR，网关 Token |
| TTS | 官网 TTS | 明确提示当前方案不支持，不借用官网 TTS |

发现的确定混用是语音识别固定调用七牛，即便用户选择了官网。现已改为显式传入当前提供商与模型，分别取对应凭据及调用对应接口；其他提供商不自动借用七牛。

追加保护：

- 切换提供商或模型时中断当前对话请求，阻止旧方案继续工具循环。
- 录音及识别固定使用开始时选定的方案；切换后取消请求，丢弃迟到结果，不写入草稿或自动发送。
- 官网文件重试检查当前方案；切换到网关会中止在途上传，迟到成功不能附加文件。
- 文件选择器、OCR、TTS 在获取凭据后的实际请求前再次检查取消状态。
- 切换方案停止朗读，取消加载中的 TTS。
- 官网 `server_tool_calls` 签名只随官网请求发送；网关请求去掉该字段，持久化历史保留。
- 不支持的入口提示当前方案限制，不引导用户在同一次操作中混用方案。

云存储及现有通用基础设施不属于跨 AI 提供商调用，不受此隔离影响。已有配置与凭据没有改动。

## 验证

相关 8 组 Node 回归共 36 项通过：官网能力、文档草稿、语音上传、语音交互、网关多轮搜索、搜索请求、搜索流及工具流。新增断言检查两边 ASR 的地址和凭据隔离、无配置时不兜底、网关不调用官方 TTS、官网工具签名隔离、切换方案取消上传及迟到结果。

本轮使用请求替身验证路由，没有重发付费识别请求；官方 ASR 的字段和返回解析沿用此前真实接口证据 `docs/evidence/deepseek-official-20261118/recharged-results.json`（英文、中文样本均 HTTP 200）。

在 `/Users/json/Desktop/code/uni-ai-x` 使用 HBuilderX Dev 5.41：

```sh
/Applications/HBuilderX-Dev.app/Contents/MacOS/cli launch web --project /Users/json/Desktop/code/uni-ai-x --browser Built
/Applications/HBuilderX-Dev.app/Contents/MacOS/cli logcat web --project /Users/json/Desktop/code/uni-ai-x --browser Built --mode lastBuild
```

编译成功，页面输出 App Launch / App Show。日志未发现本轮改动相关错误，仍有既有的嵌套类型、代码渲染类型、图片来源类型警告。Web 已验证，未在本轮重新跑 Android/iOS 真机。`git diff --check` 通过。
