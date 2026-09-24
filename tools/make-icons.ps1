# Builds app icons from a square logo image: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1 -Logo path\to\logo.png
param([Parameter(Mandatory = $true)][string]$Logo, [int]$CX = 256, [int]$CY = 242, [int]$R = 234)
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out = Join-Path $root 'icons'
New-Item -ItemType Directory -Force $out | Out-Null
$src = New-Object System.Drawing.Bitmap $Logo

# 1. transparent circular crop at 512px
$circle = New-Object System.Drawing.Bitmap 512, 512, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($circle)
$g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
$crop = New-Object System.Drawing.Bitmap 512, 512
$gc = [System.Drawing.Graphics]::FromImage($crop)
$gc.InterpolationMode = 'HighQualityBicubic'; $gc.PixelOffsetMode = 'HighQuality'
$gc.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, 512, 512), ($CX - $R), ($CY - $R), (2 * $R), (2 * $R), 'Pixel')
$gc.Dispose()
$brush = New-Object System.Drawing.TextureBrush $crop
$g.FillEllipse($brush, 1, 1, 510, 510)
$g.Dispose()
$circle.Save((Join-Path $out 'logo.png'), [System.Drawing.Imaging.ImageFormat]::Png)

function Save-Icon($size, $scale, $bg, $name) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gr = [System.Drawing.Graphics]::FromImage($bmp)
  $gr.SmoothingMode = 'AntiAlias'; $gr.InterpolationMode = 'HighQualityBicubic'; $gr.PixelOffsetMode = 'HighQuality'
  if ($bg) { $gr.Clear([System.Drawing.ColorTranslator]::FromHtml($bg)) } else { $gr.Clear([System.Drawing.Color]::Transparent) }
  $s = [int]($size * $scale); $o = [int](($size - $s) / 2)
  $gr.DrawImage($circle, $o, $o, $s, $s)
  $gr.Dispose()
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
Save-Icon 192 1.0 $null 'icon-192.png'
Save-Icon 512 1.0 $null 'icon-512.png'
Save-Icon 512 0.8 '#ffffff' 'maskable-512.png'
Save-Icon 180 0.9 '#ffffff' 'apple-touch-icon.png'
Save-Icon 64 1.0 $null 'favicon-64.png'
$circle.Dispose(); $crop.Dispose(); $src.Dispose()
Get-ChildItem $out | Format-Table Name, Length
