#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

CMAKE=${CMAKE:-cmake}

if [ -z "${CMARK_GFM_SOURCE_DIR:-}" ]; then
  echo "CMARK_GFM_SOURCE_DIR must point to cmark-gfm 0.29.0.gfm.13" >&2
  exit 1
fi

BUILD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/uni-cmark-html-test.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT INT TERM

"$CMAKE" -S "$SCRIPT_DIR" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMARK_GFM_SOURCE_DIR="$CMARK_GFM_SOURCE_DIR"
"$CMAKE" --build "$BUILD_DIR" --target md2html_test --parallel
"$BUILD_DIR/md2html_test"
