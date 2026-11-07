$ErrorActionPreference='Stop'
$workspaceRoot=Split-Path $PSScriptRoot -Parent
$resources=Join-Path $workspaceRoot 'artifacts/desktop-install-resources'
$unpack=Join-Path $resources 'unpack'
New-Item -ItemType Directory -Path $unpack -Force | Out-Null
$sevenZip=Join-Path $env:USERPROFILE 'scoop/apps/7zip/current'
foreach($name in @('7z.exe','7z.dll','License.txt')){Copy-Item -LiteralPath (Join-Path $sevenZip $name) -Destination $unpack -Force}
$archive=Join-Path $resources 'payload.7z'
if(Test-Path $archive){Remove-Item -LiteralPath $archive}
Push-Location (Join-Path $workspaceRoot 'artifacts/desktop-payload')
try{& (Join-Path $sevenZip '7z.exe') a -t7z -mx=5 -mmt=4 $archive '.';if($LASTEXITCODE -ne 0){throw 'Resource archive failed'}}finally{Pop-Location}
