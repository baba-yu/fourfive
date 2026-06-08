#!/usr/bin/env bash
# Start the Ollama daemon detached (if not already running) and wait until the
# API answers on :11434. No sudo needed — runs as the current user.
if curl -s -m 2 http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo 'ollama already running'
  exit 0
fi

setsid bash -c 'exec ollama serve >/tmp/ollama.log 2>&1' & disown

for i in $(seq 1 40); do
  if curl -s -m 2 http://localhost:11434/api/tags >/dev/null 2>&1; then
    echo "ollama up after $((i * 250))ms"
    exit 0
  fi
  sleep 0.25
done

echo 'ollama did NOT start; log:'
tail -20 /tmp/ollama.log
exit 1
