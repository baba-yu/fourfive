#!/usr/bin/env bash
# Launch FourFive dev servers (Hono + Vite) detached, wait for both ports, report.
set -u
cd "$(dirname "$0")/.." || exit 1
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

setsid bash -c 'exec corepack pnpm dev >/tmp/codev-dev.log 2>&1' & disown

api=""; web=""
for i in $(seq 1 80); do
  api=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8787/api/health 2>/dev/null || true)
  web=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/ 2>/dev/null || true)
  if [ "$api" = "200" ] && [ "$web" = "200" ]; then
    echo "BOTH_UP after $((i * 250))ms  api=$api web=$web"
    break
  fi
  sleep 0.25
done
echo "final api=$api web=$web"
echo "--- /api/health ---"
curl -s http://localhost:8787/api/health || true
echo
echo "--- dev log tail ---"
tail -16 /tmp/codev-dev.log 2>/dev/null || true
