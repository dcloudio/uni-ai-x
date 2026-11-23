# 天气与工具调用交互排查（Android）

设备：WiFi ADB 小米 M2102K1AC，`io.dcloud.ai.x`，HBuilderX Alpha 5.37，自定义基座；DeepSeek 官方直连、Flash。

## 问题清单及证据

| 不正确表现 | 来源 | 复现与定位 |
| --- | --- | --- |
| 成功回答后复制等操作栏一直不出现 | 用户反馈 | 真机多次复现。消息已完成、Markdown 已收尾，操作栏条件和计时也已满足；原生新增虚拟行未挂载（查不到对应 list-item，控件位置为 0）。安卓改在已挂载的内容尾行展示操作栏，并独立传递标记，保持正文区块身份。 |
| 先输出“我先／我来”，天气请求期间无进度 | 用户反馈、静态走查 | 显示函数在正文出现后无条件清空后续工具状态。保留尾部进度，在下一轮正文到达时收起。 |
| 点失败卡片重试，转圈出现在上方，旧失败及按钮仍保留 | 用户反馈 | 真机已有超时会话复现，重试成功后甚至仍显示旧失败。消息显示缓存复用了上一轮最终快照。 |
| 重试保留旧思考及错误，正文不更新 | 静态走查、真机 | 与上一项同源。以回答代次清理快照并隔离列表项身份，重置时先撤销完成标记。 |
| 失败时出现“回答被终止”与错误卡片两种结果 | 静态走查 | 失败和停止共用 stop 状态；空回复占位不应在存在错误时再显示停止文案。 |
| 停止后仍发起自动重试，立即重试可能共享旧连接 | 静态走查 | 确定性测试复现：停止后仍调用三次。增加重试边界取消检查、MCP 原生任务登记、每次回答独立客户端。 |
| 主动停止未完整结束原生渲染状态 | 静态走查 | 上层先递增代次，旧 runner 的停止回调被过滤；上层需直接清理工具进度并结束原生流。 |
| 日历参数首次无效后，修正调用被禁止 | 静态走查 | 模型回合测试先失败后通过。仅有效参数占用本轮日历调用名额。 |
| 天气失败导致独立的待确认日历丢失 | 静态走查 | 混合工具回合测试先失败后通过。保留待确认卡片并单独呈现天气失败；不自动创建日程。 |
| 取消日历后仍显示“准备创建” | 真机补测 | 最终快照冻结了操作结果。独立更新本地操作进度／结果，保留已提交正文；手机确认取消后显示“已取消创建提醒”，操作栏恢复。 |
| 多轮正文粘连，前置说明紧贴后续 Markdown 标题 | 真机长回答 | 在官方 DeepSeek 工具回合间补足空行，同一轮流式片段保持连续。 |
| 切换会话报 `UniResizeObserver.observe target is not a valid element` | 真机日志 | 排队回调及列表回收后的非空 ref 均可能失效。卸载前关闭回调，原生端按 ID 重新获取已挂载元素；不对失效 ref 启动监听。仅销毁检查的第一版修复不足，已撤回其通过结论。 |
| 天气请求超时后不结束、停止触发失效原生任务异常 | 前序真机排查 | 已增加独立 20 秒截止、迟到回调隔离与原生任务释放。前序真机验证超时、再次超时及停止；本轮保留回归测试。 |

## 调整原则

一次回答仅使用本轮状态；重试即时撤销旧失败，当前位置切换为当前步骤。正文先出现时，后续工具进度仍位于内容末尾。失败返回可重试错误，成功与停止均结束原生渲染及输入忙碌状态。最后正文和异步资源收尾后，操作栏继续沿用一秒稳定期。

## 验证边界

日历参数修正和天气失败保留日历通过模拟模型/工具回合验证，不代表已经在手机上实际创建系统日历事件。未修改用户的 WiFi/VPN 设置；故障注入仅供短暂验证失败到重试路径，交付前移除。


## 天气专项验证

- 真实天气查询：步骤卡片持续更新，完整正文和复制／朗读／重新回答按钮均可见。
- 故障注入后的失败重试：只显示失败卡片；点击后原位置切换为连接进度；成功后无旧失败残留，完整正文与操作栏均可见。注入模拟超时终态，本轮不以它证明真实等待 20 秒；20 秒截止由前序真机与定时器测试覆盖。
- 天气初始化期间主动停止：进度消失、输入恢复、显示终止状态和操作栏。取消原生请求产生的预期失败不再作为网络错误上报。
- 88 项相关 Node 测试通过，涵盖 MCP 超时和迟到回调、原生任务生命周期、取消后的重试、DeepSeek 多轮工具／安全拒绝、日历、消息显示、原生资源收尾、操作栏稳定期和快照。
- 日历示例：确认弹窗可取消，取消结果和操作栏均显示，未创建系统日历事件。
- HBuilderX Android 编译成功；显示诊断与故障注入已移除。没有提交 Git commit。

真机截图留在本机临时目录：`weather-review-separate-prop-small.png`（成功）、`weather-final-error-small.png`（注入失败）、`weather-final-retry-progress-small.png`（重试进度）、`weather-final-retry-success-small.png`（重试成功）、`weather-review-stop-small.png`（停止）。

原生日志仍包含启动时既有的 `ClassNotFoundException: uni.UNIC50103A.UniAppConfig` 反射查询记录；成功查询与取消路径没有新增崩溃或失效 UTS 原生任务异常。


## 2026-11-23 天气交互矩阵补测

同一台 WiFi ADB 手机，通过真实界面操作及进程限定 logcat 核对。Flash 与 Pro 均验证真实天气成功，正文完整及操作栏出现。

| 场景 | 观察结果 |
| --- | --- |
| 连接天气服务／等待选工具时点右下停止 | 查询进度结束、输入恢复、显示终止及操作栏。 |
| 查找城市坐标“正在查询”时停止 | 进度结束，复制／重试出现；立即新建会话查天气成功，操作栏出现，全程未重启。截图 `weather-fetch-stop-before-small.png`、`weather-fetch-stop-after-small.png`、`weather-fetch-new-success-small.png`。 |
| Flash／Pro 正文输出一半停止 | 已有正文保留，输入和操作栏恢复；等待后正文长度不再增加。 |
| Pro 回答中切到 Flash | 原回答结束，保留正文和操作栏；之后 Flash 可继续发起天气查询。 |
| Flash／Pro 正文输出中来回切换会话两次 | 当前产品设计为离开会话时停止。返回后保留正文及操作栏，迟到回调不追加，其他消息正文哈希未改变。 |

尺寸监听修复后的最后三组：Pro 会话切换正文最终 300 字符、Pro 切 Flash 最终 448 字符、Flash 会话切换最终 546 字符，等待后均保持不变。最终进程 21660 的 `/private/tmp/weather-final-device-v2.log` 未再出现 `Unhandled`、`TypeError`、`ResizeObserver` 或致命崩溃。旧进程 18314 的日志保留修复不足时的异常，不将它计作通过；HBuilderX `logcat` 会重放历史日志，需与构建边界和进程日志对照。

本轮最后一次 Android 差量编译成功于 18:08:26，同步后于 18:08:31 进入页面。执行方式仍为项目根目录 `cli launch app-android --project /Users/json/Desktop/code/uni-ai-x --deviceId 192.168.2.7:42643 --playground custom --native-log false`，并单独获取 `cli logcat app-android --project /Users/json/Desktop/code/uni-ai-x`。尺寸监听生命周期新增三项用例覆盖销毁后排队回调、迟到通知及回收行失效 ref。


## 后续全面回归（2026-11-23）

天气专项通过后，扩展到所有现有自动测试及安卓主要界面链路。最终 `node --test tests/*.test.mjs`：215 项全部通过；`node tests/check-markdown-static.cjs`：137 个文件、Android/iOS/Harmony/Web/微信小程序五种条件编译，语法错误 0；`git diff --check` 通过。静态检查不等于其他平台真机验证。

全量测试首轮发现测试基建问题：朗读用例未模拟 `withDefaults` 默认值；表格用例未预处理平台分支及模拟 UTS `Number.from`；既有 Mermaid 断言仍要求 15px，而 HEAD 已使用 stage 16px 内边距与正文 0 边距。修正测试环境和对应断言，未为了通过测试改动这些既有产品行为。

全面回归还实际发现了官方原生搜索与新增客户端函数同时声明时的问题：非思考请求 HTTP 400；强制思考虽被接受，模型仍报告没有搜索工具。第一种强制思考尝试已撤回。根据 DeepSeek 官方 Web Tools 指南（https://api-docs.deepseek.com/guides/web_tools/）对代理的建议，工具代理使用官方独立 `/v1/tools/search` 和 `/v1/tools/fetch`；保留用户思考选择，不再混合原生网页工具和客户端函数。普通独立 DeepSeekAppAdapter 仍保留原生网页工具。工具代理的搜索来源、取消及多轮逻辑沿用现有实现，官方凭据仅发送至官方地址，并增加端点与凭据隔离测试。

| 安卓主要链路 | 本轮结果／证据（位于 `/private/tmp`） |
| --- | --- |
| 普通问答、重新回答 | 返回 `ANDROID_REGRESSION_OK`，操作栏恢复。`regression-normal-small.png`。 |
| 复制 | 显示“复制成功”。`regression-copy-toast-small.png`。 |
| 完整 Markdown／节流示例 | 标题、任务、公式、流程图、链接等正常；节流结束后显示完整末尾与操作栏。`regression-stream-end-small.png`。 |
| 日历确认取消 | 展示确认后取消，显示“已取消创建提醒”和操作栏，未实际创建日程。`regression-calendar-cancel-small.png`。 |
| 深度思考 | 思考区与正文显示，回答结束后输入恢复。 |
| 实际联网搜索 | 搜索官方文档，生成带引用回答及 5 个来源，操作栏显示。`regression-search-final-small.png`。 |
| 官方网页阅读 | 阅读 example.com，返回 Example Domain 标题、页面摘要及操作栏。`regression-read-final-small.png`。 |
| 搜索调整后真实天气 | 北京天气成功、完整正文及三按钮均可见。`regression-weather-after-search-small.png`。 |
| PDF 上传与问答 | 系统文件选择器选 PDF，附件“已就绪”；回答读取文件中 `BIRCH-788099B737` 和数量 47。文件是仅含校验文本的最小样例，回答中的总结能力措辞不作能力结论。`regression-pdf-upload-small.png`、`regression-pdf-answer-small.png`。 |
| OCR | 系统选择图片后回填 `CODE 83983327 / COUNT 73`。`regression-ocr-result-small.png`。 |
| 朗读 | 按钮 loading→蓝色播放态→idle；进程 AudioTrack start 证明实际播放器启动，未额外收音确认听感。`regression-speech-loading-small.png`、`regression-speech-playing-small.png`。 |
| 冷启动历史恢复 | 强停后启动，正文及工具栏恢复。`regression-history-final-small.png`。 |

最终源码 Android 编译于 18:30:07 成功、18:30:13 进入页面，进程 22887 验证上述搜索、天气、附件与音频；冷启动进程 26242。对应进程日志 `/private/tmp/regression-final-v3.log`、`regression-cold-log.log` 未见新增 `Unhandled`、`TypeError`、`ResizeObserver`、`FATAL EXCEPTION` 或模型请求异常。HBuilderX CLI 日志另存 `regression-hbuilder-final.log`，历史重放中的前述 400 不计作最终版本新错误。

边界：本轮并非所有服务商和所有平台的端到端认证；七牛未临时恢复配置或借用其凭据，iOS/Web/Harmony/小程序仅静态及相应用例；实体麦克风 ASR、真实创建系统日程、任意文件及持续弱网未纳入本轮真机通过声明。测试 PDF/PNG 复制到手机 Download，未删除用户已有文件。无 Git 提交。
