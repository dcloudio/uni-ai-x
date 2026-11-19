# 关闭思考与搜索后的测速

2026-11-16，同一固定 Markdown 提示词，各 5 次。API 按 A→B 交替，之后直接操作 Chrome 网页，每次新建对话。

A 使用七牛原网关的 deepseek/deepseek-v4.1-flash，B 使用官方 deepseek-flash；两者都是 Flash 产品的对应调用名称，无法验证提供商实际部署版本完全相同。网页没有可见模型选择器，发送 model_type=default，响应 model 为空，因此网页不能作为已确认同模型的严格对比。

API 显式 thinking.type=disabled，未传 tools 或搜索参数；网页 thinking_enabled=false、search_enabled=false。API 所有请求 reasoning_chars=0，网页也没有思考内容。API max_tokens=16384、stream=true，未附加 system 消息。

| 轮次 | A 首正文（秒） | A 完整（秒） | B 首正文（秒） | B 完整（秒） | 网页首正文（秒） | 网页完整（秒） |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 0.753 | 6.131 | 0.983 | 4.940 | 0.970 | 4.619 |
| 2 | 0.878 | 6.508 | 0.525 | 4.469 | 1.336 | 5.260 |
| 3 | 0.899 | 6.395 | 0.445 | 4.429 | 0.772 | 4.871 |
| 4 | 0.815 | 6.250 | 0.550 | 4.565 | 0.763 | 5.044 |
| 5 | 0.945 | 6.593 | 0.559 | 4.434 | 0.806 | 4.606 |
| 平均 | 0.858 | 6.376 | 0.612 | 4.567 | 0.929 | 4.880 |

全部 15 次成功完成，正文均为 2997 字符，与固定内容逐字一致。

API 时间起点为发起 POST，首正文为收到第一个非空 content；网页从 XMLHttpRequest.send 起计时，首正文为 MutationObserver 观测到 DOM 正文，完整时间为流式请求 loadend。首字计时口径略有差别；不含取临时 Token、页面创建时间；网络结束不保证所有数学排版都已完成。

API 原始记录目录：../endpoint-speed-20261116-185733/。其中 method.json 保存完整测试参数，results.json 保存所有计时及 tokens；网页计时在 web-results.json，原始 SSE 在 web1.sse.txt 等。提示词已被前面的测试预热，存在缓存命中，未做冷缓存控制。

网页临时观测代码已恢复，深度思考与智能搜索均保留为关闭。
