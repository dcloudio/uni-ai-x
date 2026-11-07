# uni-ai-md 原生桥接层（Android / HarmonyOS / iOS）

本目录保存 `uni_modules/uni-ai-md` UTS 插件所用的原生桥接层源码与构建脚本，接入方式
对齐上游 uni-ai-md 仓库的 `demo/uni-app-x/native`：桥接层源码在本项目内维护，构建产物
再落到 UTS 插件目录，避免只把预编译产物拷进项目、无法回溯来源。

## 目录结构

```text
native/
├── android/
│   ├── uni_ai_md_bridge_jni.cpp    # Android JNI 桥接源码
│   └── CMakeLists.txt
├── harmony/
│   ├── uni_ai_md_bridge.cpp/.h     # HarmonyOS N-API 桥接源码
│   ├── CMakeLists.txt
│   └── package/                    # HAR 骨架（oh-package.json5 / module.json / index.ets）
├── ios/
│   ├── uni_ai_md_bridge.mm         # iOS C/OC++ 桥接源码（CoreText 字形提供者）
│   ├── UniAiMdBridge.h
│   └── module.modulemap
├── include/                        # uni-ai-md 公开头文件快照（构建准备产物，不提交）
├── prebuilt/                       # libuni-ai-md.so（构建准备产物，不提交）
│   ├── android-arm64-v8a/
│   ├── arm64-v8a/
│   └── x86_64/
├── prepare-lib.ps1                 # 同步头文件并复制 libuni-ai-md.so（Android / HarmonyOS）
├── sync-include.ps1                # prepare-lib.ps1 调用的头文件同步脚本
├── build-harmony.ps1               # 编译桥接库并打包 HAR
├── build-android.ps1               # 编译 JNI 桥接库并复制到 UTS 插件
└── build-ios.sh                    # 编译 iOS framework 并打包 xcframework（macOS）
```

Android / HarmonyOS 的桥接库由本目录的 C++ 源码编译，`libuni-ai-md.so`（引擎）与公开
头文件来自 uni-ai-md 源码仓库，属于构建准备产物，不入库。

iOS 桥接库不能脱离引擎单独编译：iOS 侧把 core、render、math、mermaid 与桥接代码静态
链进同一个 `UniAiMdBridge.framework`，因此 `build-ios.sh` 以 uni-ai-md 源码仓库为构建
根目录。本目录 `ios/` 保存桥接源码快照，与仓库 `demo/uni-app-x/native/ios/` 保持一致，
便于回溯来源。

## 图表背景色

mermaid（流程图 / 时序图 / 甘特图 / 状态图）的 SVG 背景在桥接层创建 session 时设置：
`mermaid_options.background_color` 为亮灰色 `#f5f5f5`，插件会在场景最底层铺一层
同色矩形；留空则保持透明。两处源码保持一致：

- `android/uni_ai_md_bridge_jni.cpp`
- `harmony/uni_ai_md_bridge.cpp`

## 构建准备

需要本机存在 uni-ai-md 源码仓库，并且必须通过 `-RepoRoot` 或 `UNI_AI_MD_REPO`
环境变量明确指定仓库根目录；未指定时脚本报错退出。

### HarmonyOS

```powershell
# 在 uni-ai-md 仓库根目录构建 arm64-v8a 与 x86_64 产物
pwsh -File scripts/build-ohos.ps1
# 同步头文件并把两种 ABI 的 libuni-ai-md.so 复制到 native/prebuilt/
pwsh -File native/prepare-lib.ps1 -RepoRoot <uni-ai-md 仓库根目录>
# 编译桥接库并打包 HAR 到 uni_modules/uni-ai-md/utssdk/app-harmony/libs/uni-ai-md.har
pwsh -File native/build-harmony.ps1
```

### Android

```powershell
# 在 uni-ai-md 仓库根目录构建 arm64-v8a 产物（需要 ANDROID_NDK_HOME）
pwsh -File scripts/build-android.ps1
# 同步头文件并复制 libuni-ai-md.so 到 native/prebuilt/android-arm64-v8a/
pwsh -File native/prepare-lib.ps1 -Platform android -RepoRoot <uni-ai-md 仓库根目录>
# 编译 JNI 桥接库并把 libuni-ai-md_bridge.so + libuni-ai-md.so 复制到 UTS 插件
pwsh -File native/build-android.ps1
```

Android 产物只提供 arm64-v8a；需要 arm64-v8a 设备（标准基座自带 arm64-v8a 运行库），
并使用自定义基座运行。

### iOS

iOS 构建必须在 macOS 上进行，且需要 Xcode 命令行工具与 CMake 3.16+（`build-ios.sh`
使用 CMake 默认生成器，不依赖 Ninja）：

```bash
# 初始化子模块（cmark-gfm / freetype）
git submodule update --init --recursive
# 编译真机 arm64 与模拟器 arm64/x86_64 两套 framework，并打包为 xcframework 到 UTS 插件
bash native/build-ios.sh -RepoRoot <uni-ai-md 仓库根目录>
# 或
UNI_AI_MD_REPO=<uni-ai-md 仓库根目录> bash native/build-ios.sh
```

产物落到 `uni_modules/uni-ai-md/utssdk/app-ios/Frameworks/UniAiMdBridge.xcframework`。
与 Android/HarmonyOS 的产物一样，该 xcframework 随插件入库，供自定义基座直接引用。
由于体积超过远端单文件上限，该 xcframework 使用 **Git LFS** 存储：克隆后请先执行
`git lfs install`（拉取时确保已下载 LFS 对象），否则 `utssdk/app-ios/Frameworks` 下只会是
指针文件。构建成功后需要重新制作包含该 framework 的 iOS 自定义基座。
