#!/bin/bash
# AriseHub print agent — double-click to start (macOS).
#
# Runs on the ONE Mac next to the DYMO (printer on USB, DYMO Connect installed
# and open). iPads and iPhones on the same WiFi print to the DYMO through this.
# Leave the window open during check-in; close it or press Ctrl+C to stop.
#
# First time: if double-clicking is blocked, right-click this file → Open, or
# run `chmod +x start-print-agent.command` in Terminal once.

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js is not installed on this Mac."
  echo "  Install it from https://nodejs.org  then double-click this again."
  echo ""
  read -r -p "  Press Return to close."
  exit 1
fi

echo ""
echo "  Starting the AriseHub print agent..."
echo "  Keep this window open while check-in is running."
echo ""
node agent.mjs

echo ""
echo "  The print agent stopped. Close this window, or run it again to restart."
read -r -p "  Press Return to close."
