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
if ($manifest.version -ne '0.1.5') { throw '不支援此補丁版本。' }
foreach ($name in 'app.asar','server.asar') {
  $hash = (Get-FileHash -LiteralPath (Join-Path $srcPath $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $manifest.hashes.$name) { throw "檔案校驗失敗：$name" }
}
& node (Join-Path $PSScriptRoot 'checkVersion.cjs') (Join-Path $resources 'app.asar')
if ($LASTEXITCODE -ne 0) { throw '已安裝版本不符，未變更任何程式檔。' }
$originalBytes = @{}
foreach ($name in 'app.asar','server.asar') {
  $originalBytes[$name] = [IO.File]::ReadAllBytes((Join-Path $resources $name))
}
try {
  foreach ($name in 'app.asar','server.asar') {
    Copy-Item -LiteralPath (Join-Path $srcPath $name) -Destination (Join-Path $resources $name) -Force
    $installedHash = (Get-FileHash -LiteralPath (Join-Path $resources $name) -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($installedHash -ne $manifest.hashes.$name) { throw "安裝後校驗失敗：$name" }
  }
} catch {
  foreach ($name in 'app.asar','server.asar') { [IO.File]::WriteAllBytes((Join-Path $resources $name), $originalBytes[$name]) }
  throw
}
Write-Host '已安裝補丁，兩份程式包校驗通過。'
Write-Host '請用 T3 Code (Beta) 捷徑重新開啟。'
