# uni-ai-md 原生桥接层（Android / HarmonyOS）

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
├── include/                        # uni-ai-md 公开头文件快照（构建准备产物，不提交）
├── prebuilt/                       # libuni-ai-md.so（构建准备产物，不提交）
│   ├── android-arm64-v8a/
│   ├── arm64-v8a/
│   └── x86_64/
├── prepare-lib.ps1                 # 同步头文件并复制 libuni-ai-md.so
├── sync-include.ps1                # prepare-lib.ps1 调用的头文件同步脚本
├── build-harmony.ps1               # 编译桥接库并打包 HAR
└── build-android.ps1               # 编译 JNI 桥接库并复制到 UTS 插件
```

桥接库由本目录的 C++ 源码编译，`libuni-ai-md.so`（引擎）与公开头文件来自 uni-ai-md
源码仓库，属于构建准备产物，不入库。

## 图表背景色

mermaid（流程图 / 时序图 / 甘特图 / 状态图）的 SVG 背景在桥接层创建 session 时设置：
`mermaid_options.background_color` 为亮灰色 `#f5f5f5`，插件会在场景最底层铺一层
同色矩形；留空则保持透明。两处源码保持一致：

- `android/uni_ai_md_bridge_jni.cpp`
- `harmony/uni_ai_md_bridge.cpp`

## 构建准备

需要本机存在 uni-ai-md 源码仓库（默认取相邻的 `../../libmark`，也可用 `-RepoRoot` 或
`UNI_AI_MD_REPO` 指定）。

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
