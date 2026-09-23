# 清理 Android 和鸿蒙的 cmark 依赖

修改日期：2026-09-23

## 一、背景与目标

Android/鸿蒙的 Markdown 解析已由 libmark 流式解析接管。目标：

- 清理项目代码（Worker、UI 组件）中 Android/鸿蒙对 cmark 的引用与类型依赖
- 移除 `uni-cmark` 插件在 Android/鸿蒙平台的支持，使这两个平台的打包产物不再包含 cmark 原生库
- iOS/Web/微信小程序继续使用 `uni-cmark`，行为不变

## 二、实施方案

### 2.1 Worker 清理（`workers/aiRequestWorkerTask.uts`）

- 删除 `APP-ANDROID` / `APP-HARMONY` 的 cmark import（iOS/Web/微信小程序的保留）
- `publishSnapshot` 中 cmark 分支的条件编译由 `APP-ANDROID || APP-IOS || WEB || MP-WEIXIN || APP-HARMONY` 收窄为 `APP-IOS || WEB || MP-WEIXIN`
- 清理 catch 块中的鸿蒙专用分叉（该段代码不再为鸿蒙编译，统一走通用错误消息）

### 2.2 uni-cmark 插件调整

- 删除 Android 运行时实现 `utssdk/app-android/`（`libcmarkhtml.so` 与 Kotlin 桥）及构建脚本 `native/build-android.sh`
- 删除鸿蒙运行时实现中的 `cmark.har` 与 N-API 桥（`native/harmony/`、`native/build-harmony.sh`）
- 鸿蒙保留最小桩模块 `utssdk/app-harmony/index.uts`：不加载 cmark，`isMd2htmlAvailable()` 返回 false。原因：`uni-cmark` 仍被 iOS/Web/微信小程序的依赖链声明，编译器的鸿蒙工程生成要求被声明的依赖必须有对应平台模块，否则 ohpm 安装失败
- `native/CMakeLists.txt` 移除 Android 专属链接配置
- `package.json` 平台声明更新：uni-app-x 的 Android/鸿蒙标记为不支持
- 插件 README 尾部追加调整记录

### 2.3 依赖声明保留

`uni-ai-worker` / `uni-ai-worker-runtime` 继续声明依赖 `uni-cmark`：iOS/Web/微信小程序的插件收集由依赖声明驱动，移除声明会导致这些平台缺失 cmark 实现。

## 三、验证结果

| 平台 / 项 | 结果 |
| --- | --- |
| Android | 编译通过；`dist/dev/app-android` 全域无 cmark，产物不含 cmark 原生库 |
| 鸿蒙 | 全新编译 + HAP 制作成功；HAP 无 `libcmark.so` / `cmark.har`，体积 67.55MB → 67.06MB（仅剩约 5KB 类型与元数据文件） |
| Web | 编译通过 |
| 微信小程序 | 编译通过 |
| iOS | Windows 本机编译通过（UTS/类型阶段）；cmark 实现保留，云端打包行为需在 mac/云打包时最终确认 |

## 四、后续注意

- 鸿蒙的 `utssdk/app-harmony/index.uts` 桩模块仅用于满足编译器工程依赖要求，接口明确不可用；若后续工具链支持按平台声明依赖，可整体删除
- iOS/Web/微信小程序继续使用 `uni-cmark` 的对应平台实现与构建脚本
