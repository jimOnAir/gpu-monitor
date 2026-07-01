#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Building gputempd (localhost) ==="
cd "$SCRIPT_DIR"
make clean && make
echo "OK: $SCRIPT_DIR/gputempd"
