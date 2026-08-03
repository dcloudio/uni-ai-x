# Rich Text 剩余性能问题报告

## 测试环境与采集方式

| 项目 | 值 |
| --- | --- |
| Android 设备 | Xiaomi `M2102K1AC` |
| 系统 | Android 14，API 34 |
| 屏幕 | `1440x3200`，560 dpi，系统峰值刷新率 120Hz |
| HBuilderX | 历史真实链路数据为 5.23；独立复现为 `5.24.2026072917-dev` |
| 编译模式 | uni-app x 蒸汽模式，视图层字节码；历史真实链路使用自定义基座，独立复现使用标准基座 |
| 应用包名 | 历史真实链路 `io.dcloud.ai.x`；独立复现基座 `io.dcloud.uniappx` |
| Rich Text | `rich-text mode="native"` |

三份复现代码已经迁移为独立工程；主项目不再注册或保留这些页面与专用统计脚本：

| 编号 | 独立工程与代码 | 控制变量 | 当前重复轮次 |
| --- | --- | --- | ---: |
| F01 | [`vapor-richtext-nodes-update-snapshot-copy-bug`](../bug-project/vapor-richtext-nodes-update-snapshot-copy-bug/pages/index/index.uvue)，提交 `89a5cfb` | 同尺寸 Rich Text；只改变是否更新已有 nodes | 5（其中 4 轮有精确阶段边界，另有 5.23 历史对照） |
| F02 | [`vapor-native-richtext-append-jank-bug`](../bug-project/vapor-native-richtext-append-jank-bug/pages/index/index.uvue)，提交 `3e44f36` | 同为每 100ms 追加；对比普通文本 View 与新原生 Rich Text | 3 |
| F03 | [`vapor-svg-image-dynamic-mount-jank-bug`](../bug-project/vapor-svg-image-dynamic-mount-jank-bug/pages/index/index.uvue)，提交 `55cddbe` | 同源 `800x640` SVG；对比预挂载 opacity 与动态创建/销毁 | 2 |

运行和采集方法：

1. 在 HBuilderX 中打开目标独立工程。页面启动后自动预热，并按顺序运行每个 5 秒场景；操作间隔均为 100ms。
2. 使用独立工程内 `TESTING.md` 记录的命令全量编译并运行；每次对照在同一进程、同一页面中连续完成。例如 F01：

```sh
/Applications/HBuilderX-Dev.app/Contents/MacOS/cli launch app-android \
  --project /Users/json/Desktop/code/bug-project/vapor-richtext-nodes-update-snapshot-copy-bug \
  --deviceId 192.168.2.5:5555 --playground standard \
  --native-log true --cleanCache true
```

3. 页面用 `requestAnimationFrame` 在每个阶段内采样。FPS 为采样帧数除以阶段实际时长；同时记录最大帧间隔，以及 `>16.7ms`、`>32ms` 的帧间隔次数。
4. 页面输出 `[RichTextPerfRepro]`、`[NativeViewPerfRepro]` 或 `[SvgImagePerfRepro]` 日志。每个测试阶段均有明确的 `*-start` 和结果日志，原生任务严格在两者之间统计，排除预热、列表清理和阶段切换。
5. Android 原生任务使用以下命令采集：

```sh
adb -s 192.168.2.5:5555 logcat -v threadtime \
  JSConsole:D test:I RichTextJNI:W '*:S'
```

6. 原生任务结果取 `executeRenderTasks` 日志中的 `renderNativeLayoutTasks` 和 `appendViewTasks`；F01 另统计 `Tile RGBA->Bitmap copy` 与 `BuildTileSnapshotList`。所有结果均来自调试基座，应看同轮对照和数量级，不把一次 FPS 小数波动当成确定收益。
7. F01 每轮运行前执行 `adb -s 192.168.2.5:5555 logcat -c`，运行结束后用独立工程中的脚本汇总最近一轮完整对照：

```sh
node ../bug-project/vapor-richtext-nodes-update-snapshot-copy-bug/scripts/android-rich-text-perf-summary.mjs 192.168.2.5:5555
```

脚本只统计 `fixed-start/result`、`updating-start/result` 之间的日志；RGBA 字节数按每条日志的 `width * height * 4` 求和，耗时按日志中的毫秒值求和并取最大值。若 logcat 中有多轮数据，脚本在新的 start 标记处重置，只输出最近一轮，避免跨轮累计。

## 结论

应用侧已优化解析、重复发布和流式阶段的超宽临时内容，但仍无法消除卡顿。剩余瓶颈集中在框架原生视图层，主要是 Rich Text 更新后的全量位图快照，以及主线程布局和 View 追加。

## 1. Rich Text nodes 更新触发高频全量位图拷贝

### 现象

持续修改同一个原生 Rich Text 的 `nodes` 时，帧率明显下降；内容宽度越大，问题越严重。

复现步骤：

1. 使用 HBuilderX 打开 F01 独立工程，并运行到 Android 标准调试基座。
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

补齐 `fixed-start`、`updating-start` 后连续四轮精确划窗复测：

| 阶段 | 指标 | 第 1 轮 | 第 2 轮 | 第 3 轮 | 第 4 轮 |
| --- | --- | ---: | ---: | ---: | ---: |
| fixed | FPS | 114.7 | 114.3 | 114.5 | 113.5 |
| fixed | 最大帧间隔 | 33.2ms | 16.6ms | 24.9ms | 24.9ms |
| fixed | `>16.7ms` / `>32ms` | 1 / 1 | 0 / 0 | 2 / 0 | 2 / 0 |
| updating | FPS | 60.1 | 52.5 | 54.3 | 52.2 |
| updating | 最大帧间隔 | 66.4ms | 74.7ms | 66.5ms | 74.7ms |
| updating | `>16.7ms` / `>32ms` | 51 / 49 | 53 / 50 | 55 / 50 | 54 / 50 |

阶段内原生 Rich Text 日志汇总：

| 阶段 | 指标 | 第 1 轮 | 第 2 轮 | 第 3 轮 | 第 4 轮 |
| --- | --- | ---: | ---: | ---: | ---: |
| fixed | RGBA 拷贝日志 / 快照日志 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| updating | RGBA 拷贝日志 / 快照日志 | 196 / 98 | 196 / 98 | 196 / 98 | 196 / 98 |
| updating | RGBA 拷贝总字节 | 未保留原始日志 | 4,368,072,072 B（4.068 GiB） | 4,368,072,072 B（4.068 GiB） | 4,368,072,072 B（4.068 GiB） |
| updating | RGBA 拷贝累计 / 最大耗时 | 未保留原始日志 | 1559.24ms / 17.30ms | 1546.82ms / 14.78ms | 1554.05ms / 14.74ms |
| updating | 快照累计 / 最大耗时 | 未保留原始日志 | 1604.81ms / 22.97ms | 1601.21ms / 21.62ms | 1605.63ms / 20.85ms |

第 1 轮在汇总脚本落盘前清空了 logcat，只保留了解析器实时输出的次数，故不补造累计耗时和字节数；第 2~4 轮均由仓库内同一脚本直接汇总。每次更新会生成两个 tile，尺寸为 `13377x595` 和 `13377x238`；98 组 tile 的理论 RGBA 字节数与日志汇总结果一致。

### 如何得出结论

两组测试使用相同尺寸的超宽 Rich Text。内容固定时没有重复拷贝，只有 nodes 变化时出现高频快照和帧率下降，因此触发点是 Rich Text 内容更新，不是页面中存在 Rich Text，也不是追加普通兄弟节点。

### 框架侧建议

- 对 nodes 做增量差分，只重新排版和栅格化变化区域。
- 复用未变化的段落、tile、Bitmap 或纹理。
- 超宽内容按可见区域生成 tile，避免每次复制完整宽度位图。

## 2. 原生布局和 View 追加仍产生主线程长任务

独立复现页：[`vapor-native-richtext-append-jank-bug/pages/index/index.uvue`](../bug-project/vapor-native-richtext-append-jank-bug/pages/index/index.uvue)。页面自动对照“每 100ms 追加普通文本 View”和“每 100ms 追加一个全新的原生 Rich Text”。已有节点不会更新，且不经过联网和 Markdown 解析。

### 现象

真实 Markdown 流式渲染期间仍会出现 30~90ms 的卡顿尖峰。

复现步骤：

1. 使用 HBuilderX 打开 F02 独立工程，并运行到 Android 标准调试基座。
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

独立复现页：[`vapor-svg-image-dynamic-mount-jank-bug/pages/index/index.uvue`](../bug-project/vapor-svg-image-dynamic-mount-jank-bug/pages/index/index.uvue)。页面使用同一张 `800x640` SVG 自动对照“已加载 Image 只切换 opacity”和“同源 Image 动态创建/销毁”，不经过联网、Markdown 解析或主题切换。

### 现象

流程图首次显示或滚动进入可见区域时，仍可能短暂停顿。

复现步骤：

1. 使用 HBuilderX 打开 F03 独立工程，并运行到 Android 标准调试基座。
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
