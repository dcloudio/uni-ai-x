# 阿里云百炼临时 Token 与 DeepSeek 官方 API 速度对照

测试日期：2026-11-16。电脑直接请求 API，每轮顺序为百炼 → DeepSeek 官方，共 6 轮；双方均剔除第 1 轮，统计第 2～6 轮。每次使用同一个固定 Markdown 提示词，仅发送单条用户消息。

百炼指定 deepseek-v4.1-flash-1017；DeepSeek 官方使用 deepseek-flash，官方文档说明其当前指向 DeepSeek-V4.1-Flash-1017。百炼 enable_thinking=false；官方 thinking.type=disabled。双方均流式请求、max_tokens=16384，其余采样参数使用服务默认值。

## 后 5 次平均值

| 接口 | 等待首个正文 | 正文输出耗时 | 总耗时 |
|---|---:|---:|---:|
| 阿里云百炼（临时 Token） | 0.660 秒 | 4.654 秒 | 5.314 秒 |
| DeepSeek 官方 API | 0.653 秒 | 3.862 秒 | 4.515 秒 |

本批次百炼的等待首个正文耗时为官方 API 的 1.01 倍，正文输出耗时为 1.21 倍，总耗时为 1.18 倍；总耗时平均相差 0.799 秒。

百炼获取临时 Token 平均耗时 0.166 秒（后 5 次，范围 0.129～0.195 秒），未计入上表。若把取 Token 也算入一次完整操作，百炼平均为 5.480 秒。

## 每轮原始结果

| 轮次 | 接口 | 取 Token | 等待首个正文 | 正文输出 | 总耗时 | 计入平均 |
|---|---|---:|---:|---:|---:|---|
| 1 | bailian | 0.217 | 0.774 | 4.614 | 5.388 | 否 |
| 1 | deepseek | — | 0.854 | 3.955 | 4.810 | 否 |
| 2 | bailian | 0.156 | 0.659 | 4.711 | 5.370 | 是 |
| 2 | deepseek | — | 0.606 | 3.783 | 4.389 | 是 |
| 3 | bailian | 0.185 | 0.661 | 4.568 | 5.229 | 是 |
| 3 | deepseek | — | 0.645 | 3.866 | 4.511 | 是 |
| 4 | bailian | 0.164 | 0.674 | 4.511 | 5.185 | 是 |
| 4 | deepseek | — | 0.695 | 3.906 | 4.601 | 是 |
| 5 | bailian | 0.195 | 0.657 | 4.911 | 5.568 | 是 |
| 5 | deepseek | — | 0.741 | 3.867 | 4.607 | 是 |
| 6 | bailian | 0.129 | 0.648 | 4.571 | 5.218 | 是 |
| 6 | deepseek | — | 0.576 | 3.891 | 4.467 | 是 |

以上单次数据单位均为秒。

## 测量与验证

计时从调用 HTTP 请求前开始，到收到 SSE [DONE] 为止；首个正文指第一个非空 content 增量。正文输出耗时为总耗时减去等待首个正文耗时。包含网络连接和传输，不包含取 Token、请求对象准备、界面渲染。使用 Python urllib 与 perf_counter，同一台电脑串行交叉执行。

百炼每次均以永久测试 Key 获取一个新的临时 Token，TTL 设为 60 秒，然后以临时 Token 发起模型请求。永久 Key 和临时 Token 未保存到测试结果。文档说明默认 TTL 为 60 秒，可设置为 1～1800 秒，临时 Token 继承父 Key 权限。

12 次请求均成功：12/12；回复逐字匹配：12/12；所有 reasoning_content 均为空。后 5 轮双方 prompt_tokens 均为 1514，缓存命中均为 1280。双方回复文本相同，但服务报告 completion_tokens 分别为百炼 1415、官方 1414，统计口径存在一 Token 差异。

这是本批网络条件下的 API 对照，不能直接与此前手机界面计时视为同一口径，也不能归因全部差距于网关。此前使用百炼无日期别名 deepseek-v4.1-flash 的检查数据保留在 ../bailian-speed-20261116/，不纳入本报告正式结果。

## 参考文档

- [百炼生成临时 API Key](https://docs.bailian.console.aliyun.com/zh/model-studio/generate-temporary-api-key)
- [百炼 DeepSeek 调用文档](https://docs.bailian.console.aliyun.com/zh/model-studio/deepseek-api)
- [DeepSeek 官方模型说明](https://api-docs.deepseek.com/zh-cn/)

原始数据：results.json、summary.json、method.json，以及每次回复 Markdown、SSE 数据和逐字 diff。复测脚本：../../scripts/benchmark-bailian.py。
