#!/bin/sh
# slop-scorer MCP: one-line install for macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/OWNER/slop-scorer/main/packages/mcp-server/install.sh | sh
#
# Registers the server with every MCP client it finds on this machine. It never overwrites an
# existing entry for a different server, it backs up any file it edits, and it is idempotent:
# running it twice leaves exactly one registration.
#
# Node 20+ is the only requirement. The server itself is fetched by npx at launch, so there is
# nothing to keep up to date.
set -eu

PKG="${SLOP_PKG:-slop-scorer-mcp}"
NAME="slop-scorer"

say() { printf '  %s\n' "$1"; }
die() { printf '\n  %s\n\n' "$1" >&2; exit 1; }

printf '\n  slop-scorer MCP installer\n\n'

command -v node >/dev/null 2>&1 || die "node is not on PATH. Install Node 20 or newer, then run this again."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || die "node $NODE_MAJOR found, but this server needs Node 20 or newer."

# Patch one JSON config file, creating it if absent. Idempotent, and backs up before writing.
patch_config() {
  target="$1"
  key="$2"
  label="$3"
  [ -n "$target" ] || return 0
  mkdir -p "$(dirname "$target")"
  [ -f "$target" ] && cp "$target" "$target.slop-scorer.bak"
  SLOP_TARGET="$target" SLOP_KEY="$key" SLOP_NAME="$NAME" SLOP_PKG="$PKG" node -e '
    const fs = require("node:fs");
    const file = process.env.SLOP_TARGET;
    const key = process.env.SLOP_KEY;
    let json = {};
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8").trim();
      if (raw) { try { json = JSON.parse(raw); } catch { console.error("  existing config is not valid JSON, leaving it alone: " + file); process.exit(3); } }
    }
    json[key] = json[key] || {};
    json[key][process.env.SLOP_NAME] = { command: "npx", args: ["-y", process.env.SLOP_PKG] };
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  ' && say "registered in $label  ($target)" || say "skipped $label (see message above)"
}

INSTALLED=0

# 1. Claude Code, via its own CLI when present: it owns its config format.
if command -v claude >/dev/null 2>&1; then
  if claude mcp list 2>/dev/null | grep -q "^$NAME"; then
    say "already registered in Claude Code"
  else
    claude mcp add "$NAME" -- npx -y "$PKG" >/dev/null 2>&1 && say "registered in Claude Code" || say "could not register in Claude Code, add it by hand (see the README)"
  fi
  INSTALLED=1
fi

# 2. Claude Desktop.
case "$(uname -s)" in
  Darwin) DESKTOP="$HOME/Library/Application Support/Claude/claude_desktop_config.json" ;;
  *)      DESKTOP="${XDG_CONFIG_HOME:-$HOME/.config}/Claude/claude_desktop_config.json" ;;
esac
if [ -d "$(dirname "$DESKTOP")" ] || [ -f "$DESKTOP" ]; then
  patch_config "$DESKTOP" "mcpServers" "Claude Desktop"
  INSTALLED=1
fi

# 3. Cursor, global config.
CURSOR="$HOME/.cursor/mcp.json"
if [ -d "$HOME/.cursor" ] || [ -f "$CURSOR" ]; then
  patch_config "$CURSOR" "mcpServers" "Cursor"
  INSTALLED=1
fi

if [ "$INSTALLED" -eq 0 ]; then
  say "no MCP client was found on this machine."
  say "The README has the config snippet to paste into whichever client you use."
fi

printf '\n  Done. Restart your client, then ask it to call list_rules.\n\n'
