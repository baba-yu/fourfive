#!/usr/bin/env bash
# Restart the Ollama daemon. Needed after upgrading the `ollama` binary: the
# already-running `ollama serve` keeps the OLD version until restarted, which
# makes new model architectures fail to load ("unknown runner engine").
# Run as a file so the pkill patterns never match this script's own cmdline.
pkill -f 'ollama serve'  2>/dev/null && echo 'stopped: ollama serve'        || echo '(no ollama serve running)'
pkill -f 'ollama runner' 2>/dev/null && echo 'stopped: ollama runner(s)'    || true
pkill -f 'ollama run '   2>/dev/null && echo 'stopped: stuck ollama run'    || true
sleep 1.5

cd "$(dirname "$0")/.." || exit 1
bash scripts/ollama-bg.sh

echo '--- version now (server should equal client) ---'
ollama -v 2>&1 | head -2
