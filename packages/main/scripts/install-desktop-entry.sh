#!/bin/bash
# Install desktop entry for GPU Monitor
# Usage: npm run install:desktop

set -e

DESKTOP_ENTRY="packages/main/scripts/gpu-monitor.desktop"
ICON_SRC="build/icons/icon.png"
ICON_DST="$HOME/.local/share/icons/hicolor/256x256/apps/gpu-monitor.png"
DESKTOP_DST="$HOME/.local/share/applications/gpu-monitor.desktop"

# Create directories
mkdir -p "$(dirname "$ICON_DST")"
mkdir -p "$(dirname "$DESKTOP_DST")"

# Copy icon
if [ -f "$ICON_SRC" ]; then
  cp "$ICON_SRC" "$ICON_DST"
  echo "Icon installed to $ICON_DST"
else
  echo "Warning: Icon not found at $ICON_SRC"
fi

# Copy desktop entry
if [ -f "$DESKTOP_ENTRY" ]; then
  cp "$DESKTOP_ENTRY" "$DESKTOP_DST"
  chmod +x "$DESKTOP_DST"
  echo "Desktop entry installed to $DESKTOP_DST"
else
  echo "Error: Desktop entry not found at $DESKTOP_ENTRY"
  exit 1
fi

echo "GPU Monitor desktop integration installed."
echo "You may need to log out and back in for changes to take effect."
