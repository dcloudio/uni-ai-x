# Let Me Simple

## 这是什么

这是当前分支整理后的“最终 simple 版本”说明文档。

这次收尾的目标不是继续保留 `legacy / simple / compare` 三套运行时路径，而是把 Markdown 渲染链路收敛成一条默认、唯一、可维护的 `simple` 流式实现。

## 这版保留了什么

- 单一 `simple` Markdown 流式解析链路
- 流式过程中尽快上屏，而不是等整条消息结束再统一渲染
- 简单正文通过 `rich-text mode="native"` 渲染，复杂块通过原生组件与 RichText 组合
- 当结构列表尚未生成时，先回退显示纯文本，避免流式空白
- Mermaid 始终提供“流程图/代码”两个选项卡，图片尚未生成时默认显示代码

## 这版移除了什么

- `legacy` 运行时解析链路
- `compare` 对比模式
- 页面内的模式切换入口
- 设置面板里的渲染模式选择器
- FPS 浮层和启动 benchmark 逻辑
- 为模式切换和自动压测服务的额外控制代码

## 现在的核心结构

目标结构已经回到更直接的模型：

`Markdown -> simple parser -> MarkdownElList -> block dispatcher -> RichText / native wrapper / native image`

核心文件：

- `uni_modules/uni-ai-x/sdk/parseMarkdown.uts`
- `uni_modules/uni-ai-x/sdk/requestAiRunner.uts`
- `uni_modules/uni-ai-x/sdk/index.uts`
- `uni_modules/uni-ai-x/sdk/markdown-rich-text.uts`
- `uni_modules/uni-ai-x/sdk/markdown-render-blocks.uts`
- `uni_modules/uni-ai-x/components/uni-ai-md-renderer/uni-ai-md-renderer.uvue`
- `uni_modules/uni-ai-x/components/uni-ai-md-rich-text/uni-ai-md-rich-text.uvue`
- `uni_modules/uni-ai-x/components/uni-ai-msg-code/uni-ai-msg-code.uvue`
- `uni_modules/uni-ai-x/components/uni-ai-msg-table/uni-ai-msg-table.uvue`
- `uni_modules/uni-ai-x/components/uni-ai-x-msg/uni-ai-x-msg.uvue`

## 当前实现原则

- 只保留一条默认链路，减少分支判断和状态同步成本
- 保留流式体验，不能为了简化结构而牺牲“边到边渲染”
- 页面层只消费一份最终列表，展示层按块类型显式分发
- 页面不再承担链路选择、对比展示、模式控制等实验性职责
- RichText 只排版内容；横向滚动、复制、选项卡、加载状态和图片预览由原生组件负责
- 代码和表格使用“原生外壳 + RichText 内容”，公式和 Mermaid 使用原生 `image` 展示自包含 SVG
- 公式 SVG 到达后立即替换源码并按自然尺寸横向滚动；Mermaid SVG 到达后自动切到流程图一次，之后保留用户手动选择

## 当前性能结论

根据这轮已经留档的数据，`simple` 与旧链路总体接近，可以认为性能基本持平。

现阶段更重要的收益不是“明显更快”，而是：

- 结构更简单
- 运行时分支更少
- 更容易维护和继续优化

## 历史数据和实验文件

此前的实验结果、性能截图和压测产物只保留在仓库历史中，避免把调试产物继续带入开源源码。

但当前这版代码本身，已经按“只保留 simple 最终版本”的方向收敛。

## 后续建议

- 如果继续优化，优先在 `parseMarkdown.uts` 内做局部增量优化
- 如果继续做性能验证，建议新建独立脚本或临时分支，不再把多模式逻辑带回主运行时代码
- 如果需要再次做 A/B，对比逻辑建议放在实验分支，而不是产品分支
