# Let Me Simple

## 这是什么

这是当前分支整理后的“最终 simple 版本”说明文档。

这次收尾的目标不是继续保留 `legacy / simple / compare` 三套运行时路径，而是把 Markdown 渲染链路收敛成一条默认、唯一、可维护的 `simple` 流式实现。

## 这版保留了什么

- 单一 `simple` Markdown 流式解析链路
- 流式过程中尽快上屏，而不是等整条消息结束再统一渲染
- 代码块、数学公式、 Mermaid 的 simple 增强渲染
- 当结构列表尚未生成时，先回退显示纯文本，避免流式空白
- Mermaid 图片尚未生成时，先显示代码内容，避免空白图表面板

## 这版移除了什么

- `legacy` 运行时解析链路
- `compare` 对比模式
- 页面内的模式切换入口
- 设置面板里的渲染模式选择器
- FPS 浮层和启动 benchmark 逻辑
- 为模式切换和自动压测服务的额外控制代码

## 现在的核心结构

目标结构已经回到更直接的模型：

`Markdown -> simple parser -> MarkdownElList -> 页面 v-for 渲染`

核心文件：

- `uni_modules/uni-ai-x/sdk/parseMarkdownSimple.uts`
- `uni_modules/uni-ai-x/sdk/requestAiWorker.uts`
- `uni_modules/uni-ai-x/sdk/index.uts`
- `uni_modules/uni-ai-x/components/uni-ai-x-msg/uni-ai-x-msg.uvue`
- `uni_modules/uni-ai-x/components/uni-ai-msg-code/uni-ai-msg-code.uvue`

## 当前实现原则

- 只保留一条默认链路，减少分支判断和状态同步成本
- 保留流式体验，不能为了简化结构而牺牲“边到边渲染”
- 复杂块增强仍然尽量提前执行，但页面层只消费一份最终列表
- 页面不再承担链路选择、对比展示、模式控制等实验性职责

## 当前性能结论

根据这轮已经留档的数据，`simple` 与旧链路总体接近，可以认为性能基本持平。

现阶段更重要的收益不是“明显更快”，而是：

- 结构更简单
- 运行时分支更少
- 更容易维护和继续优化

## 历史数据和实验文件

此前的实验结果、性能截图和压测产物仍然保留在仓库历史以及 `perf-results/` 中，方便追溯。

但当前这版代码本身，已经按“只保留 simple 最终版本”的方向收敛。

## 后续建议

- 如果继续优化，优先在 `parseMarkdownSimple.uts` 内做局部增量优化
- 如果继续做性能验证，建议新建独立脚本或临时分支，不再把多模式逻辑带回主运行时代码
- 如果需要再次做 A/B，对比逻辑建议放在实验分支，而不是产品分支
