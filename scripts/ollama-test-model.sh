#!/usr/bin/env bash
# Load + generate with a model via the Ollama API (no `ollama run` spinner spam).
# Usage: bash scripts/ollama-test-model.sh [model]
MODEL="${1:-qwen3.6:27b}"
echo "model: $MODEL"
ollama -v 2>&1 | head -2

echo '--- generate (cold load of a 27B may take ~20-40s) ---'
START=$(date +%s)
curl -s -m 240 http://localhost:11434/api/generate \
  -d "{\"model\":\"$MODEL\",\"prompt\":\"Reply with exactly: OK\",\"stream\":false}" \
  -o /tmp/ollama-gen.json
RC=$?
END=$(date +%s)
echo "curl rc=$RC, elapsed $((END - START))s"

if [ "$RC" -eq 0 ]; then
  node -e 'const d=require("fs").readFileSync("/tmp/ollama-gen.json","utf8");try{const j=JSON.parse(d);if(j.error){console.log("ERROR:",j.error)}else{console.log("response:",JSON.stringify(j.response));console.log("eval:",j.eval_count,"tokens,",(j.eval_duration/1e9).toFixed(2),"s ->",(j.eval_count/(j.eval_duration/1e9)).toFixed(1),"tok/s")}}catch(e){console.log("raw:",d.slice(0,500))}'
else
  echo "curl failed; partial body:"; head -c 300 /tmp/ollama-gen.json
fi

echo '--- ollama ps ---'; ollama ps
echo '--- GPU ---'; nvidia-smi --query-gpu=memory.used,utilization.gpu --format=csv,noheader 2>/dev/null
