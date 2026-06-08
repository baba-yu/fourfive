#!/usr/bin/env bash
# Verify the Thinking toggle: typecheck, restart, then compare latency with
# think off vs on (the difference proves the flag threads through to Ollama).
cd "$(dirname "$0")/.." || exit 1
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

echo '=== typecheck ==='
if ! corepack pnpm typecheck >/tmp/tc.log 2>&1; then
  tail -20 /tmp/tc.log
  echo 'TYPECHECK FAILED'
  exit 1
fi
echo 'typecheck OK'

echo
echo '=== restart FourFive (reload server) ==='
bash scripts/dev-restart.sh | grep -E 'BOTH_UP|provider|stacks'

echo
echo '=== THINK=false (thinking OFF — fast path, default) ==='
THINK=false node scripts/llm-check.mjs

echo
echo '=== THINK=true (thinking ON — should be slower) ==='
THINK=true node scripts/llm-check.mjs
