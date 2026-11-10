# Jednoduchy staticky HTTP server pro lokalni spusteni aplikace.
# Pouziti:  powershell -ExecutionPolicy Bypass -File .\serve.ps1 -Port 8123
# Ukonceni: Ctrl+C

param(
  [int]$Port = 8123,
  [string]$Root = $PSScriptRoot,
  # 127.0.0.1 = jen tento pocitac, 0.0.0.0 = i pro telefon v siti
  [string]$Bind = '127.0.0.1'
)

$Root = [System.IO.Path]::GetFullPath($Root)

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.webp' = 'image/webp'
  '.ico'  = 'image/x-icon'
  '.txt'  = 'text/plain; charset=utf-8'
  '.md'   = 'text/markdown; charset=utf-8'
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Parse($Bind), $Port)
$listener.Start()

Write-Host ""
Write-Host "  Server bezi na:  http://${Bind}:$Port" -ForegroundColor Cyan
Write-Host "  Slozka:          $Root"
Write-Host "  Ukonceni:        Ctrl+C"
if ($Bind -eq '0.0.0.0') {
  Write-Host "  Pro telefon:     http://<IP tohoto PC>:$Port  (jen pro vyvoj, instalace PWA chce HTTPS)" -ForegroundColor DarkGray
}
Write-Host ""

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 4096, $true)

      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

      while ($true) {
        $line = $reader.ReadLine()
        if ($null -eq $line -or $line -eq '') { break }
      }

      $parts = $requestLine.Split(' ')
      $method = $parts[0]
      $rawPath = if ($parts.Length -gt 1) { $parts[1] } else { '/' }
      $path = $rawPath.Split('?')[0]
      $path = [System.Uri]::UnescapeDataString($path).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }

      $full = [System.IO.Path]::GetFullPath((Join-Path $Root $path))
      $insideRoot = $full.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)

      if (-not $insideRoot -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes("404 - Not found: $path")
        $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
        $headBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
        $stream.Write($headBytes, 0, $headBytes.Length)
        $stream.Write($body, 0, $body.Length)
        continue
      }

      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($full)

      $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
      $headBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headBytes, 0, $headBytes.Length)
      $stream.Write($bytes, 0, $bytes.Length)

      Write-Host ("  {0,-4} {1}" -f $method, $rawPath) -ForegroundColor DarkGray
    } catch {
      Write-Host "  Chyba pri obsluze pozadavku: $($_.Exception.Message)" -ForegroundColor DarkYellow
    } finally {
      if ($client) { $client.Close() }
    }
  }
} finally {
  $listener.Stop()
}
