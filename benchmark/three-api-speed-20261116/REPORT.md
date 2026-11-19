# 三家 DeepSeek API 已完成测试汇总

相同固定 Markdown 提示词，关闭深度思考，电脑直接调用 API；不包含临时 Token 获取时间。以下数据来自不同批次，按平均总耗时排序，不代表同批交叉测试结果。

| 排名 | 接口 | 等待首个正文 | 正文输出耗时 | 总耗时 |
|---|---|---:|---:|---:|
| 1 | DeepSeek 官方 API | 0.653 秒 | 3.862 秒 | 4.515 秒 |
| 2 | 阿里云百炼 | 0.660 秒 | 4.654 秒 | 5.314 秒 |
| 3 | Uni AI 网关（七牛云） | 0.893 秒 | 5.641 秒 | 6.534 秒 |

按这些成功样本的平均值，DeepSeek 官方 API 最快，其次阿里云百炼，最后 Uni AI 网关。百炼总耗时约为官方 API 的 1.18 倍，Uni AI 网关约为官方 API 的 1.45 倍、百炼的 1.23 倍。

官方 API 和百炼取自 ../bailian-speed-20261116-exact-version/，双方交叉测 6 次、剔除第 1 次；Uni AI 网关取自 ../interleaved-20261116-round2/ 的 disabled.A，为此前 5 次平均。官方 deepseek-flash 文档对应 V4.1-Flash-1017，百炼明确指定 deepseek-v4.1-flash-1017；七牛云使用 deepseek/deepseek-v4.1-flash，未确认其具体日期版本映射。

本目录的新一轮三方交叉复测在第 1 轮百炼请求时中断：HTTP 403，AccessDenied.Unpurchased（模型未开通/无访问权限）。失败请求不参与上述统计。本目录 results.json 为该中断批次的诊断数据，不是上表数据来源。
