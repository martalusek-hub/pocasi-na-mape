# Vygeneruje ikony pro PWA (manifest, Apple touch icon, favicon).
# Bez externich knihoven - staci System.Drawing ve Windows.
# Pouziti:  powershell -ExecutionPolicy Bypass -File .\make-icons.ps1

Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot 'icons'
New-Item -ItemType Directory -Force -Path $out | Out-Null

function New-RoundedRectPath {
  param([single]$W, [single]$H, [single]$R)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $R * 2
  $path.AddArc(0, 0, $d, $d, 180, 90)
  $path.AddArc($W - $d, 0, $d, $d, 270, 90)
  $path.AddArc($W - $d, $H - $d, $d, $d, 0, 90)
  $path.AddArc(0, $H - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-WeatherIcon {
  param(
    [int]$Size,
    [string]$Path,
    [double]$Scale = 1.0,
    [bool]$Round = $true
  )

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  # pozadi: modry gradient
  $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
  $c1 = [System.Drawing.Color]::FromArgb(255, 56, 189, 248)
  $c2 = [System.Drawing.Color]::FromArgb(255, 29, 78, 216)
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 90.0)

  if ($Round) {
    $radius = [single]($Size * 0.22)
    $bgPath = New-RoundedRectPath -W $Size -H $Size -R $radius
    $g.FillPath($bg, $bgPath)
    $bgPath.Dispose()
  } else {
    $g.FillRectangle($bg, $rect)
  }
  $bg.Dispose()

  # obsah zvetseny/zmenseny podle bezpecne zony (maskable ikona)
  $k = [single]$Scale
  if ($k -ne 1.0) {
    $cx = [single]($Size / 2.0)
    $cy = [single]($Size / 2.0)
    $g.TranslateTransform($cx, $cy)
    $g.ScaleTransform($k, $k)
    $g.TranslateTransform(-$cx, -$cy)
  }

  $S = [single]$Size
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

  # mrak: spodni "pilulka" + tri koule
  $pillPath = New-RoundedRectPath -W ([single]($S * 0.50)) -H ([single]($S * 0.15)) -R ([single]($S * 0.075))
  $g.TranslateTransform([single]($S * 0.25), [single]($S * 0.455))
  $g.FillPath($white, $pillPath)
  $g.TranslateTransform([single](-$S * 0.25), [single](-$S * 0.455))
  $pillPath.Dispose()

  $puffs = @(
    @(0.370, 0.475, 0.110),
    @(0.510, 0.430, 0.140),
    @(0.640, 0.485, 0.095)
  )
  foreach ($p in $puffs) {
    $cx = [single]($S * $p[0])
    $cy = [single]($S * $p[1])
    $r = [single]($S * $p[2])
    $g.FillEllipse($white, [single]($cx - $r), [single]($cy - $r), [single]($r * 2), [single]($r * 2))
  }
  $white.Dispose()

  # dest
  $rain = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(235, 224, 242, 254), [single]($S * 0.034))
  $rain.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $rain.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $drops = @(
    @(0.395, 0.665, 0.368, 0.760),
    @(0.515, 0.665, 0.488, 0.775),
    @(0.635, 0.665, 0.608, 0.745)
  )
  foreach ($d in $drops) {
    $g.DrawLine(
      $rain,
      [single]($S * $d[0]), [single]($S * $d[1]),
      [single]($S * $d[2]), [single]($S * $d[3])
    )
  }
  $rain.Dispose()

  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host ("  {0}  ({1}x{1})" -f (Split-Path $Path -Leaf), $Size)
}

Write-Host ""
Write-Host "  Generuji ikony do $out" -ForegroundColor Cyan

New-WeatherIcon -Size 192 -Path (Join-Path $out 'icon-192.png') -Scale 1.0 -Round $true
New-WeatherIcon -Size 512 -Path (Join-Path $out 'icon-512.png') -Scale 1.0 -Round $true
New-WeatherIcon -Size 512 -Path (Join-Path $out 'icon-maskable-512.png') -Scale 0.80 -Round $false
New-WeatherIcon -Size 180 -Path (Join-Path $out 'apple-touch-icon.png') -Scale 0.90 -Round $false
New-WeatherIcon -Size 32 -Path (Join-Path $out 'favicon-32.png') -Scale 1.0 -Round $true

Write-Host "  Hotovo." -ForegroundColor Green
Write-Host ""
