#!/usr/bin/env bash
# Hubs de démonstration pour les tests de bout en bout : jour (8100) et nuit (8101).
# Usage : scripts/demo.sh start|stop
set -euo pipefail
cd "$(dirname "$0")/.."
RUN=/tmp/maroubra-demo
mkdir -p "$RUN"
stop() { for f in "$RUN"/*.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; done; }
if [ "${1:-start}" = "stop" ]; then stop; exit 0; fi
stop
npm run build --silent
npx tsx scripts/make-demo.mts 2026-11-14T03:00:00Z "$RUN/day.json" >/dev/null
npx tsx scripts/make-demo.mts 2026-11-14T11:30:00Z "$RUN/night.json" >/dev/null
for pair in day:8100 night:8101; do
  name=${pair%%:*}; port=${pair##*:}
  OFFLINE=1 DEMO_SNAPSHOT="$RUN/$name.json" APP_PASSWORD=test-family-password SESSION_SECRET=demo STATIC_DIR=../web/dist COOKIE_SECURE=0 PORT=$port \
    nohup node dist/index.mjs > "$RUN/$name.log" 2>&1 &
  echo $! > "$RUN/$name.pid"
done
sleep 2
curl -sf "http://localhost:8100/health" >/dev/null && curl -sf "http://localhost:8101/health" >/dev/null && echo "demo hubs up"
