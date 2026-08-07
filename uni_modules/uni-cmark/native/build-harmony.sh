#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
HARMONY_SOURCE_DIR="$SCRIPT_DIR/harmony"
HARMONY_UTS_DIR="$SCRIPT_DIR/../utssdk/app-harmony"
CMARK_VERSION=0.29.0.gfm.13
CMARK_ARCHIVE_SHA256=5abc61798ebd9de5660bc076443c07abad2b8d15dbc11094a3a79644b8ad243a
CMARK_URL="https://codeload.github.com/github/cmark-gfm/tar.gz/refs/tags/$CMARK_VERSION"

OHOS_NATIVE_HOME=${OHOS_NATIVE_HOME:-/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/native}
UNI_CMARK_CMAKE_BIN=${UNI_CMARK_CMAKE_BIN:-$OHOS_NATIVE_HOME/build-tools/cmake/bin/cmake}
UNI_CMARK_NINJA_BIN=${UNI_CMARK_NINJA_BIN:-$OHOS_NATIVE_HOME/build-tools/cmake/bin/ninja}
OHOS_TOOLCHAIN_FILE="$OHOS_NATIVE_HOME/build/cmake/ohos.toolchain.cmake"

if [ ! -x "$UNI_CMARK_CMAKE_BIN" ] || [ ! -x "$UNI_CMARK_NINJA_BIN" ] || [ ! -f "$OHOS_TOOLCHAIN_FILE" ]; then
  echo "A DevEco Studio HarmonyOS native toolchain is required" >&2
  exit 1
fi

WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/uni-cmark-harmony.XXXXXX")
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

BUILD_DIR="$WORK_DIR/build"
"$UNI_CMARK_CMAKE_BIN" -S "$HARMONY_SOURCE_DIR" -B "$BUILD_DIR" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_MAKE_PROGRAM="$UNI_CMARK_NINJA_BIN" \
  -DCMAKE_TOOLCHAIN_FILE="$OHOS_TOOLCHAIN_FILE" \
  -DOHOS_ARCH=arm64-v8a \
  -DOHOS_STL=c++_shared \
  -DCMARK_GFM_SOURCE_DIR="$CMARK_SOURCE"
"$UNI_CMARK_CMAKE_BIN" --build "$BUILD_DIR" --target cmark --parallel

PACKAGE_DIR="$WORK_DIR/package"
cp -R "$HARMONY_SOURCE_DIR/package/." "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR/libs/arm64-v8a"
cp "$BUILD_DIR/libcmark.so" "$PACKAGE_DIR/libs/arm64-v8a/libcmark.so"
mkdir -p "$HARMONY_UTS_DIR/libs"
COPYFILE_DISABLE=1 tar -czf "$HARMONY_UTS_DIR/libs/cmark.har" -C "$WORK_DIR" package

echo "Built $HARMONY_UTS_DIR/libs/cmark.har with cmark-gfm $CMARK_VERSION"
