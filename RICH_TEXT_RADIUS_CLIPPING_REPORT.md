# Android 原生 RichText 在 flatten 容器中的圆角裁剪问题

## 结论

问题不是所有原生 RichText 都无法使用圆角，而是 Android 蒸汽模式下，`rich-text mode="native"` 位于带 `flatten` 的父 `view` 中时，不服从父容器的 `border-radius + overflow: hidden` 裁剪。

该问题在直接嵌套 RichText、以及 `ScrollView + 宽 RichText` 两种结构中均可稳定复现。给 ScrollView、RichText 自身和 RichText 节点同时增加圆角 CSS，仍不能裁剪横向滚动视口的右边缘。

## 环境

- HBuilderX：`5.24.2026072917-dev`
- 编译器：uni-app x 5.24，蒸汽模式，字节码视图层
- 设备：Xiaomi `M2102K1AC`
- 系统：Android 14，API 34
- 屏幕：`1440x3200`，560 dpi
- 基座包名：`io.dcloud.uniappx`
- 基座：标准调试基座
- RichText：`mode="native"`

## 最小复现

最小复现、Issue 文案和原始证据已经迁移到独立工程；主项目不再注册或保留该页面：

- 工程：[`vapor-richtext-flatten-clip-bug`](../bug-project/vapor-richtext-flatten-clip-bug/README.md)，提交 `0b657a9`
- 页面：[`pages/index/index.uvue`](../bug-project/vapor-richtext-flatten-clip-bug/pages/index/index.uvue)
- Issue 文案：[`ISSUE.md`](../bug-project/vapor-richtext-flatten-clip-bug/ISSUE.md)
- 原始截图：[`android-richtext-flatten-clip.png`](../bug-project/vapor-richtext-flatten-clip-bug/test-results/android-richtext-flatten-clip.png)

### 测试方法

1. 使用 HBuilderX 打开独立工程。
2. 使用 Android 标准调试基座全量编译并运行：

```sh
/Applications/HBuilderX-Dev.app/Contents/MacOS/cli launch app-android \
  --project /Users/json/Desktop/code/bug-project/vapor-richtext-flatten-clip-bug \
  --deviceId fd07f76f --playground standard \
  --native-log true --cleanCache true
```

3. 页面稳定显示五个用例后采集原始设备截图：

```sh
adb -s fd07f76f exec-out screencap -p \
  > test-results/android-richtext-flatten-clip.png
```

4. 检查进程仍存活，并过滤 `AndroidRuntime`、`libc`、`DEBUG`、`CSSParser` 的错误日志。

### 测试结果

两组配对用例分别保持 nodes、尺寸、颜色、圆角和层级结构一致，只改变父容器是否有 `flatten`：

| 用例 | 结构 | Android 结果 |
| --- | --- | --- |
| 1 | 非 flatten 父 View + 原生 RichText | 正常，四角均按绿色父边界裁剪 |
| 2 | flatten 父 View + 原生 RichText | 失败，红色 RichText 以直角越过上下边界 |
| 3 | 非 flatten 父 View + 横向 ScrollView + 宽 RichText | 正常，滚动视口四角均被裁剪 |
| 4 | flatten 父 View + 横向 ScrollView + 宽 RichText | 失败，红色内容以直角越过上下边界 |
| 5 | 用例 4，并给 ScrollView、RichText 和节点增加圆角 CSS | 失败，子级圆角不能恢复父视口裁剪 |

量化结果为：2 个非 flatten 对照全部正确，3 个 flatten 用例全部失败。用例 1/2 和用例 3/4 均只改变 `flatten`，因此变量已经收敛到 `flatten` 与原生 RichText 的组合；用例 5 进一步排除了“把 CSS 圆角下放到子级即可修复”的解释。

独立工程截图大小为 173,170 字节，SHA-256：

```text
1d8b0e46b10d179d1b8df9413c9997b6ec52ddeb6011369497a3fd0171f953e3
```

本轮 clean build 成功，截图后应用进程 `26307` 仍存活；上述四类错误日志过滤结果均为 0 条。

![Android flatten 与原生 RichText 圆角裁剪配对结果](../bug-project/vapor-richtext-flatten-clip-bug/test-results/android-richtext-flatten-clip.png)

## 期望结果

带 `flatten` 的父 View 设置 `border-radius` 和 `overflow: hidden` 后，应与非 flatten View 一样裁剪原生 RichText 子内容；如果该组合设计上不支持，应在组件文档中明确能力边界和推荐替代方案。

## 实际影响

表格和代码块都使用原生 RichText，且为了减少原生 View 层级使用了 `flatten`。两者还需要横向 ScrollView，因此不能简单把圆角下放到 RichText 节点：宽内容的右边缘在视口之外，节点圆角不能充当滚动视口圆角。

当前应用层处理：

- 表格和代码块继续使用直角外观，避免内容顶出圆角。
- 暂不通过移除 `flatten` 恢复圆角，避免在已有 RichText 主线程性能问题下增加原生 View 层级。
- 框架修复或确认替代方案后，再恢复圆角并回归短表、宽表和代码块。

## 建议框架排查

1. 检查 flatten 合并后父 View 的圆角裁剪路径是否丢失。
2. 检查原生 RichText 独立绘制层是否绕过 flatten 父节点的 clip path。
3. 覆盖直接 RichText、ScrollView 内宽 RichText、横向滚动到中间和末尾四个场景。
4. 明确 RichText 节点 `attrs.style` 的圆角与组件/父容器裁剪的职责边界。
