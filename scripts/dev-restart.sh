#!/usr/bin/env bash
# Stop any running codev dev stacks and start exactly one fresh (detached).
cd "$(dirname "$0")/.." || exit 1
bash scripts/dev-stop.sh >/dev/null 2>&1
sleep 2
echo "post-stop concurrently stacks: $(pgrep -fc 'concurrently.js' 2>/dev/null || echo 0)"
bash scripts/dev-bg.sh
echo "post-start concurrently stacks: $(pgrep -fc 'concurrently.js' 2>/dev/null || echo 0)"
