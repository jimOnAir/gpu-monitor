#!/usr/bin/env bash
set -euo pipefail

REMOTE="${1:-192.168.3.128}"
USER="${USER}"

echo "=== Building gputempd on ${REMOTE} ==="

# 1. Package source
tar -czf /tmp/gpu-monitor-agent.tar.gz \
  -C "$(dirname "$0")/.." \
  gpu.c gpu.h main.c Makefile

# 2. Copy to remote
scp /tmp/gpu-monitor-agent.tar.gz "${USER}@${REMOTE}:/tmp/"

# 3. Extract, fix include path, build
ssh -o ConnectTimeout=5 "${USER}@${REMOTE}" <<'EOF'
  set -euo pipefail
  mkdir -p /tmp/gpu-monitor-agent
  tar -xzf /tmp/gpu-monitor-agent.tar.gz -C /tmp/gpu-monitor-agent
  cd /tmp/gpu-monitor-agent
  sed -i 's|-I/opt/cuda/include|-I/usr/include|g' Makefile
  make clean && make
  echo "BUILD OK"
EOF

echo
echo "=== Deploy & restart ==="
echo "Run on ${REMOTE}:"
echo
echo "  sudo cp /tmp/gpu-monitor-agent/gputempd /usr/local/bin/gputempd"
echo "  sudo pkill -f gputempd && sleep 1"
echo "  sudo nohup /usr/local/bin/gputempd 9091 &"
echo
