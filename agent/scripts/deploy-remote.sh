#!/usr/bin/env bash
set -euo pipefail

REMOTE="${1:-192.168.3.128}"
USER="${USER}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Deploying gputempd to ${REMOTE} ==="

# 1. Build source tarball
tar -czf /tmp/gpu-monitor-agent.tar.gz \
  -C "${SCRIPT_DIR}/.." \
  gpu.c gpu.h main.c Makefile gputempd.service

# 2. Copy to remote
scp /tmp/gpu-monitor-agent.tar.gz "${USER}@${REMOTE}:/tmp/"

# 3. Extract, fix build, build
ssh -o ConnectTimeout=5 "${USER}@${REMOTE}" <<'EOF'
  set -euo pipefail

  mkdir -p /tmp/gpu-monitor-deploy
  tar -xzf /tmp/gpu-monitor-agent.tar.gz -C /tmp/gpu-monitor-deploy
  cd /tmp/gpu-monitor-deploy

  sed -i 's|-I/opt/cuda/include|-I/usr/include|g' Makefile

  make clean && make
  echo "BUILD OK"
EOF

echo
echo "=== Deploy via systemd ==="
echo "Run on ${REMOTE}:"
echo
echo "  sudo install -m 755 /tmp/gpu-monitor-agent/gputempd /usr/local/bin/gputempd"
echo "  sudo install -m 644 /tmp/gpu-monitor-agent/gputempd.service /etc/systemd/system/gputempd.service"
echo "  sudo systemctl daemon-reload"
echo "  sudo systemctl enable --now gputempd"
echo
echo "Then verify:"
echo "  curl -s http://localhost:9091/gpu"
echo
