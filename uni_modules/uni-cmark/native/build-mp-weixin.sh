#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MP_STATIC_DIR="$SCRIPT_DIR/../static/mp-weixin"
CMARK_VERSION=0.29.0.gfm.13
CMARK_ARCHIVE_SHA256=5abc61798ebd9de5660bc076443c07abad2b8d15dbc11094a3a79644b8ad243a
CMARK_URL="https://codeload.github.com/github/cmark-gfm/tar.gz/refs/tags/$CMARK_VERSION"

UNI_CMARK_EMCMAKE_BIN=${UNI_CMARK_EMCMAKE_BIN:-$(command -v emcmake 2>/dev/null || true)}
UNI_CMARK_CMAKE_BIN=${UNI_CMARK_CMAKE_BIN:-$(command -v cmake 2>/dev/null || true)}

if [ -z "$UNI_CMARK_EMCMAKE_BIN" ]; then
  echo "emcmake is required (verified with Emscripten 4.0.20)" >&2
  exit 1
fi
if [ -z "$UNI_CMARK_CMAKE_BIN" ]; then
  echo "cmake is required" >&2
  exit 1
fi

WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/uni-cmark-mp-weixin.XXXXXX")
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
"$UNI_CMARK_EMCMAKE_BIN" "$UNI_CMARK_CMAKE_BIN" -S "$SCRIPT_DIR" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMARK_GFM_SOURCE_DIR="$CMARK_SOURCE"
"$UNI_CMARK_CMAKE_BIN" --build "$BUILD_DIR" --target cmarkhtml_mp_weixin --parallel
mkdir -p "$MP_STATIC_DIR"
cp "$BUILD_DIR/cmark-gfm-md2html.wasm" "$MP_STATIC_DIR/cmark-gfm-md2html.wasm"

echo "Built $MP_STATIC_DIR/cmark-gfm-md2html.wasm with cmark-gfm $CMARK_VERSION"
