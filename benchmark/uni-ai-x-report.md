# uni-ai x 和ChatGPT、Gemini、豆包、DeepSeek的横评测试报告

2026年11月3日，我们发布了[《uni-ai x 和ChatGPT、Gemini、豆包、DeepSeek的横评测试报告》](https://mp.weixin.qq.com/s?__biz=MjM5NjExMjc4NA==&mid=2649706006&idx=1&sn=2f71ed851a04c9470de53871a4108165&chksm=bef5dee9898257ff0860c583fcfab18cb9e063b9f443380957f8a5161f730f1d64f6d45a7f3d&token=1091645933&lang=zh_CN#rd)。

为了更直观地呈现一次回复中的累计卡顿，本次将“慢帧平均耗时”调整为“慢帧总耗时”：把每个慢帧超出 16.67ms 的时间相加，再取五轮均值。

其他应用已更新 Android 版本，本次据此重新测试。（ChatGPT 测试时已有新版，但多次未能完整输出测试 Markdown，调整提示词仍无效，故沿用 1.2026.244 版数据并按新口径重算。）

uni-ai x 是基于uni-app x 蒸汽模式的、开源的AI聊天客户端。支持Android、iOS、鸿蒙、web和小程序平台。开源地址见：[https://gitcode.com/dcloud/uni-ai-x](https://gitcode.com/dcloud/uni-ai-x)

web平台开源的 AI Chat 应用较多，但App平台的成熟开源的 AI Chat 客户端几乎只有 uni-ai x。

我们来对比下，这个开源产品，和主流的闭源AI客户端，包括 ChatGPT、Gemini、豆包、DeepSeek，他们在功能和性能两方面都有什么差别。

本评测主要站在开发者视角，不是C端用户视角。

AI客户端是一个技术挑战较高的应用。
- 功能方面，markdown有很多细节，多种代码语言高亮、表格、公式和图表，在所有平台都处理完善的工作量较大。
- 性能方面，在大模型流式响应的过程中，客户端需要持续接收流式二进制数据、流式解码、流式解析markdown、流式渲染在界面上。很容易掉帧。

还有一些功能、性能联动性问题。比如
1. 为了处理所有markdown场景，一些AI客户端会借助webview，比如各种mermaid图表，这又会引发性能问题。
2. 为了让流式渲染性能好一点，很多客户端都不使用系统的text组件，但这又会造成内容拖选需额外开发处理。甚至一些AI客户端的内容选择，需要单独开一个新界面。

## 测试环境

测试设备：
- Android：小米 11 Pro，Android 14，屏幕刷新率设为 120Hz，未 root。
- 鸿蒙：华为 nova 12，HarmonyOS 6.1.0.135，屏幕刷新率 120Hz。

Android上可通过adb命令监控三方应用帧率，鸿蒙上通过 HDC 和 SmartPerf 采集。iOS官方未提供监测三方应用帧率的功能，故未对比。

本次测试的应用版本：

| 应用 | Android 版本 | 鸿蒙版本 |
|---|---|---|
| Uni-AI X | 3.1.6 | 3.1.1 |
| 豆包 | 15.7.0 | 15.5.0 |
| DeepSeek | 2.7.4 | ❌ |
| ChatGPT | 1.2026.244 | ❌ |
| Gemini | 1.0.995038376 | ❌ |

各家AI应用均支持iOS和Android，但只有 uni-ai x 和豆包支持了鸿蒙。

## markdown功能评测

主流AI客户端都有很多业务功能，这些无需比较。这里重点比较的就是markdown功能和使用体验。

markdown在web平台是非常成熟的。各家AI的网页端聊天界面，markdown功能是完整版。但在app原生环境下，web平台的成熟库无法使用，需要自己开发各平台功能支持。

这导致各家AI客户端的markdown的功能覆盖度显示出差异。

本次对比进行了 Markdown 功能测试，基本功能各家AI客户端均能支持，但也存在部分细节不完善的情况。

### Android平台功能对比

| 对比项 | Uni-AI X | ChatGPT | Gemini | 豆包 | DeepSeek |
|---|---|---|---|---|---|
| 多语言代码高亮 | ✅ | ⚠️ | ❌ | ✅ | ✅ |
| 图表 | ✅ | ⚠️ | ❌ | ✅ | ✅ |
| 任务列表 | ✅ | ❌ | ❌ | ✅ | ✅ |

多语言代码高亮。除了Gemini外，其他AI客户端均支持主流编程语言高亮。

对于国内的编程语言，如鸿蒙和小程序平台特有语言，包括ets、wxs、ajs、wxml。国外的AI客户端支持不完善。

语言高亮的细节也有差异，部分AI客户端只有基本高亮，着色不够丰富。

uni-ai-x 支持扩展所有 VS Code 能高亮的编程语言，并且着色丰富度与PC上的效果一样。

Gemini客户端不支持渲染图表：

![Gemini 图表显示效果](https://web-ext-storage.dcloud.net.cn/uni-app-x/uni-ai-x/28558fed-8344-4a9f-855d-2f035e2ae370.png?imageView2/2/w/400/h/500)

ChatGPT 图表需手动点击触发。使用不方便，但这可以让ChatGPT在流式渲染时压力变轻。如下图，它默认显示markdown原文，需要点击右侧的播放按钮，进行一段时间等待，才能显示渲染后的图表。

![ChatGPT 图表手动渲染入口与显示效果](https://web-ext-storage.dcloud.net.cn/uni-app-x/uni-ai-x/205c6439-4288-43ce-ad5a-fd11b2c31110.png?imageView2/2/w/400/h/500)

国内几家AI客户端均可以直接显示图表。

任务列表，ChatGPT和Gemini以Markdown原文显示，不如国内产品精细：

![ChatGPT 与 Gemini 任务列表显示效果](https://web-ext-storage.dcloud.net.cn/uni-app-x/uni-ai-x/10a979ad-c825-493a-bc86-226bb3267324.png?imageView2/2/w/400/h/500)

国内AI客户端均支持任务列表。

下图为豆包：

![豆包任务列表显示效果](https://web-ext-storage.dcloud.net.cn/uni-app-x/uni-ai-x/be088ac2-2f57-4efd-920e-52e01df76b84.png?imageView2/2/w/400/h/500)

下图为deepseek

![DeepSeek 任务列表显示效果](https://web-ext-storage.dcloud.net.cn/uni-app-x/uni-ai-x/85b82a77-ec6c-4afb-a1fa-8541e8a02a5b.png?imageView2/2/w/400/h/500)

下图为 uni-ai x：

![uni-ai x 任务列表显示效果](https://web-ext-storage.dcloud.net.cn/uni-app-x/uni-ai-x/8c9edf62-6cfe-4237-99cd-eee1bb5be361.png?imageView2/2/w/400/h/500)

可以看出仅 uni-ai x 和 豆包 支持的最完善。

uni-ai x 和豆包Android版完整覆盖所测功能；Gemini 缺少的项目最多。

### 鸿蒙平台功能对比

仅uni-ai x 和豆包支持鸿蒙平台。

uni-ai x本身是一套代码，各端表现是一样。豆包的鸿蒙版，弱于Android版，如下：

| 对比项 | Uni-AI X | 豆包 |
|---|---|---|
| 图表 | ✅ | ❌ |
| 任务列表渲染  | ✅ | ❌ |

以下为鸿蒙系统下豆包的图表及任务列表的截图

![豆包鸿蒙版图表显示效果](https://web-ext-storage.dcloud.net.cn/uni-app-x/uni-ai-x/bb849883-2439-4e41-846e-11212fa2f026.png?imageView2/2/w/400/h/500)

![豆包鸿蒙版任务列表显示效果](https://web-ext-storage.dcloud.net.cn/uni-app-x/uni-ai-x/aaaa966a-4313-4dee-ad26-a17bd7efa70e.png?imageView2/2/w/400/h/500)

### 表格横向滚动体验

在表格横向滚动流畅性上，豆包无论在安卓还是鸿蒙端都不够顺滑。其余AI客户端均为常规滚动效果，而豆包的交互更偏向拖拽，遇到宽度较大的表格时，无法快速滚动。

小结一下功能部分：uni-ai x在markdown处理和平台功能拉齐方面最完善。Gemini功能欠缺最多。

## 性能评测

性能评测比功能评测要复杂。

首先要选定关键性能指标，其次要拉齐测试环境。

本报告聚焦流式响应期间的掉帧情况，这是性能难点。对于常规App而言，不掉帧是基本需求。但在流式渲染时，各家均会掉帧，只是比谁掉帧更少。

### Android平台掉帧测试

在相同手机上，打开HWUI呈现模式分析，用5款AI客户端执行相同的AI请求，确保相同的AI返回（具体提示词较长，详见附录），然后观察屏幕显示的掉帧情况。

HWUI呈现模式分析仅用于视频录屏观察；正式采集表格数据时未开启HWUI，慢帧数据由 ADB 命令 `adb shell dumpsys gfxinfo <渲染进程> framestats` 获取逐帧时间戳后计算。

柱状图越高，掉帧越严重。

先来看直观的视频录屏对比。

Uni-AI X：

<video src="https://web-ext-storage.dcloud.net.cn/video/uni-ai-x/uni-ai-x-new.mp4" width="80%" style="max-width: 400px;" controls></video>

ChatGPT：

<video src="https://web-ext-storage.dcloud.net.cn/video/uni-ai-x/chatgpt.mp4" width="80%" style="max-width: 400px;" controls></video>

Gemini：

<video src="https://web-ext-storage.dcloud.net.cn/video/uni-ai-x/gemini.mp4" width="80%" style="max-width: 400px;" controls></video>

豆包：

<video src="https://web-ext-storage.dcloud.net.cn/video/uni-ai-x/doubao.mp4" width="80%" style="max-width: 400px;" controls></video>

DeepSeek：

<video src="https://web-ext-storage.dcloud.net.cn/video/uni-ai-x/deepseek.mp4" width="80%" style="max-width: 400px;" controls></video>

多客户端对比视频：

从左至右依次：uni-ai-x、Gemini、ChatGPT

<video src="https://web-ext-storage.dcloud.net.cn/video/uni-ai-x/uni-ai-x-pk-out.mp4" width="80%" style="max-width: 400px;" controls></video>

从左至右依次：uni-ai-x、豆包、deepseek

<video src="https://web-ext-storage.dcloud.net.cn/video/uni-ai-x/uni-ai-x-pk-in.mp4" width="80%" style="max-width: 400px;" controls></video>

从视频中可以观察到：

- Uni-AI X 在具备完整 Markdown 功能的情况下，整个流式输出过程中很少掉帧。
- ChatGPT 在新增渲染内容时会出现掉帧，处理到代码块时尤为明显。ChatGPT 在流式期间默认不渲染图表，减轻了掉帧程度。
- Gemini 掉帧会随回复内容增加而逐步增多；它没有代码高亮、没有图表渲染，也没有流式始终自动滚动到底的功能，这些功能也会增加渲染压力。
- 豆包的慢帧次数和慢帧总耗时表现排名靠后。掉帧会随回复内容增加而增多。当然它支持的 Markdown 内容比 ChatGPT、Gemini 更多。
- DeepSeek 整体掉帧情况比其他主流闭源AI客户端要好一些，处理图表时掉帧比较明显。

需要强调的是，虽然所有AI客户端输出的是相同的Markdown内容，但Gemini 和ChatGPT不渲染任务列表，流式期间也不渲染图表，Gemini甚至不渲染代码高亮，这都会让国外这2款AI客户端的渲染压力更轻。

视频呈现的是感受，具体的数据相差多少呢？

因为不同AI回复的耗时不同，测试期间产生的总帧数也不同。有些帧在空等不渲染，所以直接请求所有帧的平均值并不准确。

重点是关注耗时大于等于16.67ms（常规 60fps 预算线）的帧，在呈现模式分析中它已超过基准红线。称之为“慢帧”。

这里关注 2 个重要指标：**慢帧次数**（耗时超标的频次）和**慢帧总耗时**（累计超时量）。

它们分别表达有多少帧卡了、累计超出预算多少时间。

注意：慢帧次数衡量的是渲染耗时超标的帧数，不直接等同于屏幕物理丢帧数（例如卡顿 100ms 也只计为 1 个慢帧）。

慢帧次数取五轮平均值；慢帧总耗时按每个慢帧超出 16.67ms 的部分求和，再除以五轮轮数。

注：以下数据为5轮均值，5轮的明细数据见后续《明细数据》章节。

| 应用 | 慢帧次数/轮 | 慢帧总耗时/轮 |
|---|---:|---:|
| Uni-AI X | 20.4 | 186.50ms |
| DeepSeek | 149.2 | 1697.34ms |
| Gemini | 240.4 | 9353.13ms |
| ChatGPT | 368.4 | 6556.40ms |
| 豆包 | 671.6 | 27242.45ms |

这个数据与视频的条形图感受是一致的。uni-ai x 很少掉帧，偶有掉帧其幅度也较轻。并且需要再次强调，uni-ai x 是在完整渲染本次所测 Markdown 功能的前提下取得这个测试数据。

再看下 uni-ai x 的数据和其他AI客户端的倍数关系。以uni-ai x的数据为1，看看其他AI客户端是uni-ai x的几倍？

| Android版 | Uni-AI X 慢帧次数倍数 | 慢帧总耗时倍数 |
|---|---:|---:|
| DeepSeek | 7.31 倍 | 9.10 倍 |
| Gemini | 11.78 倍 | 50.15 倍 |
| ChatGPT | 18.06 倍 | 35.16 倍 |
| 豆包 | 32.92 倍 | 146.07 倍 |

### 鸿蒙端掉帧测试

主流AI客户端目前仅 uni-ai x 和豆包支持鸿蒙。在华为 nova 12 上进行测试。

鸿蒙没有像Android那样自带渲染呈现条形图，所以没有视频录像对比。直接看采集的数据对比

流式响应的慢帧数据（以 5 轮均值统计）：

| 鸿蒙版 | 慢帧次数/轮 | 慢帧总耗时/轮 |
|---|---:|---:|
| Uni-AI X | 73.4 | 2563.86ms |
| 豆包 | 732.0 | 19726.75ms |

豆包的慢帧次数是 uni-ai x的约10倍，慢帧总耗时约为 7.69 倍。

再看下uni-ai x的数据和豆包的倍数关系。以uni-ai x的数据为1，看看其他AI客户端是uni-ai x的几倍：

| 应用 | 慢帧次数倍数 | 慢帧总耗时倍数 |
|---|---:|---:|
| 豆包 | 9.97 倍 | 7.69 倍 |

需要考虑到这个数据的前提是，豆包的鸿蒙版，并不支持图表和任务列表渲染，而uni-ai x是完整渲染的。如果豆包补全这些功能，渲染压力会更大。

### 其他性能测试

除了流式渲染期间外，我们也考察了其他关键性能指标。比如长会话滚动掉帧测试、APP启动速度测试。这些指标都在合理范围内，就无需罗列明细数据了。

可见最大的压力依然是流式渲染。

- 长会话滚动掉帧测试  
几款产品在长会话滚动上整体表现都不错，没有明显掉帧，相互之间差距很小。
可以看下 uni-ai-x 的长会话滚动效果：
<video src="https://web-ext-storage.dcloud.net.cn/video/uni-ai-x/scroll.mp4" width="80%" style="max-width: 400px;" controls></video>

- App启动速度  
各款应用启动体验都在合理区间，不存在明显的启动卡顿或延迟差异。
下面是 uni-ai-x 的启动录屏：

<video src="https://web-ext-storage.dcloud.net.cn/video/uni-ai-x/startup.mp4" width="80%" style="max-width: 400px;" controls></video>

## 实验方法及重现方式

开发者可在Android手机端打开开发者选项，显示HWUI呈现模式分析的条形图。

然后安装各个AI客户端，输入附录中的提示词，简单直观的了解各个AI客户端的掉帧情况。

如需要详细的数据，则需要参考如下实验方法。

为了方便大家复现实验，我们提供了一个开源小工具，更方便测试帧率数据，地址：[https://gitcode.com/dcloud/app-performance-tool](https://gitcode.com/dcloud/app-performance-tool)

### 测试环境准备

| 控制项目 | 测试条件 |
|---|---|
| 设备与系统 | 小米 11 Pro（`M2102K1AC`），Android 14 |
| 刷新率 | 120Hz（屏幕每秒刷新 120 次） |
| Root 状态 | 未 root（未获取 Android 超级用户权限） |
| 流式回复各轮电量 | 97%–100% |
| 供电状态 | 均供电 |
| 网络环境 | 各轮测试均连接同一 Wi-Fi 网络 |
| 流式回复各轮结束时电池温度 | 33–38°C |
| 流式回复场景 | 输入附录中的固定提示词，采集完整 Markdown 流式回复 |

电量和电池温度通过 `adb shell dumpsys battery` 读取，系统热状态通过 `adb shell dumpsys thermalservice` 读取；屏幕刷新率通过 `adb shell dumpsys display` 读取。

ChatGPT、DeepSeek、Gemini 和豆包均内置 Baseline Profile，安装时进行了AOT优化。Uni-AI X 3.1.6 测试时使用 ADB speed 命令进行了AOT优化拉齐。

### 指标计算

Android 单帧耗时按 HWUI 的计算方式得出：`FrameCompleted - IntendedVsync - max(0, SyncStart - SyncQueued)`（纳秒）。

| 指标 | 计算方式 |
|---|---|
| 慢帧次数 | 每轮统计单帧耗时 `>= 16,670,000 ns` 的帧数，五轮总数 ÷ 5 |
| 慢帧总耗时/轮 | 五轮所有慢帧的 `(单帧耗时 - 16,670,000 ns)` 之和 ÷ 5 ÷ 1,000,000（ms） |

例如，Uni-AI X 的五轮共有 3,604 个系统累计渲染帧，其中逐帧时间戳确认 102 个慢帧，慢帧占比为 `102 ÷ 3,604 × 100% = 2.83%`；五轮超额耗时合计 932.491755ms，平均 `932.491755 ÷ 5 = 186.50ms/轮`。

完整回复区间从清零帧统计的命令返回后开始，覆盖提交提示词后的等待和流式显示；固定回复全部显示完成后，以最终帧统计查询完成时刻作为终点。
有效轮次是设备条件符合要求且帧统计完整的一轮。

鸿蒙通过 HDC 调用 SmartPerf 取得相邻画面呈现间隔，无法像 Android `gfxinfo` 一样取得完整单帧耗时。因此以 SmartPerf 提供的 `fpsJitters` 帧间隔数据（纳秒）计算：间隔 `>=16,670,000 ns` 计 1 次慢帧；慢帧次数为五轮总数 ÷ 5，慢帧总耗时/轮为五轮慢帧间隔各自减去 16,670,000ns 后求和 ÷ 5 ÷ 1,000,000（ms）。该指标反映画面更新累计超出预算的时间，可在相同鸿蒙设备、相同场景下比较应用。

> **注**：测试机虽设为 120Hz，但报告采用 16.67ms（60fps 基准线）作为慢帧门槛，聚焦严重卡顿；Android 按单帧渲染耗时判断，鸿蒙按相邻画面呈现间隔判断，仅在各自系统内与竞品横向对比。


### 测试步骤

1. 每轮重新安装应用，登录并准备空白会话；重启手机后静置 2 分钟，关闭其他应用。这样让每轮从尽量一致的应用状态和设备状态开始，避免沿用上一轮的聊天内容或运行状态。
2. 执行 `adb shell dumpsys gfxinfo <渲染进程> reset` 清零此前帧数。命令结束后记下区间起点；待采集工具提示正式开始，再发送固定提示词。从本次任务开始统计帧数。
3. 固定回复全部接收并完成显示后结束采集，读取最终帧统计。这样让帧统计覆盖完整的流式回复和 Markdown 显示过程。
4. 每款应用统计 5 个有效轮次。帧数按 5 轮合计，慢帧占比用合计慢帧数除以合计总帧数；时长和慢帧总耗时按轮取算术平均。

鸿蒙端使用 HDC 连接华为 nova 12，SmartPerf 按应用包名采集 FPS 和帧间隔。

### 采集命令

#### Android

以下命令由电脑通过 Android 调试桥（ADB）发送到手机；`<package>` 表示应用包名，`<renderer>` 表示实际渲染界面的进程名。Gemini 的 `<renderer>` 为 `com.google.android.googlequicksearchbox:search`。

- 清零渲染进程此前累计的帧统计，并以命令结束时刻作为正式区间起点：`adb shell dumpsys gfxinfo <renderer> reset`
- 读取流式回复期间总帧数和逐帧纳秒时间戳，并统计耗时 16.67ms 及以上的帧数：`adb shell dumpsys gfxinfo <renderer> framestats`
- 核对前台页面的进程名并查找实际渲染进程：`adb shell dumpsys activity activities`、`adb shell ps -A`
- 读取应用版本：`adb shell dumpsys package <package>`
- 读取电量和电池温度：`adb shell dumpsys battery`
- 读取 Android 系统热状态：`adb shell dumpsys thermalservice`
- 读取显示配置和屏幕刷新率：`adb shell dumpsys display`

#### 鸿蒙

按包名启动采集，回复显示完成后停止，并按停止命令返回的路径取回数据：

```sh
hdc -t <设备> shell SP_daemon -start -PKG <包名> -f -r -print
hdc -t <设备> shell SP_daemon -stop
hdc -t <设备> file recv <采集文件路径> <本机文件>
```


## 明细数据

### Android端流式回复汇总

每款应用均纳入 5 轮。表中每轮平均慢帧数 = 五轮慢帧总数 ÷ 5；例如 Uni-AI X 为 `102 ÷ 5 = 20.4` 帧。

| 应用 | 平均时长 (s) | 5 轮总渲染帧数 | >=16.67ms 慢帧数 | 每轮平均慢帧数 | 慢帧占比 | 慢帧总耗时/轮 |
|---|---:|---:|---:|---:|---:|---:|
| ChatGPT | 23.58 | 8,766 | 1,842 | 368.4 | 21.01% | 6556.40ms |
| Uni-AI X | 13.90 | 3,604 | 102 | 20.4 | 2.83% | 186.50ms |
| Gemini | 12.44 | 2,671 | 1,202 | 240.4 | 45.00% | 9353.13ms |
| DeepSeek | 11.05 | 3,329 | 746 | 149.2 | 22.41% | 1697.34ms |
| 豆包 | 33.28 | 6,139 | 3,358 | 671.6 | 54.70% | 27242.45ms |

### Android端流式回复逐轮明细

| 应用 | 轮次 | 时长(s) | 总帧 | >=16.67ms 慢帧数 | 慢帧占比 | 慢帧总耗时 |
|---|---:|---:|---:|---:|---:|---:|
| ChatGPT | 1 | 27.36 | 1973 | 375 | 19.01% | 5913.41ms |
| ChatGPT | 2 | 23.30 | 1763 | 371 | 21.04% | 6452.02ms |
| ChatGPT | 3 | 32.00 | 2387 | 462 | 19.35% | 7488.04ms |
| ChatGPT | 4 | 17.88 | 1361 | 306 | 22.48% | 6336.57ms |
| ChatGPT | 5 | 17.39 | 1282 | 328 | 25.59% | 6591.96ms |
| Uni-AI X | 1 | 13.13 | 778 | 24 | 3.08% | 346.67ms |
| Uni-AI X | 2 | 12.27 | 704 | 19 | 2.70% | 79.77ms |
| Uni-AI X | 3 | 15.25 | 529 | 18 | 3.40% | 116.81ms |
| Uni-AI X | 4 | 15.40 | 1061 | 20 | 1.89% | 143.36ms |
| Uni-AI X | 5 | 13.43 | 532 | 21 | 3.95% | 245.89ms |
| Gemini | 1 | 12.67 | 440 | 200 | 45.45% | 9203.84ms |
| Gemini | 2 | 12.68 | 633 | 332 | 52.45% | 9697.10ms |
| Gemini | 3 | 11.91 | 517 | 233 | 45.07% | 9320.57ms |
| Gemini | 4 | 11.92 | 540 | 220 | 40.74% | 9535.39ms |
| Gemini | 5 | 13.04 | 541 | 217 | 40.11% | 9008.75ms |
| DeepSeek | 1 | 10.34 | 631 | 157 | 24.88% | 2044.42ms |
| DeepSeek | 2 | 11.51 | 687 | 135 | 19.65% | 1737.41ms |
| DeepSeek | 3 | 10.36 | 623 | 139 | 22.31% | 1680.00ms |
| DeepSeek | 4 | 12.46 | 770 | 142 | 18.44% | 1509.42ms |
| DeepSeek | 5 | 10.56 | 618 | 173 | 27.99% | 1515.48ms |
| 豆包 | 1 | 30.84 | 1155 | 643 | 55.67% | 24534.84ms |
| 豆包 | 2 | 31.53 | 1195 | 642 | 53.72% | 27186.13ms |
| 豆包 | 3 | 37.29 | 1398 | 785 | 56.15% | 29360.69ms |
| 豆包 | 4 | 33.30 | 1227 | 668 | 54.44% | 27488.70ms |
| 豆包 | 5 | 33.44 | 1164 | 620 | 53.26% | 27641.89ms |

***

### 鸿蒙端流式回复汇总

| 应用 | 轮数 | 平均 FPS | 平均帧间隔 | 慢帧次数/轮 | 慢帧总耗时/轮 | 平均正式时长 |
|---|---:|---:|---:|---:|---:|---:|
| Uni-AI X 3.1.1 | 5 | 40.96 | 13.33 ms | 73.4 | 2563.86 ms | 20.19 s |
| 豆包 15.5.0 | 5 | 24.18 | 36.47 ms | 732.0 | 19726.75 ms | 44.93 s |

### 鸿蒙端逐轮明细

| 应用 | 轮次 | 正式时长 (s) | 平均 FPS | 平均帧间隔 | 慢帧次数 | 慢帧总耗时 |
|---|---:|---:|---:|---:|---:|---:|
| Uni-AI X | 1 | 22.34 | 43.50 | 12.68 ms | 77 | 2717.38 ms |
| Uni-AI X | 2 | 17.35 | 32.85 | 13.95 ms | 64 | 1822.05 ms |
| Uni-AI X | 3 | 18.36 | 38.71 | 13.77 ms | 68 | 2332.79 ms |
| Uni-AI X | 4 | 18.48 | 40.21 | 13.50 ms | 63 | 2365.54 ms |
| Uni-AI X | 5 | 24.42 | 49.55 | 12.78 ms | 95 | 3581.52 ms |
| 豆包 | 1 | 44.36 | 27.20 | 30.47 ms | 797 | 17281.43 ms |
| 豆包 | 2 | 43.61 | 26.80 | 30.84 ms | 816 | 17472.78 ms |
| 豆包 | 3 | 43.54 | 26.65 | 32.23 ms | 812 | 18589.81 ms |
| 豆包 | 4 | 50.38 | 12.30 | 56.68 ms | 416 | 26826.14 ms |
| 豆包 | 5 | 42.77 | 27.92 | 32.12 ms | 819 | 18463.59 ms |

## uni-ai x的更多介绍

uni-ai x 是 uni-ai 的升级版。uni-ai 基于 uni-app 的前端应用，而 uni-ai x 基于uni-app x 的前端应用，并支持蒸汽模式。

uni-ai x 的跨平台和性能表现建立在uni-app x 蒸汽模式的基础上。蒸汽模式的渲染性能另有评测benchmark：

- [uni-app x 蒸汽模式Android平台性能benchmark](https://doc.dcloud.net.cn/uni-app-x/benchmark/vapor-benchmark-android.html)
- [uni-app x 蒸汽模式iOS平台性能benchmark](https://doc.dcloud.net.cn/uni-app-x/benchmark/vapor-benchmark-ios.html)
- [uni-app x 蒸汽模式鸿蒙平台性能benchmark](https://doc.dcloud.net.cn/uni-app-x/benchmark/vapor-benchmark-harmony.html)

uni-ai x 是开源的，地址在：[https://gitcode.com/dcloud/uni-ai-x](https://gitcode.com/dcloud/uni-ai-x)

欢迎开发者重现实验、共同完善开源项目。

在AI时代，获取和打磨一个重要的基建工具，给你的用户更好的AI交互体验！


## 附录：固定测试提示词

需要一个严格的提示词，确保各家AI返回的markdown内容一致，否则数据没有比较意义。

不同应用使用相同、固定的提示词，要求 AI 原样输出包含所有markdown格式的内容，包括标题、列表、任务复选框、普通及超宽表格、块引用、代码、超链接、数学公式、Mermaid 流程/时序/甘特/状态图、分割线、脚注和自动链接的 Markdown 文档。固定提示词全文见下。


```markdown
【严格指令，禁止任何修改】你必须严格遵守：
1. 禁止输出任何前置介绍、总结、对话文字；
2. 禁止增减、修改、重排、精简下面Markdown文本，一字不差原样输出；
3. 不要用```markdown包裹输出内容；
4. 输出直接从 `# Markdown 全元素渲染测试文档` 开始，直到文档末尾结束，后面不能加任何文字。
待输出固定内容：
# 完整 Markdown 功能演示
---
## 标题（1~6级）
# 一级标题
## 二级标题
### 三级标题
#### 四级标题
##### 五级标题
###### 六级标题
---
## 列表
### 无序列表
- 第一项
- 第二项
	- 嵌套项 1
	- 嵌套项 2
		- 第三层嵌套
- 第三项
### 有序列表
1. 第一步
2. 第二步
	1. 子步骤 A
	2. 子步骤 B
3. 第三步
### 任务复选框列表
- [x] 已完成任务
- [ ] 未完成任务
- [ ] 另一个待办项
- [x] 子任务已完成
---
## 表格
### 普通表格
| 姓名 | 年龄 | 城市 |
|------|------|------|
| 张三 | 25 | 北京 |
| 李四 | 30 | 上海 |
| 王五 | 28 | 深圳 |
### 短表格
| 项目 | 值 |
|------|----|
| 状态 | 正常 |
| 版本 | 1.0.0 |
### 超宽长表格（用于横向滚动测试）
| 列1 | 列2 | 列3 | 列4 | 列5 | 列6 | 列7 | 列8 | 列9 | 列10 | 列11 | 列12 | 列13 | 列14 | 列15 |
|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|------|------|------|------|------|
| 数据1 | 数据2 | 数据3 | 数据4 | 数据5 | 数据6 | 数据7 | 数据8 | 数据9 | 数据10 | 数据11 | 数据12 | 数据13 | 数据14 | 数据15 |
| 更多1 | 更多2 | 更多3 | 更多4 | 更多5 | 更多6 | 更多7 | 更多8 | 更多9 | 更多10 | 更多11 | 更多12 | 更多13 | 更多14 | 更多15 |
---
## 块引用
> 这是一段普通的引用文本。
>
> - 引用中的列表项
> - 另一个列表项
>
> 引用文本的换行继续。
> > 嵌套引用内容
---
## 代码块
### JS 代码示例
\`\`\`javascript
// 一个 JavaScript 示例
function fibonacci(n) {
if (n <= 1) return n;
return fibonacci(n - 1) + fibonacci(n - 2);
}
const result = fibonacci(10);
alert(result);
// 超长单行代码测试
// 下面这行代码非常长，用于测试代码块的横向滚动功能。这里包含了很多内容aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
const longLineDemo = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => x * 2).filter(x => x > 10).reduce((acc, x) => acc + x, 0);
\`\`\`
---
## 超链接
### 外部链接
[访问百度](https://www.baidu.com)
[打开 GitHub](https://github.com)
### 相对路径链接
[查看文档](./docs/readme.md)
[项目主页](../index.html)
---
## 数学公式
### 行内公式
爱因斯坦的质能方程：$E = mc^2$
勾股定理：$a^2 + b^2 = c^2$
### 多行块公式
#### 代数公式
$$
\begin{aligned}
(x + y)^3 &= x^3 + 3x^2y + 3xy^2 + y^3 \
\sum_{i=1}^{n} i &= \frac{n(n+1)}{2}
\end{aligned}
$$
#### 矩阵公式
$$
\mathbf{A} = \begin{pmatrix}
a_{11} & a_{12} & \cdots & a_{1n} \
a_{21} & a_{22} & \cdots & a_{2n} \
\vdots & \vdots & \ddots & \vdots \
a_{m1} & a_{m2} & \cdots & a_{mn}
\end{pmatrix}
$$
#### 化学公式
$$\text{2H}_2 + \text{O}_2 \xrightarrow{\text{点燃}} 2\text{H}_2\text{O}$$
$$\text{C}_6\text{H}_{12}\text{O}_6 + 6\text{O}_2 \rightarrow 6\text{CO}_2 + 6\text{H}_2\text{O}$$
#### 超长公式
$$
\lim_{x \to \infty} \frac{\sum_{k=1}^{n} \left( \frac{1}{k^2} \right) \cdot \sqrt{2\pi} \cdot e^{-\frac{x^2}{2}}}{\sqrt{\int_{-\infty}^{\infty} e^{-x^2} dx}} = \frac{\Gamma(\frac{1}{2})}{2} \cdot \frac{\pi}{\sqrt{2}} \cdot \left( \frac{\partial}{\partial x} \ln(x^2 + y^2) \right)^n \quad \text{其中} \quad n \to \infty
$$
---
## Mermaid 图表
### 第一种：图表（flowchart）
\`\`\`mermaid
graph TD
A[开始] --> B{判断条件}
B -->|是| C[执行操作1]
B -->|否| D[执行操作2]
C --> E[结束]
D --> E
\`\`\`
### 第二种：时序图（sequence）
\`\`\`mermaid
sequenceDiagram
participant A as 客户端
participant B as 服务器
A->>B: 发送请求
B-->>A: 返回响应
A->>A: 处理数据
\`\`\`
### 第三种：甘特图（gantt）
\`\`\`mermaid
gantt
title 项目计划
dateFormat YYYY-MM-DD
section 开发
需求分析 :a1, 2024-01-01, 5d
代码开发 :a2, after a1, 10d
测试 :a3, after a2, 5d
\`\`\`
### 第四种：状态图（state）
\`\`\`mermaid
stateDiagram-v2
[*] --> 待处理
待处理 --> 处理中: 开始
处理中 --> 已完成: 完成
处理中 --> 失败: 出错
失败 --> 待处理: 重试
已完成 --> [*]
\`\`\`
---
## 分割线
### 写法一：三个短横线
---
### 写法二：三个星号
***
### 写法三：三个下划线
___
---
## 其他特殊语法
### 任务列表（完整示例）
- [x] 支持 Markdown 语法
- [x] 支持数学公式
- [x] 支持 Mermaid 插件
- [x] 支持代码高亮
- [ ] 待实现功能
- [ ] 更多功能
### 脚注语法
这里是一个带脚注的文本[^1]，这里还有一个[^2]。
[^1]: 这是第一个脚注的详细说明。
[^2]: 这是第二个脚注的内容。
### 自动邮箱链接
联系邮箱：<example@email.com>
### 自动链接
直接访问 https://www.example.com 可以看到效果。
---
以上就是所有 Markdown 语法的完整演示。✅
```
