#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-aim-lib.sh
# Downloads the AiM XRK shared library for local development.
#
# Run from the repo root:   bash server/scripts/setup-aim-lib.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$SCRIPT_DIR/../lib/aim"
mkdir -p "$TARGET_DIR"

# ── Detect OS ────────────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

# ── Linux x86_64 (same as Render) ────────────────────────────────────────────
if [[ "$OS" == "Linux" && "$ARCH" == "x86_64" ]]; then
  LIB_URL="https://github.com/bmc-labs/xdrk/raw/trunk/aim/libxdrk-x86_64.so"
  LIB_FILE="$TARGET_DIR/libxdrk-x86_64.so"
  echo "→ Downloading libxdrk-x86_64.so for Linux x86_64…"
  curl -fsSL "$LIB_URL" -o "$LIB_FILE"
  chmod +x "$LIB_FILE"
  echo "✓ Saved to: $LIB_FILE"
  echo ""
  echo "No env var needed — server will auto-detect it."

# ── macOS (for local testing) ─────────────────────────────────────────────────
# The .so is a Linux ELF binary — it cannot run natively on macOS.
# However, CSV uploads work fully without it.
# If you need XRK parsing locally, run the server inside Docker (Linux).
elif [[ "$OS" == "Darwin" ]]; then
  echo ""
  echo "⚠  macOS detected."
  echo ""
  echo "The AiM library (libxdrk-x86_64.so) is a Linux x86_64 binary — it will"
  echo "NOT load on macOS natively."
  echo ""
  echo "Options for local XRK testing:"
  echo "  1. Use CSV exports (fully supported on macOS — no library needed)"
  echo "  2. Run the server in Docker (Linux container):"
  echo "       docker run --rm -it -v \"\$(pwd):/app\" -w /app/server -p 3000:3000 node:20 bash"
  echo "       # then run: bash scripts/setup-aim-lib.sh && npm start"
  echo "  3. Test directly on Render (just git push — library auto-downloads)"
  echo ""
  echo "The Render deployment is already configured to auto-download the library."
  echo "Just push to main and it works."

# ── Windows Git Bash ──────────────────────────────────────────────────────────
elif [[ "$OS" == "MINGW"* || "$OS" == "CYGWIN"* ]]; then
  LIB_URL="https://github.com/bmc-labs/xdrk/raw/trunk/aim/libxdrk-x86_64.dll"
  LIB_FILE="$TARGET_DIR/libxdrk-x86_64.dll"
  echo "→ Downloading libxdrk-x86_64.dll for Windows…"
  curl -fsSL "$LIB_URL" -o "$LIB_FILE"
  echo "✓ Saved to: $LIB_FILE"
  echo ""
  echo "Set AIM_XRK_LIB in your environment (or in a .env file):"
  echo "  AIM_XRK_LIB=$(cygpath -w "$LIB_FILE")"

else
  echo "Unsupported OS: $OS $ARCH"
  exit 1
fi
