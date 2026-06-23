#!/usr/bin/env bash
set -euo pipefail

MODE="legacy"
DURATION="30"
PACKAGE=""
OUT_DIR="perf-results"
START_APP="1"
TAPS=""
LABEL=""

usage() {
  cat <<USAGE
Usage: $0 [--mode legacy|simple] [--package PACKAGE] [--duration SECONDS] [--out DIR] [--no-start] [--tap x,y]...

Examples:
  $0 --mode legacy --duration 40
  $0 --mode simple --package io.dcloud.HBuilder --tap 520,1850 --duration 40

Notes:
  - The mode flag is used for output naming; switch the in-app render mode before capturing.
  - Repeat --tap to automate a send button or other UI action after launch.
  - If --package is omitted, the script tries to detect packages containing C50103A/uni-ai/HBuilder/dcloud.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --package) PACKAGE="$2"; shift 2 ;;
    --duration) DURATION="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    --tap) TAPS+="$2;"; shift 2 ;;
    --no-start) START_APP="0"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

ADB_BIN="${ADB:-adb}"
if ! command -v "$ADB_BIN" >/dev/null 2>&1; then
  if [[ -x "$HOME/Library/Android/sdk/platform-tools/adb" ]]; then
    ADB_BIN="$HOME/Library/Android/sdk/platform-tools/adb"
  else
    echo "adb not found in PATH; set ADB=/path/to/adb" >&2
    exit 1
  fi
fi

"$ADB_BIN" get-state >/dev/null

if [[ -z "$PACKAGE" ]]; then
  mapfile -t candidates < <("$ADB_BIN" shell pm list packages | tr -d '\r' | sed 's/^package://' | grep -Ei 'C50103A|uni.?ai|HBuilder|dcloud' || true)
  if [[ ${#candidates[@]} -eq 1 ]]; then
    PACKAGE="${candidates[0]}"
  elif [[ ${#candidates[@]} -gt 1 ]]; then
    echo "Multiple candidate packages found:" >&2
    printf '  %s\n' "${candidates[@]}" >&2
    echo "Please pass --package PACKAGE" >&2
    exit 1
  else
    echo "Could not auto-detect package. Pass --package PACKAGE." >&2
    "$ADB_BIN" shell pm list packages | tr -d '\r' | sed 's/^package://' | sed -n '1,80p' >&2
    exit 1
  fi
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
RUN_NAME="${LABEL:-$MODE}-$STAMP"
RUN_DIR="$OUT_DIR/$RUN_NAME"
mkdir -p "$RUN_DIR"

echo "package=$PACKAGE" | tee "$RUN_DIR/meta.txt"
echo "mode=$MODE" | tee -a "$RUN_DIR/meta.txt"
echo "duration=$DURATION" | tee -a "$RUN_DIR/meta.txt"
"$ADB_BIN" shell getprop ro.product.manufacturer | tr -d '\r' | sed 's/^/manufacturer=/' | tee -a "$RUN_DIR/meta.txt" >/dev/null
"$ADB_BIN" shell getprop ro.product.model | tr -d '\r' | sed 's/^/model=/' | tee -a "$RUN_DIR/meta.txt" >/dev/null
"$ADB_BIN" shell getprop ro.build.version.release | tr -d '\r' | sed 's/^/android=/' | tee -a "$RUN_DIR/meta.txt" >/dev/null

if [[ "$START_APP" == "1" ]]; then
  "$ADB_BIN" shell am force-stop "$PACKAGE" >/dev/null || true
  "$ADB_BIN" shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null
  sleep 3
fi

"$ADB_BIN" shell dumpsys gfxinfo "$PACKAGE" reset >/dev/null || true
"$ADB_BIN" logcat -c || true
"$ADB_BIN" shell dumpsys meminfo "$PACKAGE" > "$RUN_DIR/meminfo-before.txt" || true
"$ADB_BIN" shell dumpsys gfxinfo "$PACKAGE" > "$RUN_DIR/gfxinfo-before.txt" || true

if [[ -n "$TAPS" ]]; then
  IFS=';' read -ra tap_list <<< "$TAPS"
  for tap in "${tap_list[@]}"; do
    [[ -z "$tap" ]] && continue
    x="${tap%,*}"
    y="${tap#*,}"
    echo "tap=$x,$y" | tee -a "$RUN_DIR/meta.txt" >/dev/null
    "$ADB_BIN" shell input tap "$x" "$y"
    sleep 0.8
  done
fi

"$ADB_BIN" logcat -v threadtime > "$RUN_DIR/logcat.txt" &
LOGCAT_PID=$!
cleanup() {
  kill "$LOGCAT_PID" >/dev/null 2>&1 || true
  wait "$LOGCAT_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for i in $(seq 1 "$DURATION"); do
  {
    echo "--- second $i ---"
    "$ADB_BIN" shell top -b -n 1 2>/dev/null | grep -i "$PACKAGE" || true
  } >> "$RUN_DIR/top.txt"
  sleep 1
done

cleanup
trap - EXIT

"$ADB_BIN" shell dumpsys gfxinfo "$PACKAGE" > "$RUN_DIR/gfxinfo-after.txt" || true
"$ADB_BIN" shell dumpsys gfxinfo "$PACKAGE" framestats > "$RUN_DIR/framestats.txt" || true
"$ADB_BIN" shell dumpsys meminfo "$PACKAGE" > "$RUN_DIR/meminfo-after.txt" || true
"$ADB_BIN" shell pidof "$PACKAGE" > "$RUN_DIR/pid.txt" || true


grep 'uni-ai-x-fps' "$RUN_DIR/logcat.txt" > "$RUN_DIR/fps-log.txt" || true
python3 - "$RUN_DIR/fps-log.txt" > "$RUN_DIR/fps-summary.txt" <<'PYSUM'
import re, sys
path = sys.argv[1]
values = []
for line in open(path, errors='ignore'):
    m = re.search(r'uni-ai-x-fps\s+mode=([^\s]+)\s+fps=(\d+)', line)
    if m:
        values.append((m.group(1), int(m.group(2))))
if not values:
    print('FPS samples: 0')
else:
    nums = [v for _, v in values]
    modes = sorted(set(m for m, _ in values))
    print('FPS samples:', len(nums))
    print('FPS modes:', ','.join(modes))
    print('FPS avg:', round(sum(nums) / len(nums), 2))
    print('FPS min:', min(nums))
    print('FPS max:', max(nums))
PYSUM

python3 - "$RUN_DIR/gfxinfo-after.txt" > "$RUN_DIR/gfx-summary.txt" <<'PY'
import re, sys
path = sys.argv[1]
text = open(path, errors='ignore').read()
for key in [
    'Total frames rendered',
    'Janky frames',
    '50th percentile',
    '90th percentile',
    '95th percentile',
    '99th percentile',
    'Number Missed Vsync',
    'Number High input latency',
    'Number Slow UI thread',
    'Number Slow bitmap uploads',
    'Number Slow issue draw commands',
]:
    m = re.search(re.escape(key) + r':\s*([^\n]+)', text)
    if m:
        print(f'{key}: {m.group(1).strip()}')
PY

echo "Saved results to $RUN_DIR"
cat "$RUN_DIR/fps-summary.txt" || true
cat "$RUN_DIR/gfx-summary.txt" || true
