#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
IOS_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../utssdk/app-ios" && pwd)
CMARK_VERSION=0.29.0.gfm.13
CMARK_ARCHIVE_SHA256=5abc61798ebd9de5660bc076443c07abad2b8d15dbc11094a3a79644b8ad243a
CMARK_URL="https://codeload.github.com/github/cmark-gfm/tar.gz/refs/tags/$CMARK_VERSION"

if [ -n "${IOS_CMAKE_HOME:-}" ]; then
  CMAKE="$IOS_CMAKE_HOME/bin/cmake"
  NINJA="$IOS_CMAKE_HOME/bin/ninja"
elif command -v cmake >/dev/null 2>&1; then
  CMAKE=$(command -v cmake)
  NINJA=$(command -v ninja || true)
else
  echo "Set IOS_CMAKE_HOME to a CMake installation or add cmake to PATH" >&2
  exit 1
fi

if [ ! -x "$CMAKE" ]; then
  echo "CMake executable not found: $CMAKE" >&2
  exit 1
fi
if [ ! -x "$NINJA" ]; then
  echo "Ninja executable not found: $NINJA" >&2
  exit 1
fi
if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild is required" >&2
  exit 1
fi

WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/uni-cmark-ios.XXXXXX")
WORK_DIR=$(CDPATH= cd -- "$WORK_DIR" && pwd -P)
trap 'rm -rf "$WORK_DIR"' EXIT INT TERM

if [ -n "${CMARK_GFM_SOURCE_DIR:-}" ]; then
  CMARK_SOURCE=$CMARK_GFM_SOURCE_DIR
else
  CMARK_ARCHIVE="$WORK_DIR/cmark-gfm.tar.gz"
  CMARK_SOURCE="$WORK_DIR/cmark-gfm"
  curl -L --fail --max-time 60 -o "$CMARK_ARCHIVE" "$CMARK_URL"
  printf '%s  %s\n' "$CMARK_ARCHIVE_SHA256" "$CMARK_ARCHIVE" | shasum -a 256 -c -
  mkdir -p "$CMARK_SOURCE"
  tar -xzf "$CMARK_ARCHIVE" -C "$CMARK_SOURCE" --strip-components=1
fi

build_framework() {
  SDK=$1
  ARCHITECTURES=$2
  BUILD_DIR="$WORK_DIR/build-$SDK"
  SDK_PATH=$(xcrun --sdk "$SDK" --show-sdk-path)
  CLANG=$(xcrun --sdk "$SDK" --find clang)
  "$CMAKE" -S "$SCRIPT_DIR" -B "$BUILD_DIR" -G Ninja \
    -DCMAKE_MAKE_PROGRAM="$NINJA" \
    -DCMAKE_SYSTEM_NAME=iOS \
    -DCMAKE_C_COMPILER="$CLANG" \
    -DCMAKE_OBJC_COMPILER="$CLANG" \
    -DCMAKE_OSX_SYSROOT="$SDK_PATH" \
    -DCMAKE_OSX_ARCHITECTURES="$ARCHITECTURES" \
    -DCMAKE_OSX_DEPLOYMENT_TARGET=13.0 \
    -DCMAKE_MACOSX_BUNDLE=OFF \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY \
    -DCMARK_GFM_SOURCE_DIR="$CMARK_SOURCE"
  "$CMAKE" --build "$BUILD_DIR" --target scopeparser4ios --parallel

  FRAMEWORK="$BUILD_DIR/scopeparser4ios.framework"
  mkdir -p "$FRAMEWORK/Headers"
  mkdir -p "$FRAMEWORK/Modules"
  cp "$SCRIPT_DIR/ios/ScopeparserBridge.h" "$FRAMEWORK/Headers/ScopeparserBridge.h"
  cp "$SCRIPT_DIR/ios/scopeparser4ios.h" "$FRAMEWORK/Headers/scopeparser4ios.h"
  cp "$SCRIPT_DIR/ios/module.modulemap" "$FRAMEWORK/Modules/module.modulemap"
}

build_framework iphoneos arm64
build_framework iphonesimulator "arm64;x86_64"

DEVICE_FRAMEWORK="$WORK_DIR/build-iphoneos/scopeparser4ios.framework"
SIMULATOR_FRAMEWORK="$WORK_DIR/build-iphonesimulator/scopeparser4ios.framework"
OUTPUT_FRAMEWORK="$WORK_DIR/scopeparser4ios.xcframework"
xcodebuild -create-xcframework \
  -framework "$DEVICE_FRAMEWORK" \
  -framework "$SIMULATOR_FRAMEWORK" \
  -output "$OUTPUT_FRAMEWORK"

mkdir -p "$IOS_DIR/Frameworks"
rm -rf "$IOS_DIR/Frameworks/scopeparser4ios.xcframework"
cp -R "$OUTPUT_FRAMEWORK" "$IOS_DIR/Frameworks/scopeparser4ios.xcframework"

echo "Built $IOS_DIR/Frameworks/scopeparser4ios.xcframework"
