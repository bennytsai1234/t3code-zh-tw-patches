param(
  [Parameter(Mandatory)][string]$Src,
  [string]$InstallDir = "$env:LOCALAPPDATA\Programs\t3code"
)
$ErrorActionPreference = 'Stop'
$srcPath = (Resolve-Path -LiteralPath $Src).Path
$installPath = (Resolve-Path -LiteralPath $InstallDir).Path
$exe = Join-Path $installPath 'T3 Code (Beta).exe'
$resources = Join-Path $installPath 'resources'
if (!(Test-Path -LiteralPath $exe)) { throw '找不到 Beta 執行檔。請使用 -InstallDir 指定安裝目錄。' }
$running = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.Equals($exe, [StringComparison]::OrdinalIgnoreCase) }
if ($running) { throw '請先儲存工作並完全關閉 T3 Code (Beta)，再執行安裝。此工具不會停止任何程序。' }
$manifest = Get-Content -LiteralPath (Join-Path $srcPath 'patch-manifest.json') -Raw | ConvertFrom-Json
if ($manifest.version -ne '0.1.1') { throw '不支援此補丁版本。' }
foreach ($name in 'app.asar','server.asar') {
  $hash = (Get-FileHash -LiteralPath (Join-Path $srcPath $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $manifest.hashes.$name) { throw "檔案校驗失敗：$name" }
}
& node (Join-Path $PSScriptRoot 'checkVersion.cjs') (Join-Path $resources 'app.asar')
if ($LASTEXITCODE -ne 0) { throw '已安裝版本不符，未變更任何程式檔。' }
$backup = Join-Path "$env:LOCALAPPDATA\t3code-zh-tw-patches\backups" (Get-Date -Format 'yyyyMMdd-HHmmss-ffff')
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$oldHashes = @{}
foreach ($name in 'app.asar','server.asar') {
  Copy-Item -LiteralPath (Join-Path $resources $name) -Destination (Join-Path $backup $name)
  $oldHashes[$name] = (Get-FileHash -LiteralPath (Join-Path $backup $name) -Algorithm SHA256).Hash.ToLowerInvariant()
}
@{version=$manifest.version; hashes=$oldHashes} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backup 'patch-manifest.json') -Encoding utf8
try {
  foreach ($name in 'app.asar','server.asar') {
    Copy-Item -LiteralPath (Join-Path $srcPath $name) -Destination (Join-Path $resources $name) -Force
  }
} catch {
  foreach ($name in 'app.asar','server.asar') { Copy-Item -LiteralPath (Join-Path $backup $name) -Destination (Join-Path $resources $name) -Force }
  throw
}
Write-Host "已安裝補丁。還原來源：$backup"
Write-Host '請用 T3 Code (Beta) 捷徑重新開啟。'
