# Android 原生 RichText 在 flatten 容器中的圆角裁剪问题

## 结论

问题不是所有原生 RichText 都无法使用圆角，而是 Android 蒸汽模式下，`rich-text mode="native"` 位于带 `flatten` 的父 `view` 中时，不服从父容器的 `border-radius + overflow: hidden` 裁剪。

该问题在直接嵌套 RichText、以及 `ScrollView + 宽 RichText` 两种结构中均可稳定复现。给 ScrollView、RichText 自身和 RichText 节点同时增加圆角 CSS，仍不能裁剪横向滚动视口的右边缘。

## 环境

- HBuilderX：`5.24.2026072917-dev`
- 编译器：uni-app x 5.24，蒸汽模式，字节码视图层
- 平台：Android 真机
- 包名：`io.dcloud.ai.x`
- RichText：`mode="native"`

## 最小复现

复现页面：[`pages/repro-rich-text-radius/index.uvue`](pages/repro-rich-text-radius/index.uvue)

页面已经在 `pages.json` 注册。运行时可临时将该路由放到 `pages` 第一项，或从调试代码导航到：

```text
/pages/repro-rich-text-radius/index
```

页面包含四组相同尺寸对照：

| 用例 | 结构 | Android 结果 |
| --- | --- | --- |
| 1 | 非 flatten 父 View + 普通 View | 正常裁剪 |
| 2 | flatten 父 View + 原生 RichText | RichText 以直角越过父容器圆角 |
| 3 | flatten 父 View + 横向 ScrollView + 宽 RichText | 同样越过父容器圆角 |
| 4 | 用例 3，并给 ScrollView、RichText 和节点增加圆角 CSS | 节点自身左端可变圆，但滚动视口右边仍为直角 |

去掉用例 2-4 父 View 的 `flatten` 后，父容器圆角裁剪立即恢复正常，因此变量已经收敛到 `flatten` 与原生 RichText 的组合。

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
