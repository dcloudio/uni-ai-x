#!/usr/bin/env bash
# 编译 UniAiMdBridge.xcframework 并放到 UTS 插件目录。
#
# 与 Android/HarmonyOS 不同，iOS 桥接库不能脱离引擎单独编译：iOS 侧把 core、render、
# math、mermaid 与桥接代码静态链进同一个 framework，所以必须用 uni-ai-md 源码仓库做
# 构建根目录。仓库根目录通过 -RepoRoot 参数或 UNI_AI_MD_REPO 环境变量指定，未指定时
# 报错退出（与 prepare-lib.ps1 的约定一致）。
#
# 本项目 native/ios/ 保存桥接源码快照（uni_ai_md_bridge.mm / UniAiMdBridge.h /
# module.modulemap），与仓库 demo/uni-app-x/native/ios/ 保持一致，便于回溯；实际构建
# 读取仓库内的同一份源码。
#
# 需要 macOS、Xcode 命令行工具与 CMake 3.16+，并已 git submodule update --init --recursive。
#
# 用法：
#   bash native/build-ios.sh -RepoRoot /path/to/uni-ai-md
#   UNI_AI_MD_REPO=/path/to/uni-ai-md bash native/build-ios.sh

set -euo pipefail

native_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$native_dir/.." && pwd)"
plugin_dir="$project_dir/uni_modules/uni-ai-md/utssdk/app-ios"
output="$plugin_dir/Frameworks/UniAiMdBridge.xcframework"

repo_root="${UNI_AI_MD_REPO:-}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    -RepoRoot|--repo-root)
      repo_root="${2:-}"
      shift 2
      ;;
    *)
      printf '未知参数：%s\n' "$1" >&2
      exit 1
      ;;
  esac
done
if [[ -z "$repo_root" ]]; then
  printf '错误：未指定 uni-ai-md 源码仓库，请设置 UNI_AI_MD_REPO 环境变量或传入 -RepoRoot\n' >&2
  exit 1
fi
if [[ ! -d "$repo_root" ]]; then
  printf '错误：仓库根目录不存在：%s\n' "$repo_root" >&2
  exit 1
fi
repo_root="$(cd "$repo_root" && pwd)"

if [[ ! -f "$repo_root/third_party/cmark-gfm/CMakeLists.txt" ||
      ! -f "$repo_root/third_party/freetype/CMakeLists.txt" ]]; then
  printf '请先在仓库根目录运行 git submodule update --init --recursive\n' >&2
  exit 1
fi
if ! command -v cmake >/dev/null; then
  printf '缺少 CMake，请先安装 CMake 3.16 或更新版本\n' >&2
  exit 1
fi
if ! command -v xcodebuild >/dev/null; then
  printf '缺少 Xcode 命令行工具\n' >&2
  exit 1
fi

build_framework() {
  local sdk="$1"
  local archs="$2"
  local out_sub="$3"
  local build_dir="$repo_root/.build/ios-$out_sub"
  cmake -S "$repo_root" -B "$build_dir" \
    -DCMAKE_C_COMPILER="$(xcrun --sdk "$sdk" --find clang)" \
    -DCMAKE_CXX_COMPILER="$(xcrun --sdk "$sdk" --find clang++)" \
    -DCMAKE_OBJCXX_COMPILER="$(xcrun --sdk "$sdk" --find clang++)" \
    -DCMAKE_SYSTEM_NAME=iOS \
    -DCMAKE_OSX_SYSROOT="$sdk" \
    -DCMAKE_OSX_ARCHITECTURES="$archs" \
    -DCMAKE_OSX_DEPLOYMENT_TARGET=13.0 \
    -DCMAKE_MACOSX_BUNDLE=OFF \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_TESTING=OFF \
    -DUNI_AI_MD_BUILD_FULL=ON \
    -DUNI_AI_MD_BUILD_MODULAR=OFF \
    -DUNI_AI_MD_ENABLE_MATH=ON \
    -DUNI_AI_MD_ENABLE_MERMAID=ON \
    -DUNI_AI_MD_OUTPUT_SUBDIR="$out_sub"
  cmake --build "$build_dir" --target uni_ai_md_full --parallel 2
}

build_framework iphoneos arm64 ios-device
build_framework iphonesimulator 'arm64;x86_64' ios-simulator

device="$repo_root/dist/full/ios-device/Release/UniAiMdBridge.framework"
simulator="$repo_root/dist/full/ios-simulator/Release/UniAiMdBridge.framework"
[[ -d "$device" ]] || { printf '未生成真机 framework：%s\n' "$device" >&2; exit 1; }
[[ -d "$simulator" ]] || { printf '未生成模拟器 framework：%s\n' "$simulator" >&2; exit 1; }

for symbol in _uni_ai_md_ios_create _uni_ai_md_ios_feed _uni_ai_md_ios_finish \
              _uni_ai_md_ios_destroy _uni_ai_md_ios_free; do
  if ! xcrun nm -gU "$device/UniAiMdBridge" | grep -q " $symbol$"; then
    printf 'iOS framework 缺少导出符号：%s\n' "$symbol" >&2
    exit 1
  fi
done

mkdir -p "$(dirname "$output")"
if [[ -e "$output" ]]; then
  rm -rf "$output"
fi
xcodebuild -create-xcframework -framework "$device" -framework "$simulator" -output "$output"
printf 'iOS framework 已生成：%s\n' "$output"
