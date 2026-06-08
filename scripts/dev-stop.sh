#!/usr/bin/env bash
# Stop ALL codev dev processes (handles duplicate/orphaned stacks). Run as a
# file (bash scripts/dev-stop.sh) so its own cmdline never matches the pkill
# patterns below — avoids self-termination.
set +e

# Orchestrator, tsx watcher + spawned server, and vite. Patterns cover pnpm's
# nested .pnpm/ layout. tsx-watch is killed before the server so it cannot
# respawn it.
pkill -f 'concurrently.js'
pkill -f 'tsx/dist'
pkill -f 'server/index.ts'
pkill -f 'vite/bin/vite.js'
pkill -f 'vite.js'

# Backstop: kill anything still bound to our ports.
for port in 8787 5173 5174; do
  pid=$(ss -ltnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | head -1)
  [ -n "$pid" ] && kill "$pid" 2>/dev/null && echo "killed pid $pid (:$port)"
done

sleep 0.8
left=$(ss -ltnp 2>/dev/null | grep -E ':(8787|5173|5174) ')
stacks=$(pgrep -fc 'concurrently.js' 2>/dev/null)
echo "remaining concurrently stacks: ${stacks:-0}"
if [ -n "$left" ]; then
  echo "STILL LISTENING:"
  echo "$left"
else
  echo "all dev ports clear"
fi
