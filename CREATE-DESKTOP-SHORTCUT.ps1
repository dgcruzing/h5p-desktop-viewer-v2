$ErrorActionPreference = 'Stop'
$viewerRoot = $PSScriptRoot
$desktopDir = [Environment]::GetFolderPath('DesktopDirectory')
$shortcutPath = Join-Path $desktopDir 'H5P Desktop Viewer V2.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcut.Arguments = '"' + (Join-Path $viewerRoot 'START-H5P.vbs') + '"'
$shortcut.WorkingDirectory = $viewerRoot
$shortcut.Description = 'Open your local H5P library. Drop multiple lessons to import.'
$shortcut.WindowStyle = 7
$edgeIcon = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (Test-Path -LiteralPath $edgeIcon) { $shortcut.IconLocation = "$edgeIcon,0" }
$shortcut.Save()
Write-Output $shortcutPath
