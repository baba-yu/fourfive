#!/usr/bin/env bash
# Diagnose a stuck/unresponsive Ollama. Every daemon call is timeout-guarded so
# this script never hangs even if the daemon is wedged. Read-only (no kills).

echo "=== ollama processes ==="
pgrep -a ollama || echo "(no ollama process running)"

echo
echo "=== daemon API responsive? (5s timeout) ==="
if curl -s -m 5 http://localhost:11434/api/tags -o /tmp/ollama-tags.json 2>/dev/null; then
  echo "RESPONSIVE ($(wc -c </tmp/ollama-tags.json) bytes from /api/tags)"
else
  echo "NO RESPONSE within 5s (daemon hung or down)"
fi

echo
echo "=== running models (ollama ps, 8s timeout) ==="
timeout 8 ollama ps 2>&1 || echo "(ollama ps timed out -> daemon busy/hung)"

echo
echo "=== installed models (ollama list, 8s timeout) ==="
timeout 8 ollama list 2>&1 || echo "(ollama list timed out)"

echo
echo "=== GPU ==="
nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader 2>/dev/null || echo "(no nvidia-smi)"
echo "-- compute procs --"
nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader 2>/dev/null || true

echo
echo "=== disk space (model store) ==="
df -h "$HOME/.ollama" 2>/dev/null || df -h "$HOME"

echo
echo "=== RAM ==="
free -h | head -2

echo
echo "=== ollama daemon log tail ==="
tail -20 /tmp/ollama.log 2>/dev/null || echo "(no /tmp/ollama.log)"

echo
echo "=== codev dev log tail ==="
tail -12 /tmp/codev-dev.log 2>/dev/null || echo "(no /tmp/codev-dev.log)"
