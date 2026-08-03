#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PLUGIN_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
CMARK_VERSION=0.29.0.gfm.13
CMARK_ARCHIVE_SHA256=5abc61798ebd9de5660bc076443c07abad2b8d15dbc11094a3a79644b8ad243a
CMARK_URL="https://codeload.github.com/github/cmark-gfm/tar.gz/refs/tags/$CMARK_VERSION"

if [ -z "${ANDROID_NDK_HOME:-}" ]; then
  echo "ANDROID_NDK_HOME must point to an installed Android NDK" >&2
  exit 1
fi

if [ -z "${ANDROID_CMAKE_HOME:-}" ]; then
  echo "ANDROID_CMAKE_HOME must point to an Android SDK CMake installation" >&2
  exit 1
fi

WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/uni-cmark-html.XXXXXX")
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

CMAKE="$ANDROID_CMAKE_HOME/bin/cmake"
NINJA="$ANDROID_CMAKE_HOME/bin/ninja"
TOOLCHAIN="$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake"

for ABI in armeabi-v7a arm64-v8a x86 x86_64; do
  BUILD_DIR="$WORK_DIR/build-$ABI"
  "$CMAKE" -S "$SCRIPT_DIR" -B "$BUILD_DIR" -G Ninja \
    -DCMAKE_MAKE_PROGRAM="$NINJA" \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
    -DANDROID_ABI="$ABI" \
    -DANDROID_PLATFORM=android-21 \
    -DANDROID_STL=c++_static \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMARK_GFM_SOURCE_DIR="$CMARK_SOURCE"
  "$CMAKE" --build "$BUILD_DIR" --target cmarkhtml --parallel
  mkdir -p "$PLUGIN_DIR/libs/$ABI"
  cp "$BUILD_DIR/libcmarkhtml.so" "$PLUGIN_DIR/libs/$ABI/libcmarkhtml.so"
done

echo "Built libcmarkhtml.so for armeabi-v7a, arm64-v8a, x86, and x86_64"
