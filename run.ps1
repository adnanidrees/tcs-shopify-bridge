\
# Quick run for Windows PowerShell

Set-Location $PSScriptRoot

# Kill anything on :8090
Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  try { Stop-Process -Id $_.OwningProcess -Force } catch {}
}
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

npm install
npm run dev
