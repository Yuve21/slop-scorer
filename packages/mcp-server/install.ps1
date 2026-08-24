# slop-scorer MCP: one-line install for Windows.
#
#   powershell -c "irm https://raw.githubusercontent.com/OWNER/slop-scorer/main/packages/mcp-server/install.ps1 | iex"
#
# or, if you would rather use curl (Windows 10+ ships it):
#
#   curl -fsSL https://raw.githubusercontent.com/OWNER/slop-scorer/main/packages/mcp-server/install.ps1 -o install.ps1; powershell -ExecutionPolicy Bypass -File install.ps1
#
# Registers the server with every MCP client it finds. Idempotent, backs up any file it edits,
# and never touches an entry belonging to a different server.
$ErrorActionPreference = 'Stop'

$Pkg  = if ($env:SLOP_PKG) { $env:SLOP_PKG } else { 'slop-scorer-mcp' }
$Name = 'slop-scorer'

function Say($m) { Write-Host "  $m" }

Write-Host ''
Write-Host '  slop-scorer MCP installer'
Write-Host ''

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'node is not on PATH. Install Node 20 or newer, then run this again.'
}
$major = [int](node -p 'process.versions.node.split(".")[0]')
if ($major -lt 20) { throw "node $major found, but this server needs Node 20 or newer." }

function Add-McpServer($Path, $Key, $Label) {
  $dir = Split-Path -Parent $Path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  if (Test-Path $Path) { Copy-Item $Path "$Path.slop-scorer.bak" -Force }

  $json = @{}
  if (Test-Path $Path) {
    $raw = (Get-Content $Path -Raw).Trim()
    if ($raw) {
      try { $json = $raw | ConvertFrom-Json -AsHashtable }
      catch { Say "existing config is not valid JSON, leaving it alone: $Path"; return }
    }
  }
  if (-not $json.ContainsKey($Key)) { $json[$Key] = @{} }
  $json[$Key][$Name] = @{ command = 'npx'; args = @('-y', $Pkg) }
  ($json | ConvertTo-Json -Depth 12) | Set-Content -Path $Path -Encoding UTF8
  Say "registered in $Label  ($Path)"
}

$installed = $false

# 1. Claude Code, via its own CLI when present.
if (Get-Command claude -ErrorAction SilentlyContinue) {
  $existing = (claude mcp list 2>$null) -join "`n"
  if ($existing -match "(?m)^$Name") {
    Say 'already registered in Claude Code'
  } else {
    claude mcp add $Name -- npx -y $Pkg 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Say 'registered in Claude Code' }
    else { Say 'could not register in Claude Code, add it by hand (see the README)' }
  }
  $installed = $true
}

# 2. Claude Desktop.
$desktop = Join-Path $env:APPDATA 'Claude\claude_desktop_config.json'
if ((Test-Path (Split-Path -Parent $desktop)) -or (Test-Path $desktop)) {
  Add-McpServer $desktop 'mcpServers' 'Claude Desktop'
  $installed = $true
}

# 3. Cursor, global config.
$cursor = Join-Path $env:USERPROFILE '.cursor\mcp.json'
if ((Test-Path (Split-Path -Parent $cursor)) -or (Test-Path $cursor)) {
  Add-McpServer $cursor 'mcpServers' 'Cursor'
  $installed = $true
}

if (-not $installed) {
  Say 'no MCP client was found on this machine.'
  Say 'The README has the config snippet to paste into whichever client you use.'
}

Write-Host ''
Write-Host '  Done. Restart your client, then ask it to call list_rules.'
Write-Host ''
