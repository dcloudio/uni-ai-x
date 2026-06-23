#!/usr/bin/env bash
set -euo pipefail

MODE="legacy"
PACKAGE="io.dcloud.uniappx"
DURATION="40"
OUT_DIR="perf-results"
PROJECT_PATH="$(pwd)"
HBX_CLI="/Applications/HBuilderX-Dev.app/Contents/MacOS/cli"
MODE_TAP="620,82"
SEND_TAP=""
START_APP="1"
AUTO_MODE="1"
LAUNCH_MODE="hbx"

usage() {
  cat <<USAGE
Usage: $0 --mode legacy|simple [--package PACKAGE] [--duration SECONDS] [--project PATH] [--hbx-cli PATH] [--launch-mode hbx|adb] [--mode-tap x,y] [--send-tap x,y] [--out DIR] [--no-start] [--manual-mode]

This is an Android closed-loop render test:
  1. starts the app from a clean process (default mode should be legacy)
  2. screenshots before switching
  3. passes render mode through HBuilderX --pageQuery by default
  4. screenshots after switching
  5. auto-sends the built-in markdown test, then captures FPS/gfx/mem/top/logcat
  6. captures HBuilderX CLI logcat and validates markers to prove the selected render chain actually ran

Defaults are tuned for the current Android device; override --mode-tap/--send-tap if coordinates differ.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --package) PACKAGE="$2"; shift 2 ;;
    --duration) DURATION="$2"; shift 2 ;;
    --project) PROJECT_PATH="$2"; shift 2 ;;
    --hbx-cli) HBX_CLI="$2"; shift 2 ;;
    --launch-mode) LAUNCH_MODE="$2"; shift 2 ;;
    --mode-tap) MODE_TAP="$2"; shift 2 ;;
    --send-tap) SEND_TAP="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    --no-start) START_APP="0"; shift ;;
    --manual-mode) AUTO_MODE="0"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "$MODE" != "legacy" && "$MODE" != "simple" ]]; then
  echo "--mode must be legacy or simple" >&2
  exit 1
fi

ADB_BIN="${ADB:-adb}"
if ! command -v "$ADB_BIN" >/dev/null 2>&1; then
  if [[ -x "$HOME/Library/Android/sdk/platform-tools/adb" ]]; then
    ADB_BIN="$HOME/Library/Android/sdk/platform-tools/adb"
  else
    echo "adb not found; set ADB=/path/to/adb" >&2
    exit 1
  fi
fi

"$ADB_BIN" get-state >/dev/null
STAMP="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$OUT_DIR/loop-$MODE-$STAMP"
mkdir -p "$RUN_DIR"

echo "package=$PACKAGE" | tee "$RUN_DIR/meta.txt"
echo "mode=$MODE" | tee -a "$RUN_DIR/meta.txt"
echo "duration=$DURATION" | tee -a "$RUN_DIR/meta.txt"
echo "project_path=$PROJECT_PATH" | tee -a "$RUN_DIR/meta.txt"
echo "hbx_cli=$HBX_CLI" | tee -a "$RUN_DIR/meta.txt"
echo "launch_mode=$LAUNCH_MODE" | tee -a "$RUN_DIR/meta.txt"
echo "mode_tap=$MODE_TAP" | tee -a "$RUN_DIR/meta.txt"
echo "send_tap=$SEND_TAP" | tee -a "$RUN_DIR/meta.txt"
echo "auto_mode=$AUTO_MODE" | tee -a "$RUN_DIR/meta.txt"

if [[ "$START_APP" == "1" ]]; then
  "$ADB_BIN" shell am force-stop "$PACKAGE" >/dev/null || true
  if [[ "$AUTO_MODE" == "1" && "$LAUNCH_MODE" == "hbx" && -x "$HBX_CLI" ]]; then
    "$HBX_CLI" launch app-android --project "$PROJECT_PATH" --pagePath "uni_modules/uni-ai-x/pages/index/index" --pageQuery "uni_ai_x_render_mode=$MODE&uni_ai_x_auto_send=1" --ui true > "$RUN_DIR/hbuilderx-launch.txt" 2>&1 || {
      cat "$RUN_DIR/hbuilderx-launch.txt" >&2
      exit 1
    }
  elif [[ "$AUTO_MODE" == "1" ]]; then
    "$ADB_BIN" shell am start -W -n "$PACKAGE/io.dcloud.uniappxv.UniAppActivity" -d "uni-ai-x://render?uni_ai_x_render_mode=$MODE&uni_ai_x_auto_send=1" >/dev/null ||       "$ADB_BIN" shell am start -W -a android.intent.action.VIEW -d "uni-ai-x://render?uni_ai_x_render_mode=$MODE&uni_ai_x_auto_send=1" -p "$PACKAGE" >/dev/null ||       "$ADB_BIN" shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null
  else
    "$ADB_BIN" shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null
  fi
  sleep 3
fi

"$ADB_BIN" exec-out screencap -p > "$RUN_DIR/01-before-mode.png"

if [[ "$AUTO_MODE" == "0" && "$MODE" == "simple" ]]; then
  x="${MODE_TAP%,*}"
  y="${MODE_TAP#*,}"
  "$ADB_BIN" shell input tap "$x" "$y"
  sleep 1
fi

"$ADB_BIN" exec-out screencap -p > "$RUN_DIR/02-after-mode.png"

"$ADB_BIN" shell dumpsys gfxinfo "$PACKAGE" reset >/dev/null || true
"$ADB_BIN" logcat -c || true
"$ADB_BIN" shell dumpsys meminfo "$PACKAGE" > "$RUN_DIR/meminfo-before.txt" || true

if [[ -n "$SEND_TAP" ]]; then
  x="${SEND_TAP%,*}"
  y="${SEND_TAP#*,}"
  "$ADB_BIN" shell input tap "$x" "$y"
  sleep 1
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

"$ADB_BIN" exec-out screencap -p > "$RUN_DIR/03-after-run.png"
"$ADB_BIN" shell dumpsys gfxinfo "$PACKAGE" > "$RUN_DIR/gfxinfo-after.txt" || true
"$ADB_BIN" shell dumpsys gfxinfo "$PACKAGE" framestats > "$RUN_DIR/framestats.txt" || true
"$ADB_BIN" shell dumpsys meminfo "$PACKAGE" > "$RUN_DIR/meminfo-after.txt" || true

if [[ -x "$HBX_CLI" ]]; then
  "$HBX_CLI" logcat app-android --project "$PROJECT_PATH" --mode full > "$RUN_DIR/hbuilderx-logcat.txt" 2>&1 || true
else
  echo "HBuilderX CLI not executable: $HBX_CLI" > "$RUN_DIR/hbuilderx-logcat.txt"
fi

cat "$RUN_DIR/logcat.txt" "$RUN_DIR/hbuilderx-logcat.txt" > "$RUN_DIR/combined-log.txt"
grep 'uni-ai-x-fps' "$RUN_DIR/combined-log.txt" > "$RUN_DIR/fps-log.txt" || true
grep 'uni-ai-x-render' "$RUN_DIR/combined-log.txt" > "$RUN_DIR/render-log.txt" || true

python3 - "$RUN_DIR/fps-log.txt" "$RUN_DIR/render-log.txt" "$MODE" > "$RUN_DIR/summary.txt" <<'PY'
import re, sys
fps_path, render_path, mode = sys.argv[1:4]
fps_values = []
fps_modes = []
for line in open(fps_path, errors='ignore'):
    m = re.search(r'uni-ai-x-fps\s+mode=([^\s]+)\s+fps=(\d+)', line)
    if m:
        fps_modes.append(m.group(1))
        fps_values.append(int(m.group(2)))
render = open(render_path, errors='ignore').read()
print('Expected mode:', mode)
print('FPS samples:', len(fps_values))
if fps_values:
    print('FPS modes:', ','.join(sorted(set(fps_modes))))
    print('FPS avg:', round(sum(fps_values) / len(fps_values), 2))
    print('FPS min:', min(fps_values))
    print('FPS max:', max(fps_values))
print('Render log lines:', len(render.splitlines()))
print('Has send marker:', f'uni-ai-x-render send mode={mode}' in render)
print('Has request marker:', f'uni-ai-x-render request mode={mode}' in render)
print('Has run marker:', f'uni-ai-x-render run mode={mode}' in render)
print('Has simple marker:', 'simple-parse' in render or 'simple-list update' in render)
if mode == 'simple' and not ('simple-parse' in render or 'simple-list update' in render):
    print('RESULT: FAIL simple chain did not execute')
    sys.exit(2)
if mode == 'legacy' and f'uni-ai-x-render run mode=legacy' not in render:
    print('RESULT: FAIL legacy chain did not execute')
    sys.exit(2)
print('RESULT: PASS')
PY

python3 - "$RUN_DIR/gfxinfo-after.txt" > "$RUN_DIR/gfx-summary.txt" <<'PY'
import re, sys
text = open(sys.argv[1], errors='ignore').read()
for key in ['Total frames rendered','Janky frames','50th percentile','90th percentile','95th percentile','99th percentile','Number Missed Vsync','Number Slow UI thread','Number Slow issue draw commands']:
    m = re.search(re.escape(key) + r':\s*([^\n]+)', text)
    if m:
        print(f'{key}: {m.group(1).strip()}')
PY

cat "$RUN_DIR/summary.txt"
cat "$RUN_DIR/gfx-summary.txt" || true
echo "Saved results to $RUN_DIR"
