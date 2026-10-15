param(
  [string]$InstallDir = "$env:LOCALAPPDATA\Programs\t3code-nightly",
  [string]$HomeDir = (Join-Path $env:USERPROFILE '.t3-nightly')
)
$ErrorActionPreference = 'Stop'
$env:T3CODE_HOME = [IO.Path]::GetFullPath($HomeDir)
Start-Process -FilePath (Join-Path $InstallDir 'T3 Code (Nightly).exe') -WindowStyle Hidden
