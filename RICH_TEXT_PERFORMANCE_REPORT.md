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

最小复现页：[`pages/repro-native-view-performance/index.uvue`](pages/repro-native-view-performance/index.uvue)，路由为 `/pages/repro-native-view-performance/index`。页面自动对照“每 100ms 追加普通文本 View”和“每 100ms 追加一个全新的原生 Rich Text”。已有节点不会更新，且不经过联网和 Markdown 解析。

### 现象

真实 Markdown 流式渲染期间仍会出现 30~90ms 的卡顿尖峰。

复现步骤：

1. 将最小复现路由临时放到 `pages.json` 第一项，使用 Android 蒸汽模式运行。
2. 等待两个 5 秒场景自动完成，或点击“重跑对照”。
3. 对比页面 FPS 和慢帧数，并在日志中检索 `[NativeViewPerfRepro]`、`executeRenderTasks`、`renderNativeLayoutTasks` 和 `appendViewTasks`。

### 证据

排除 398ms 和 773ms 的页面冷启动任务后，20.2 秒流式阶段的数据为：

| 指标 | 结果 |
| --- | ---: |
| `executeRenderTasks` | 276 次，累计 1208ms，最大 90ms |
| `renderNativeLayoutTasks` | 累计 619.17ms，最大 69.11ms |
| `appendViewTasks` | 累计 498.64ms，最大 40.65ms |

同一阶段 CMark 共调用 62 次，全部位于后台线程，累计 41ms、最大 7ms。

HBuilderX 5.24（`5.24.2026072917-dev`）同机最小复现连续三轮结果：

| 自动对照场景（各 5 秒） | FPS（第 1 / 2 / 3 轮） | 最大帧间隔 | `>32ms` 慢帧 |
| --- | ---: | ---: | ---: |
| 追加普通文本 View | 115.1 / 113.8 / 115.7 | 24.9ms / 24.9ms / 16.6ms | 0 / 0 / 0 |
| 追加全新原生 Rich Text | 88.7 / 85.3 / 89.1 | 41.5ms / 41.5ms / 49.8ms | 7 / 17 / 6 |

第 3 轮使用页面新增的 `plain-start`、`native-start` 日志严格划分阶段，排除了切换阶段清空列表的任务：

| 第 3 轮原生任务（各追加 49 次） | 普通文本 View | 原生 Rich Text |
| --- | ---: | ---: |
| `appendViewTasks` 最大值 | 2.15ms | 37.89ms |
| `renderNativeLayoutTasks` 最大值 | 5.19ms | 5.11ms |

Rich Text 阶段的 `appendViewTasks` 最大值为 37.89ms，与真实 Markdown 链路的 40.65ms 接近，说明原生 Rich Text View 的创建与追加可以独立触发主线程长任务。隔离页的布局最大值与普通 View 对照接近，没有复现真实链路的 69.11ms；该布局尖峰仍需在真实页面中由框架 Trace 继续拆分，不能由本最小复现单独归因。

### 如何得出结论

CMark 没有占用 UI 主线程，耗时也远低于布局和追加任务；卡顿时间点与原生渲染队列中的长任务一致。最小复现进一步排除了联网、Markdown 解析和已有 nodes 更新，并稳定重现约 40ms 的 Rich Text View 追加。因此追加瓶颈位于框架视图层；真实链路中的布局尖峰还需框架内部 Trace 最终确认。

### 框架侧建议

- 进一步拆分 Rich Text measure、layout、栅格化和 View 创建耗时。
- 对可拆分的布局、绑定和追加任务进行增量处理或分帧提交。
- 避免一次主线程任务超过 8.3ms（120Hz）或 16.7ms（60Hz）。

## 3. 大图首次显示仍可能发生纹理上传尖峰

最小复现页：[`pages/repro-svg-image-performance/index.uvue`](pages/repro-svg-image-performance/index.uvue)，路由为 `/pages/repro-svg-image-performance/index`。页面使用同一张 `800x640` SVG 自动对照“已加载 Image 只切换 opacity”和“同源 Image 动态创建/销毁”，不经过联网、Markdown 解析或主题切换。

### 现象

流程图首次显示或滚动进入可见区域时，仍可能短暂停顿。

复现步骤：

1. 将最小复现路由临时放到 `pages.json` 第一项，使用 Android 蒸汽模式运行。
2. 等待 SVG 预加载和两个 5 秒场景自动完成，或点击“重跑对照”。
3. 对比页面 FPS、慢帧和动态 Image 的 `load` 次数，并在日志中检索 `[SvgImagePerfRepro]`、`executeRenderTasks` 和 `appendViewTasks`。

### 证据

| 图片处理方式 | 渲染任务耗时 | View 追加耗时 |
| --- | ---: | ---: |
| 图片预挂载后切换 opacity | 约 1ms | 接近 0 |
| 动态插入 800x640 图片 | 约 21ms | 13.87ms |

HBuilderX 5.24（`5.24.2026072917-dev`）同机最小复现连续两轮结果：

| 自动对照场景（各 5 秒） | FPS（第 1 / 2 轮） | 最大帧间隔 | `>32ms` 慢帧 |
| --- | ---: | ---: | ---: |
| 已加载 Image 切换 opacity | 120.7 / 120.7 | 8.3ms / 8.3ms | 0 / 0 |
| 同源 Image 动态创建/销毁 | 102.1 / 101.3 | 49.8ms / 58.1ms | 25 / 25 |

| 原生任务（第 1 / 2 轮） | opacity 切换 | 动态创建/销毁 |
| --- | ---: | ---: |
| `executeRenderTasks` 最大值 | 1ms / 2ms | 47ms / 55ms |
| `appendViewTasks` 最大值 | 0 / 0 | 43.22ms / 50.82ms |
| 动态挂载数 / `load` 回调数 | - | 25 / 25（两轮均相同） |

两阶段使用完全相同的 SVG data URL 和固定 `800x640` Image 尺寸。动态阶段每次创建 Image 都触发 `load` 回调，并稳定出现约 43~51ms 的 View 追加长任务；预挂载后只改 opacity 没有 View 追加任务。该对照证明预挂载规避有效，也证明同源图片重建仍会重复进入 Image 加载生命周期，但 `load` 回调本身不能证明是否重复解码或上传纹理，后两项仍需框架内部 Trace 确认。

真实页面 `dumpsys gfxinfo` 还记录了 41 次 slow bitmap upload。常态 GPU 90/95 分位约 5/8ms，因此不是持续 GPU 算力不足，更可能是首次上传或 View 重绑定产生的离散尖峰。

### 如何得出结论

预挂载和动态插入使用同一图片，主要差异是 View 创建和 Image 加载生命周期。动态插入明显更慢，说明图片首次挂载链路存在额外成本。结合真实页面的 slow bitmap upload，解码、上传或列表回收仍是合理排查方向，但当前日志不能区分三者，这一项仍需框架内部 Trace 最终确认。

### 框架侧建议

- 缓存 SVG data URL 对应的 Bitmap 和 GPU 纹理。
- 检查 `list-view` 离屏和回屏时是否重复解码或上传。
- 提供正式的图片预解码、预上传能力。

## 优先级

1. P0：Rich Text nodes 增量更新，消除全量位图拷贝。
2. P0：拆分原生布局和 View 追加的主线程长任务。
3. P1：优化大图首次显示及列表回屏时的纹理复用。
