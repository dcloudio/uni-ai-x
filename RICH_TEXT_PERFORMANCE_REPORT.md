# Rich Text 剩余性能问题报告

测试环境：Android 真机、HBuilderX 5.23、uni-app x 蒸汽模式、`rich-text mode="native"`。

最小复现页：[`pages/repro-rich-text-performance/index.uvue`](pages/repro-rich-text-performance/index.uvue)，路由为 `/pages/repro-rich-text-performance/index`。页面自动依次运行“固定 3822px Rich Text + 每 100ms 追加兄弟 View”和“每 100ms 更新同一 Rich Text nodes”两个 5 秒场景，并输出 FPS、最大帧间隔和慢帧数。

## 结论

应用侧已优化解析、重复发布和流式阶段的超宽临时内容，但仍无法消除卡顿。剩余瓶颈集中在框架原生视图层，主要是 Rich Text 更新后的全量位图快照，以及主线程布局和 View 追加。

## 1. Rich Text nodes 更新触发高频全量位图拷贝

### 现象

持续修改同一个原生 Rich Text 的 `nodes` 时，帧率明显下降；内容宽度越大，问题越严重。

复现步骤：

1. 将最小复现路由临时放到 `pages.json` 第一项，使用 Android 蒸汽模式运行。
2. 等待页面自动完成两个场景，或点击“重跑对照”。
3. 对比页面结果，并在日志中检索 `[RichTextPerfRepro]`、`Tile RGBA->Bitmap copy` 和 `BuildTileSnapshotList`。

### 证据

| 测试场景 | FPS | 最大帧间隔 | 位图拷贝 |
| --- | ---: | ---: | ---: |
| Rich Text 内容固定，只追加兄弟 View | 116.8 | 16.61ms | 0 次 |
| 持续修改 Rich Text nodes | 69.1 | 66.35ms | 91 次 |

修改 nodes 的 4.57 秒内：

- `RGBA -> Bitmap` 拷贝累计约 625MB。
- `BuildTileSnapshotList` 日志累计约 444.54ms。
- 单次快照最高 11.17ms。

HBuilderX 5.24（`5.24.2026072917-dev`）同机最小复现复测：

| 自动对照场景（各 5 秒） | 操作次数 | FPS | 最大帧间隔 | `>16.7ms` | `>32ms` |
| --- | ---: | ---: | ---: | ---: | ---: |
| nodes 固定，每 100ms 追加兄弟 View | 49 | 114.4 | 24.9ms | 2 | 0 |
| 每 100ms 更新同一 Rich Text nodes | 49 | 54.3 | 74.7ms | 54 | 51 |

两阶段由同一页面连续执行，Rich Text 尺寸和测试时长一致。更新阶段的 Android 日志同步出现 `Tile RGBA->Bitmap copy` 和 `BuildTileSnapshotList`，可稳定复现 nodes 更新导致的快照与掉帧问题。

### 如何得出结论

两组测试使用相同尺寸的超宽 Rich Text。内容固定时没有重复拷贝，只有 nodes 变化时出现高频快照和帧率下降，因此触发点是 Rich Text 内容更新，不是页面中存在 Rich Text，也不是追加普通兄弟节点。

### 框架侧建议

- 对 nodes 做增量差分，只重新排版和栅格化变化区域。
- 复用未变化的段落、tile、Bitmap 或纹理。
- 超宽内容按可见区域生成 tile，避免每次复制完整宽度位图。

## 2. 原生布局和 View 追加仍产生主线程长任务

### 现象

真实 Markdown 流式渲染期间仍会出现 30~90ms 的卡顿尖峰。

### 证据

排除 398ms 和 773ms 的页面冷启动任务后，20.2 秒流式阶段的数据为：

| 指标 | 结果 |
| --- | ---: |
| `executeRenderTasks` | 276 次，累计 1208ms，最大 90ms |
| `renderNativeLayoutTasks` | 累计 619.17ms，最大 69.11ms |
| `appendViewTasks` | 累计 498.64ms，最大 40.65ms |

同一阶段 CMark 共调用 62 次，全部位于后台线程，累计 41ms、最大 7ms。

### 如何得出结论

CMark 没有占用 UI 主线程，耗时也远低于布局和追加任务；卡顿时间点与原生渲染队列中的长任务一致。因此当前主要瓶颈是框架视图层，而不是 Markdown 解析。

### 框架侧建议

- 进一步拆分 Rich Text measure、layout、栅格化和 View 创建耗时。
- 对可拆分的布局、绑定和追加任务进行增量处理或分帧提交。
- 避免一次主线程任务超过 8.3ms（120Hz）或 16.7ms（60Hz）。

## 3. 大图首次显示仍可能发生纹理上传尖峰

### 现象

流程图首次显示或滚动进入可见区域时，仍可能短暂停顿。

### 证据

| 图片处理方式 | 渲染任务耗时 | View 追加耗时 |
| --- | ---: | ---: |
| 图片预挂载后切换 opacity | 约 1ms | 接近 0 |
| 动态插入 800x640 图片 | 约 21ms | 13.87ms |

真实页面 `dumpsys gfxinfo` 还记录了 41 次 slow bitmap upload。常态 GPU 90/95 分位约 5/8ms，因此不是持续 GPU 算力不足，更可能是首次上传或 View 重绑定产生的离散尖峰。

### 如何得出结论

预挂载和动态插入使用同一图片，主要差异是 View 创建、解码和纹理准备时机。动态插入明显更慢，说明图片首次挂载链路存在额外成本。由于当前日志不能继续区分解码、上传和列表回收，这一项仍需框架内部 Trace 最终确认。

### 框架侧建议

- 缓存 SVG data URL 对应的 Bitmap 和 GPU 纹理。
- 检查 `list-view` 离屏和回屏时是否重复解码或上传。
- 提供正式的图片预解码、预上传能力。

## 优先级

1. P0：Rich Text nodes 增量更新，消除全量位图拷贝。
2. P0：拆分原生布局和 View 追加的主线程长任务。
3. P1：优化大图首次显示及列表回屏时的纹理复用。
