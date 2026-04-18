#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Skipping launcher setup: macOS only."
  exit 0
fi

if ! command -v osacompile >/dev/null 2>&1; then
  echo "Skipping launcher setup: osacompile not found."
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="PhotoSeg"
APP_PATH="$ROOT_DIR/${APP_NAME}.app"
DESKTOP_LINK="$HOME/Desktop/${APP_NAME}.app"

TMP_SCRIPT="$(mktemp)"

cat > "$TMP_SCRIPT" <<'APPLESCRIPT'
on run
  set appPath to POSIX path of (path to me)
  set appPathNoSlash to text 1 thru -2 of appPath
  set repoPath to do shell script "dirname " & quoted form of appPathNoSlash

  tell application "Terminal"
    activate
    do script "cd " & quoted form of repoPath & "; npm run dev:all"
  end tell

  delay 3
  do shell script "open http://localhost:3000"
end run
APPLESCRIPT

if [ -d "$APP_PATH" ]; then
  rm -rf "$APP_PATH"
fi

osacompile -o "$APP_PATH" "$TMP_SCRIPT"
rm -f "$TMP_SCRIPT"

ln -sfn "$APP_PATH" "$DESKTOP_LINK"

echo "Created launcher: $APP_PATH"
echo "Desktop shortcut: $DESKTOP_LINK"
echo "Double-click PhotoSeg.app to start the server and open the UI."
