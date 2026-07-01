#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-localhost}"
USER="${USER}"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

is_local() {
  [[ "$HOST" == "localhost" || "$HOST" == "127.0.0.1" || "$HOST" == "127.0.1.1" ]]
}

if is_local; then
  echo "=== Deploying gputempd (local) ==="
else
  echo "=== Deploying gputempd to ${HOST} (builds on target) ==="
fi

# 1. Package source + service file only (never ship pre-built binaries)
tar -czf /tmp/gpu-monitor-agent.tar.gz \
  -C "$SCRIPT_DIR" \
  gpu.c gpu.h gpu_identity.c gpu_identity.h main.c logger.c logger.h Makefile gputempd.service

if is_local; then
  # Local deploy: extract, build, install in-place
  echo
  echo "--- Building and deploying locally ---"
  mkdir -p /tmp/gpu-monitor-deploy
  tar -xzf /tmp/gpu-monitor-agent.tar.gz -C /tmp/gpu-monitor-deploy
  cd /tmp/gpu-monitor-deploy

  # Auto-detect NVML include path
  if [ -d /opt/cuda/include ]; then
    sed -i 's|-I/usr/include|-I/opt/cuda/include|g' Makefile
  else
    sed -i 's|-I/opt/cuda/include|-I/usr/include|g' Makefile
  fi

  make clean && make
  echo "BUILD OK"

  echo
  echo "--- Installing via systemd ---"
  sudo install -m 755 gputempd /usr/local/bin/gputempd
  sudo install -m 644 gputempd.service /etc/systemd/system/gputempd.service
  sudo systemctl daemon-reload
  sudo systemctl enable --now gputempd
  sleep 2

  echo
  echo "=== Service Status ==="
  sudo systemctl status gputempd --no-pager

  echo
  echo "=== Verifying ==="
  curl -sf http://localhost:9091/gpu | python3 -m json.tool

  rm -rf /tmp/gpu-monitor-deploy /tmp/gpu-monitor-agent.tar.gz
else
  # Remote deploy: SCP, build on target, interactive systemd deploy
  echo
  echo "--- Deploying via SSH ---"
  scp /tmp/gpu-monitor-agent.tar.gz "${USER}@${HOST}:/tmp/"

  # Build on target
  ssh -o ConnectTimeout=5 "${USER}@${HOST}" <<'EOF'
    set -euo pipefail
    mkdir -p /tmp/gpu-monitor-deploy
    tar -xzf /tmp/gpu-monitor-agent.tar.gz -C /tmp/gpu-monitor-deploy
    cd /tmp/gpu-monitor-deploy

    if [ -d /opt/cuda/include ]; then
      sed -i 's|-I/usr/include|-I/opt/cuda/include|g' Makefile
    else
      sed -i 's|-I/opt/cuda/include|-I/usr/include|g' Makefile
    fi

    make clean && make
    echo "BUILD OK"
EOF

  # Interactive systemd deploy (requires sudo password)
  echo
  echo "=== Deploying via systemd (interactive sudo) ==="
  ssh -t -o ConnectTimeout=5 "${USER}@${HOST}" <<'EOF'
    set -euo pipefail
    cd /tmp/gpu-monitor-deploy

    echo "Installing binary..."
    sudo install -m 755 gputempd /usr/local/bin/gputempd

    echo "Installing systemd service..."
    sudo install -m 644 gputempd.service /etc/systemd/system/gputempd.service
    sudo systemctl daemon-reload

    echo "Enabling and starting service..."
    sudo systemctl enable --now gputempd
    sleep 1

    echo
    echo "=== Service Status ==="
    sudo systemctl status gputempd --no-pager

    echo
    echo "=== Verifying ==="
    curl -sf http://localhost:9091/gpu | python3 -m json.tool

    rm -rf /tmp/gpu-monitor-deploy /tmp/gpu-monitor-agent.tar.gz
EOF

  echo
  echo "Done. Service gputempd is running on ${HOST}:9091"
fi
