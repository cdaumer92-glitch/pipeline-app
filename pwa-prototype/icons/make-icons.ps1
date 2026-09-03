# Génère icon-192.png et icon-512.png à partir d'un logo source (PNG carré, idéalement >= 1024 px).
# Aucune dépendance : utilise System.Drawing, inclus dans Windows PowerShell.
#
# Usage (depuis n'importe quel dossier) :
#   powershell -ExecutionPolicy Bypass -File pwa-prototype\icons\make-icons.ps1
#   powershell -ExecutionPolicy Bypass -File pwa-prototype\icons\make-icons.ps1 -Source "C:\chemin\logo.png"
#
# Paramètres :
#   -Source      PNG source (défaut : logo-source.png dans ce dossier).
#   -Pad         marge autour du logo, en fraction du côté (0 = plein cadre). Pour un logo
#                détouré (fond transparent), mettre 0.10 : l'icône « maskable » Android
#                exige que le motif reste dans les 80 % centraux.
#   -Background  couleur de fond derrière le logo quand -Pad > 0 (défaut : bleu marine TexasWin).

param(
  [string]$Source = (Join-Path $PSScriptRoot 'logo-source.png'),
  [double]$Pad = 0,
  [string]$Background = '#0b1f4e'
)

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $Source)) { throw "Logo source introuvable : $Source" }

function Write-Icon {
  param([System.Drawing.Image]$Img, [int]$Size, [string]$Out, [double]$PadFrac, [string]$BgHex)
  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  if ($PadFrac -gt 0) { $g.Clear([System.Drawing.ColorTranslator]::FromHtml($BgHex)) }
  else { $g.Clear([System.Drawing.Color]::Transparent) }
  $inner = [int][math]::Round($Size * (1 - 2 * $PadFrac))
  $off   = [int][math]::Round(($Size - $inner) / 2)
  $g.DrawImage($Img, $off, $off, $inner, $inner)
  $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  "{0}  ({1}x{1}, {2} Ko)" -f (Split-Path $Out -Leaf), $Size, [math]::Round((Get-Item $Out).Length / 1KB)
}

$img = [System.Drawing.Image]::FromFile((Resolve-Path $Source))
try {
  Write-Icon -Img $img -Size 192 -Out (Join-Path $PSScriptRoot 'icon-192.png') -PadFrac $Pad -BgHex $Background
  Write-Icon -Img $img -Size 512 -Out (Join-Path $PSScriptRoot 'icon-512.png') -PadFrac $Pad -BgHex $Background
} finally {
  $img.Dispose()
}
"Icônes régénérées. Pense à incrémenter le numéro de cache dans sw.js pour que les appareils déjà installés les récupèrent."
