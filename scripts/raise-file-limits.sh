#!/usr/bin/env bash
# Raise macOS per-process open-file limits to fix Next.js/Watchpack
# "EMFILE: too many open files, watch" during `pnpm dev` / `bun dev`.
#
# Root cause: macOS defaults kern.maxfilesperproc to 61440. Turbo (a Go
# binary) caps every child process's soft NOFILE at that value, and Next's
# Watchpack hits the limit while setting up file watchers -> EMFILE flood.
# Raising the kernel ceiling lets dev processes get a soft limit > 61440.
#
# Run ONCE:  sudo bash scripts/raise-file-limits.sh
# Reverts cleanly: sudo launchctl bootout system /Library/LaunchDaemons/limit.maxfiles.plist && sudo rm /Library/LaunchDaemons/limit.maxfiles.plist
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Please run with sudo:  sudo bash scripts/raise-file-limits.sh" >&2
  exit 1
fi

PLIST=/Library/LaunchDaemons/limit.maxfiles.plist
SOFT=262144   # per-process soft cap (well above the 61440 that breaks Watchpack)
HARD=524288   # per-process hard cap

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>limit.maxfiles</string>
    <key>ProgramArguments</key>
    <array>
      <string>launchctl</string>
      <string>limit</string>
      <string>maxfiles</string>
      <string>${SOFT}</string>
      <string>${HARD}</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>ServiceIPC</key><false/>
  </dict>
</plist>
EOF
chown root:wheel "$PLIST"
chmod 644 "$PLIST"

# apply now (current boot) + at every login
launchctl limit maxfiles "$SOFT" "$HARD" || true
sysctl -w kern.maxfiles=$((HARD * 2)) kern.maxfilesperproc="$SOFT" || true
launchctl bootstrap system "$PLIST" 2>/dev/null || launchctl load -w "$PLIST" 2>/dev/null || true

echo "Done. Open a NEW terminal, then verify:"
echo "  launchctl limit maxfiles      # expect: maxfiles ${SOFT} ${HARD}"
echo "  sysctl kern.maxfilesperproc   # expect: ${SOFT}"
echo "Then run dev again — the EMFILE warnings should be gone."
