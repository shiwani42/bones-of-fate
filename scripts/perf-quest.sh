#!/usr/bin/env bash
# On-device frame-time capture for Chausar in Quest Browser (docs/TESTING.md H1).
# 1. Quest on USB with developer mode on; `adb devices` lists it.
# 2. Open the game in Quest Browser, enter the court, and start playing.
# 3. Run: bash scripts/perf-quest.sh [duration_ms]
#    Throw the dice, trigger a crack (get caught cheating) and win once while it records.
set -euo pipefail
METAVR="${METAVR:-$(command -v metavr || ls ~/.metavr/npm/binaries/@meta-quest__metavr-linux-x64/*/metavr 2>/dev/null | tail -1)}"
[ -x "$METAVR" ] || { echo "metavr CLI not found (set METAVR=/path/to/metavr)" >&2; exit 1; }
"$METAVR" device list
out="chausar-$(date +%Y%m%d-%H%M%S)"
"$METAVR" perf capture --app com.oculus.browser --mode vr --duration "${1:-20000}" -o "$out"
trace="$(ls -t "$out"* 2>/dev/null | head -1 || true)"
[ -n "$trace" ] && "$METAVR" perf analyze-trace "$trace" || echo "capture saved; analyse with: metavr perf analyze-trace <trace>"
