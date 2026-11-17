# 2026-11-17 聊天主界面协调性调整

用户要求整体改善拥挤感，并使用此前提供的图片生成接口，将当前应用截图作为输入产生设计参考后再实现。

## 设计依据

通过历史会话找到用户 2026-11-12 提供的图片网关。只在进程内读取凭据，未保存密钥到项目或输出。模型列表验证 HTTP 200。通过 imagegen 技能自带 CLI 的 edit 模式调用用户网关的 gpt-image-2，以上一版真实安卓截图为参考，39.2 秒返回设计图。

- 设计图：`output/imagegen/uni-ai-ui-redesign-reference.png`
- 完整生成提示词：`output/imagegen/uni-ai-ui-redesign-prompt.txt`
- 提示词要点：三屏设计板（默认文字、附件草稿、附件展开）；白色与浅灰界面、蓝色强调；独立文字区、舒展模式按钮和操作按钮；保留拍照、相册、文件、识字；窄屏不能挤压。

实际实现采用设计图的浮动圆角卡片、文字区浅灰底、弱化模式按钮、统一操作图标和附件卡片。小屏按分组自动换行，不照搬设计图中挤在同一排的按钮。

## 实现

- 输入卡片两侧各留 12px，圆角 22px，内部 12px 留白；文字区 72px 高，15px 字号、23px 行高，与按钮区分离。
- 思考/搜索归为一个分组，附件/语音/发送归为一个分组，操作按钮 40px；空草稿发送显示弱化状态，内容非空时强调蓝色。320px 屏幕分组自动换行，375px 保持一排且无重叠。
- 附件面板使用统一圆角和间距；文档草稿卡片统一浅灰底、类型图标和移除按钮；调整图片草稿负边距，避免顶到输入卡片边缘。
- 顶部导航 40px 操作区域，消息气泡、消息操作图标间距和欢迎区域圆角统一。
- 删除聊天内容底部重复的“开启新对话”入口，顶部新对话入口保留。
- 全屏输入仍移除卡片外边距；录音时仍隐藏其他控件，展开为全宽蓝色/红色区域。

## 验证

- Web：375px 默认/带附件/展开面板截图检查；320px 分组换行截图检查；深色主题截图检查；多行和全屏输入截图检查。
- Web 真实 TXT 上传、显示就绪卡片、点击发送、回答返回 HARBOR-731/680，草稿清空。
- 安卓 192.168.2.3:42999：真实截图检查默认输入、展开面板、带附件卡片、发送后的界面；重新选取 TXT 并发送，回答正确返回 BIRCH-826045/58。
- 安卓录音蓝色与上滑取消红色截图检查；其他控件仍隐藏，取消不发送。
- 12 项附件/ASR/录音交互回归通过；`git diff --check` 通过。
- 复用现有 Web 服务，从项目根目录运行 HBuilderX `logcat web --browser Chrome --mode lastBuild`；安卓使用 `launch app-android --deviceId 192.168.2.3:42999 --playground custom --customType device --packageName io.dcloud.ai.x --native-log false`，并查看 `logcat app-android --mode lastBuild`。日志显示编译、同步及 App 启动成功，未见本次 UI 相关编译或运行错误。
- 本轮集中验证手机布局；桌面浏览器 emulation 切换出现 viewport/截图尺寸不一致，未将其作为桌面端验收通过的依据。iOS 未测。

安卓证据保存在 `/private/tmp/uni-ai-redesign-native-current.png`、`uni-ai-redesign-native-panel-live.png`、`uni-ai-redesign-native-attachment.png`、`uni-ai-redesign-native-answer.png`、`uni-ai-redesign-native-recording.png`、`uni-ai-redesign-native-canceling.png`。


## 用户截图校准（后续调整，以此为准）

依据 `/Users/json/Desktop/Deepseek ui` 的 13 张实机截图调整，取代前文生成设计图的输入框方案。白色单层输入卡片、46px 文字区、30px 模式按钮、28px 操作图标；空草稿隐藏发送按钮。附件面板移至卡片下方；图片为 72px 预览，文档为白色边框卡片。复用 dcloud-app 的部分图标几何；标题左对齐，回复移除头像并调整边距。

定位全屏收起图标错误来自 2026-11-16 的 `bb978efd14dc81dd516861d9daec79c3c6ca2568`：`compact-outline` 被配置为加载圆环，现改为向内箭头。新增图标回归检查。另修复图片预览组件外层 v-show 覆盖内部隐藏状态，造成无图片时仍占 88px 的问题。

本轮验证：Web 375px 默认、带文字、展开/收起、附件面板截图；安卓 mDNS 连接设备实际展开/收起截图，输入区高度恢复正常。10 项图标/附件/语音逻辑测试通过。HBuilderX 安卓 launch 后差量同步成功；Web 和安卓 lastBuild 日志未见相关错误。本轮未重新调用全部 AI 能力接口，也未重新验收 iOS。

安卓截图：`/private/tmp/native-compact.png`、`/private/tmp/native-icon-input.png`、`/private/tmp/native-fullscreen-fixed.png`。


## 图标风格二次校准

按截图 70/71 统一复制、朗读、重发图标：24×24 SVG 画布、1.5 线宽、20px 显示尺寸、同色；朗读改为波形，重发靠右。播放状态的波形同步缩小。输入框加号/关闭、语音/键盘统一圆形边界和线宽，与发送/停止的 26px 圆形外径和中心对齐；右侧按钮中心间距 34px。

Web 375px 和安卓真机均截图检查带文字时两组完整图标；安卓截图 `/private/tmp/icon-style-native-both.png`。复用 Web 服务并读取 lastBuild 日志；安卓自定义基座 launch、同步及启动成功，logcat 未见相关错误。7 项现有图标/语音回归通过。未请求 AI 重新生成回答，未提交 Git。


## 设置弹框间距校准

ADB 截图确认语言弹框及设置列表在安卓上间距明显过大，Web 同样的 min-height 行未表现为同一高度。去掉设置列表与选项行的 min-height + 纵向 padding 组合，使用总高 52px / 50px、水平内边距及显式 border-box；弹框缩为 530rpx（最大 320px），标题、单选圈和确认区按用户截图缩小。外观弹框移除多余标题图标。

同类走查：搜索状态与搜索来源行也有 min-height 加纵向 padding，去掉额外上下内边距，保留最小高度供长文本扩展；欢迎区已有 border-box，输入模式组无纵向 padding。未对框架默认盒模型作结论。

Web 与安卓语言/外观及设置列表均截图检查，确认操作后原设置未变。安卓语言约 340px → 228px；主页三项约 252px → 156px。截图 `/private/tmp/language-spacing-fixed.png`、`/private/tmp/theme-spacing-fixed.png`、`/private/tmp/settings-list-fixed.png`。Web 复用现有服务；安卓自定义基座 launch 成功，两端 lastBuild 日志无相关错误。搜索行仅静态检查与编译验证，本轮未重发搜索接口。


## AI 模型选择设计与可复用生图工具

用户要求沿用此前图片 API 重新设计模型选择界面。已创建 `/Users/json/.codex/skills/gateway-imagegen/SKILL.md` 及 `scripts/generate.py`，封装系统 imagegen CLI，支持提示词文件、参考图、输出、模型、尺寸、质量及超时；凭据从环境或用户授权的本机会话历史读取，未写入项目。工具校验通过，实际 edit 调用 gpt-image-2 成功，38.5 秒返回设计稿。

提示词：`output/imagegen/model-picker-prompt.txt`。参考稿：`output/imagegen/model-picker-design.png`。实现沿用圆角弹框、卡片、蓝色选中状态、用途说明、能力标签、关闭入口及立即生效提示；根据实际注册配置展示三个模型并按服务商分组，不将生成图中仅两个模型的示例当作真实配置。保留纵向滚动，显示高度按窗口与模型数量计算。主题/外观沿用原实现。Web 关于区显示当前版本，读取 `uni.getAppBaseInfo().appVersion`，当前为 3.2.3。聊天左上角已换成用户指定的上长下短横线。

验证：Web 375px、320px 深色、1100px 桌面截图；Web 切换 Pro、七牛并重新打开验证选中状态，恢复 Flash。安卓重新运行自定义基座，实际截图核对三卡片、选择 Pro 后主页文字更新，随后恢复 Flash。两端 lastBuild 日志未见相关编译/运行错误；git diff --check 通过。本轮未重测 AI 推理接口，未提交 Git。安卓 UI 证据 `/private/tmp/model-picker-native-after.png`、`/private/tmp/model-picker-native-pro.png`。


## 恢复网关完整模型目录

HEAD 中网关已有 7 个模型。2026-11-16 联调直连时的工作区改动将原网关配置注释保留；当天 20:32 左右创建的 install-qiniu.uts 仅补了 1 个 Flash 模型，造成当前目录缩减，并非本次 UI 删除。现恢复原 7 个模型 ID 与能力标记，显示名统一为 uni AI 网关；底层 provider ID、临时 Token 流程及请求地址沿用既有实现。DeepSeek 官方仍保留 Flash/V4 Pro。阿里云百炼在 HEAD 中同样已注释，未开启。

2 项回归通过：完整目录、官方与默认配置保留、重复安装、已有自定义网关保留。Web 目录为官方 2 + 网关 7，滚动至 MiniMax 并选择成功，恢复 Flash。安卓差量编译、同步成功，截图确认分组与滚动到底部 MiniMax 正常。新增目录不等于全部模型推理接口均重新测试。


## 输入卡片外沿修正

按用户确认的需求，输入卡片外壳显式透明，编辑区不再独立铺底；卡片统一背景与边框，显式 border-box 和 overflow:hidden，按同一圆角裁切。边框改用通用边框色使外沿清晰。语音区域圆角已归零，下方分隔线保持直线。

Web 核对文字/语音模式、附件展开、全屏展开收起；安卓差量同步后截图核对默认及语音模式外沿。两端 HBuilderX lastBuild 日志无相关错误。截图 `/private/tmp/input-edge-after.png`、`/private/tmp/input-edge-voice-after.png`。未提交 Git。


## 消息与输入卡片叠放（修正实际截断位置）

用户截图澄清：问题根源是消息列表与输入框上下占位，消息被输入框外层的整条水平边界裁掉，先前仅改边框并未解决。Web/安卓将消息视口铺到输入卡片后方；输入卡片仍独立不透明，外层透明。跟随官方 resize-observer 示例观察整个输入组件高度，驱动消息末尾占位及回到底部按钮位置；附件、草稿、语音和键盘变化均随组件高度变化，避免末尾消息被遮挡。扩展输入及其他平台保留原布局。

底部增加不透明的“内容由 AI 生成，请仔细甄别”提示区，遮住卡片下方与下部圆角两侧漏出的内容；安卓读取 safeAreaInsets.bottom，避开系统手势条。全屏和键盘打开时隐藏提示区。

验证：Web 长文中段截图、滚动到底部（末尾工具栏底 664px < 卡片顶 686px）、附件面板展开后末尾占位随输入高度变化、全屏展开收起。安卓长文表格在卡片上缘后方滚动，提示区及手势条截图，语音模式截图、键盘打开/收起截图。10 项现有附件/语音/全屏图标回归通过。两端 lastBuild 日志无相关错误。证据：/private/tmp/floating-footer-safe-content.png、/private/tmp/floating-footer-final-native.png、/private/tmp/floating-input-keyboard-stable.png。此前仅边框修正的结论以本节为准。


补充真机末尾验证：安卓回报输入区高度 148px。单独设置 list-item 动态高度时，末尾工具栏仍受遮挡；改为在末尾 list-item 内放实际高度 view，双锚点使用 v-if/else，最终真机截图中复制、朗读、重发均完整位于卡片上方。临时 composer-layout-check 日志已移除。最终证据 `/private/tmp/layout-menu-check.png`（文件名虽为 menu-check，实际为最终消息末尾截图）。

## 版本整理

功能代码、测试、界面调整及验证记录已按依赖拆分提交。设计图片为实现参考，实际输入框以用户截图校准后的方案为准。拆分未改变最终应用源码；全量 Node 回归结果及既有失败范围见能力接入文档末节。本地截图路径用于记录当时证据，临时文件不随仓库发布。
