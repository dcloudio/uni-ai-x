#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ -z "${ANDROID_CMAKE_HOME:-}" ]; then
  echo "ANDROID_CMAKE_HOME must point to an Android SDK CMake installation" >&2
  exit 1
fi

if [ -z "${CMARK_GFM_SOURCE_DIR:-}" ]; then
  echo "CMARK_GFM_SOURCE_DIR must point to cmark-gfm 0.29.0.gfm.13" >&2
  exit 1
fi

BUILD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/uni-cmark-html-test.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT INT TERM

"$ANDROID_CMAKE_HOME/bin/cmake" -S "$SCRIPT_DIR" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMARK_GFM_SOURCE_DIR="$CMARK_GFM_SOURCE_DIR"
"$ANDROID_CMAKE_HOME/bin/cmake" --build "$BUILD_DIR" --target md2html_test --parallel
"$BUILD_DIR/md2html_test"
