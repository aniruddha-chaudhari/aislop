#!/usr/bin/env bash
# Start all dev services in a tmux session (use from WSL or Git Bash with tmux installed).
# Firewall rules on Windows: run start.ps1 once (or add rules manually) — tmux cannot elevate.

set -euo pipefail

SESSION="${AISLOP_TMUX_SESSION:-aislop}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend1"
CLIENT="$ROOT/client1"

default_ai_dir() {
  local name="$1"
  if [[ -d "/mnt/f/Aniruddha/AI/$name" ]]; then
    echo "/mnt/f/Aniruddha/AI/$name"
  elif [[ -d "/f/Aniruddha/AI/$name" ]]; then
    echo "/f/Aniruddha/AI/$name"
  else
    echo "/mnt/f/Aniruddha/AI/$name"
  fi
}

TTS_PRE="${AISLOP_TTS_PREPROCESSING_DIR:-$(default_ai_dir ttspreprocessing)}"
CHATTERBOX="${AISLOP_CHATTERBOX_DIR:-$(default_ai_dir chatterbox)}"

activate_venv() {
  local dir="$1"
  if [[ -f "$dir/.venv/bin/activate" ]]; then
    # Linux / WSL venv
    echo "source '$dir/.venv/bin/activate'"
  elif [[ -f "$dir/.venv/Scripts/activate" ]]; then
    # Windows venv from Git Bash
    echo "source '$dir/.venv/Scripts/activate'"
  else
    echo "echo 'No .venv in $dir' >&2"
  fi
}

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux not found. Install it (e.g. WSL: sudo apt install tmux)." >&2
  exit 1
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Session '$SESSION' already exists. Attach with: tmux attach -t $SESSION"
  exit 0
fi

PRE_ACTIVATE="$(activate_venv "$TTS_PRE")"
BOX_ACTIVATE="$(activate_venv "$CHATTERBOX")"

tmux new-session -d -s "$SESSION" -n backend -c "$BACKEND" \
  "bun run dev; echo 'backend exited'; read"

tmux new-window -t "$SESSION" -n client -c "$CLIENT" \
  "pnpm dev; echo 'client exited'; read"

tmux new-window -t "$SESSION" -n tts-pre -c "$TTS_PRE" \
  "$PRE_ACTIVATE; python app.py; echo 'tts-pre exited'; read"

tmux new-window -t "$SESSION" -n chatterbox -c "$CHATTERBOX" \
  "$BOX_ACTIVATE; python fastapi_tts_server.py; echo 'chatterbox exited'; read"

tmux select-window -t "$SESSION:backend"
tmux attach -t "$SESSION"
