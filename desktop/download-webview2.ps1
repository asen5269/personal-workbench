$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$workspaceRoot=Split-Path $PSScriptRoot -Parent
$outputFile=Join-Path $workspaceRoot 'artifacts/WebView2Offline-x64.exe'
if(Test-Path $outputFile){
  $signature=Get-AuthenticodeSignature $outputFile
  if($signature.Status -eq 'Valid' -and $signature.SignerCertificate.Subject -match 'Microsoft Corporation'){Write-Output 'Verified cached WebView2 installer';exit 0}
}
& node (Join-Path $PSScriptRoot "download-webview2.mjs")
if($LASTEXITCODE -ne 0){throw "WebView2 download failed"}
$signature=Get-AuthenticodeSignature $outputFile
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation'){throw 'WebView2 Microsoft signature verification failed'}
Write-Output "Verified Microsoft WebView2 offline installer"

