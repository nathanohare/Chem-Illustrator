# ChemDraw as the reference: open each drawing in ChemDraw (through its own automation interface,
# so ChemDraw must be installed: Windows only) and save what ChemDraw makes of it next to it:
#   name.cd.cdx, name.cd.cdxml  - the drawing as ChemDraw writes it
#   name.ref.png, name.ref.emf  - ChemDraw's own picture of it, for side-by-side checks
# Usage: powershell -File chemdraw-reference.ps1 <file or folder> [<out folder>]
# Nothing leaves the computer, so private drawings can be checked without copying them anywhere.
param([Parameter(Mandatory)][string]$Path, [string]$Out)
$files = if (Test-Path $Path -PathType Container) { Get-ChildItem $Path -File | Where-Object { $_.Extension -in '.cdx', '.cdxml' -and $_.Name -notmatch '\.cd\.cdxml?$' } } else { Get-Item $Path }
$cd = New-Object -ComObject ChemDraw_x64.Application
foreach ($f in $files) {
  $dir = if ($Out) { $Out } else { $f.DirectoryName }
  New-Item -ItemType Directory -Force $dir | Out-Null
  $base = Join-Path $dir ([IO.Path]::GetFileNameWithoutExtension($f.Name))
  try {
    $d = $cd.Documents.Open($f.FullName)
    foreach ($ext in 'cd.cdx', 'cd.cdxml', 'ref.png', 'ref.emf') { $d.SaveAs("$base.$ext") }
    $d.Close()
    "ok   $($f.Name)"
  } catch { "FAIL $($f.Name): $_" }
}
