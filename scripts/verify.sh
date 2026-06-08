#!/usr/bin/env bash
# Full local verification: stop dev, typecheck, server smoke (E2E), vite build.
# Run as a file to dodge wsl.exe inline-quoting issues.
cd "$(dirname "$0")/.." || exit 1
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

bash scripts/dev-stop.sh >/dev/null 2>&1

echo "=== typecheck ==="
if ! corepack pnpm typecheck; then echo "RESULT: TYPECHECK_FAILED"; exit 1; fi
echo "typecheck OK"

echo "=== smoke (E2E) ==="
export CODEV_LLM_PROVIDER=mock
./node_modules/.bin/tsx server/index.ts >/tmp/codev-smoke-srv.log 2>&1 &
node scripts/smoke.mjs
SMOKE=$?
bash scripts/dev-stop.sh >/dev/null 2>&1   # reap the smoke server cleanly
if [ "$SMOKE" -ne 0 ]; then
  echo "--- server log ---"; cat /tmp/codev-smoke-srv.log
  echo "RESULT: SMOKE_FAILED"; exit 1
fi

echo "=== vite build ==="
if corepack pnpm exec vite build >/tmp/codev-build.log 2>&1; then
  grep -E 'modules transformed|built in' /tmp/codev-build.log | tail -2
else
  tail -25 /tmp/codev-build.log
  echo "RESULT: BUILD_FAILED"; exit 1
fi

echo "RESULT: ALL_VERIFY_OK"
