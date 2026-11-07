$ErrorActionPreference='Stop'
$workspaceRoot=Split-Path $PSScriptRoot -Parent
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$visualStudio=& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(!$visualStudio){throw '请安装 Visual Studio C++ Build Tools'}
$runtime=Get-ChildItem (Join-Path $visualStudio 'VC/Redist/MSVC/*/x64/Microsoft.VC143.CRT') -Directory | Select-Object -Last 1
if(!$runtime){throw '未找到 x64 Visual C++ 可分发运行库'}
$payload=Join-Path $workspaceRoot 'artifacts/desktop-payload'
$crt=Join-Path $workspaceRoot 'artifacts/desktop-crt'
New-Item -ItemType Directory -Path $crt -Force | Out-Null
foreach($dll in Get-ChildItem $runtime.FullName -Filter '*.dll'){
  foreach($destination in @($crt,$payload,(Join-Path $payload 'engines/python'),(Join-Path $payload 'engines/libreoffice/program'))){Copy-Item -LiteralPath $dll.FullName -Destination $destination -Force}
}
Write-Output 'Bundled x64 Visual C++ runtime DLLs.'
