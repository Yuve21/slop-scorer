#!/bin/sh
# slop-scorer MCP: one-line install for macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/Yuve21/slop-scorer/main/packages/mcp-server/install.sh | sh
#
# Registers the server with every MCP client it finds on this machine. It never overwrites an
# existing entry for a different server, it backs up any file it edits, and it is idempotent:
# running it twice leaves exactly one registration.
#
# Node 20+ is the only requirement. The server itself is fetched by npx at launch, so there is
# nothing to keep up to date.
#
# The package name below is overridable (SLOP_PKG) for a fork that publishes under a different
# name; everything else about this script is name-agnostic. It never guesses a GitHub owner or
# repo, because it does not need one: by the time it is running, it has already been fetched.
set -eu

PKG="${SLOP_PKG:-slop-scorer-mcp}"
NAME="slop-scorer"

say() { printf '  %s\n' "$1"; }
die() { printf '\n  %s\n\n' "$1" >&2; exit 1; }

printf '\n  slop-scorer MCP installer\n\n'

command -v node >/dev/null 2>&1 || die "node is not on PATH. Install Node 20 or newer, then run this again."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || die "node $NODE_MAJOR found, but this server needs Node 20 or newer."

# The one property this script can actually check up front: does the published package exist
# under the name it is about to tell every client to run? If npm has never heard of it, every
# registration below would 404 the instant a client tried to launch it. Fail loudly now instead
# of leaving that surprise for later. (Skipped, not failed, if npm itself is unreachable or
# missing: registration can still succeed against a registry mirror or an npm-less runtime that
# still has npx, so absence of npm here is not itself grounds to abort.)
if command -v npm >/dev/null 2>&1; then
  npm view "$PKG" version >/dev/null 2>&1 || die "npm has no published package named '$PKG'. If you are testing before it is published, run \`npm run install:local\` from a checkout instead of this script. If the package was renamed, re-run with SLOP_PKG=<new-name> sh, or SLOP_PKG=<new-name> before the curl | sh."
fi

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
