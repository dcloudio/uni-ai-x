# DeepSeek 官网接口实测：充值后复测

## 最新结果：充值后能力调用成功

同日用户充值后再次使用相同官网地址、模型及现有官方 Key。余额查询显示 `is_available=true`，测试前余额 1.96 元。本轮共 18 次请求，含余额、对照参数及补测。

| 功能 | 充值后结果与实际证据 |
| --- | --- |
| 1. 联网搜索 | 200；返回 `deepseek_web_search`、`kind=search`、`status=completed`，用量记录 `tool_search=3`，有来源与回答 |
| 2. 深度思考搜索 | 200；返回两条 `kind=deep_search` 的完成记录，`reasoning_tokens=617`、`tool_search=3` |
| 3. 文件输入 | DOCX 上传 200，获得文件 ID；只将 ID 及问题提交到对话，正确回答文件中的随机编号 `CEDAR-5309CA2D13` 与数量 73 |
| 4. 阅读链接 | 200；返回 `deepseek_read_url`、`kind=read_link`、`status=completed`，`tool_fetch=1`，回答 example.com 标题及正文 |
| 5. 模型安全 | 合法参数 200、非法 level 明确 400；风险请求得到拒答。但本次 `finish_reason=stop`、`safety_tokens=0`，没有触发专用 `content_filter` 标识，不能将普通模型拒答单独当作额外审核层生效证据 |
| 6. 独立 Search | 200；返回两个搜索结果及链接、摘要 |
| 7. 独立 Fetch | 200；返回 example.com 标题及正文 |
| 8. OCR | DOCX 与独立 PNG 测试均 200；DOCX 正确返回随机文件编号；图片正确识别 `CODE 80871833` 和 `COUNT 73`，页面 `finish_reason=stop` |
| 9. ASR | 200；正确转写完整 11 秒 JFK 英语样本；另把官网 TTS 生成的音频提交到 ASR，正确得到“语音识别测试。今天是星期三。” |
| 10. TTS | 200；返回 136364 字节 WAV，24 kHz 单声道，实际 PCM 数据 136320 字节（约 2.84 秒）；经官网 ASR 转写核对语音内容正确 |

结论：10 项官方接口/参数均能发起有效调用，其中其余 9 项已取得明确的功能结果。安全参数接入、参数校验与风险提问拒答已验证；独立审核层的拦截效果仍有上述证据边界。搜索测试核对的是服务端工具确实执行，不把模型对版本日期的判断准确性当作本轮保证。

TTS 使用流式 WAV 头，头部帧数为未知长度占位值；音频时长按实际返回的 PCM 数据计算。未将占位帧数当作实际时长。

新增脱敏证据：`docs/evidence/deepseek-official-20261118/recharged-results.json`。脚本增加 `--ocr-file` 图片补测、`--cases safety` 风险拒答测试，并缩短终端输出，完整服务端工具记录保留在结果文件内。Key 未写入任何测试结果。

以下保留充值前记录，以说明最初失败原因。

## 历史记录：充值前余额不足

日期：2026-11-18。使用当前项目本地配置中的 DeepSeek 官方 API Key，请求只发往 `https://api.deepseek.com`，对话模型为 `deepseek-flash`。没有使用七牛临时 Token，没有打印或保存官方 Key。

### 充值前结果

本轮 13 次能力/参数请求及 1 次余额查询，共 14 次。普通对话及以下 10 项能力的有效请求均返回 **HTTP 402 / `Insufficient Balance`**，不能标记为功能验证成功。

| 功能 | 官网请求 | 实测结果 |
| --- | --- | --- |
| 联网搜索 | `/v1/chat/completions` + `deepseek_web_search` | 402，余额不足 |
| 深度思考搜索 | 同上，`thinking.type=enabled` | 402，余额不足 |
| 文件输入 | `/files`，DOCX，`purpose=text_recognition` 在 file 字段前 | 402；未获得文件 ID，因此未继续文件问答 |
| 阅读链接 | `/v1/chat/completions` + `deepseek_read_url` | 402，余额不足 |
| 模型安全 | `/v1/chat/completions` + `safety_check.level=high` | 402；实际审核/拒答未验证 |
| 独立 Search | `/v1/tools/search` | 402，余额不足 |
| 独立 Fetch | `/v1/tools/fetch` | 402，余额不足 |
| 独立 OCR | `/v1/tools/ocr`，DOCX，`purpose=text_recognition` | 402，余额不足 |
| ASR | `/v1/tools/asr`，此前网关 Qwen 已正确识别的 11 秒 JFK 样本 | 402，余额不足 |
| TTS | `/v1/tools/tts`，文字、`voice_id=stella`、`format=wav` | 402，余额不足 |

对照请求：不存在的工具 type 返回 422；非法 `safety_check.level=invalid_probe_level` 返回 400，明确提示 level 必须为 low 或 high。后者与网关对非法安全参数返回 200 的行为不同，证明官网实施了参数校验，但不代表安全审核功能已完成验证。

余额确认：`GET /user/balance` 返回 200，`is_available=false`，CNY `total_balance=-0.03`。因此当前 Key 能用于读取账号余额，但账号余额不足以完成付费能力测试。本次不能把余额错误解释为接口不支持。

## 复测

给当前 Key 对应的 DeepSeek 官网账号补充余额后，用新输出目录执行：

```sh
python3 scripts/probe-modelink-deepseek.py \
  --official \
  --output benchmark/deepseek-official-new-run \
  --asr-file /private/tmp/modelink-jfk.wav \
  --timeout 60
```

`--official` 固定使用官网地址和 `deepseek-flash`，从 `DEEPSEEK_API_KEY` 或本地项目现有配置读取 Key，不需要浏览器凭证桥接。授权头仅通过标准输入交给 curl，不写入命令参数或结果文件。

文件输入需核对实际文件 ID 和文档问答；搜索与阅读需核对 `server_tool_calls`、引用、用量；OCR 需核对随机文档标识；ASR 需核对完整语音文本；TTS 需核对 WAV 音频；安全审核除参数校验外还需补充审核用量或拒答行为验证。单独 HTTP 200 不作为上述能力全部成功的证据。

脱敏原始结果：`docs/evidence/deepseek-official-20261118/results.json`。脚本：`scripts/probe-modelink-deepseek.py`。
