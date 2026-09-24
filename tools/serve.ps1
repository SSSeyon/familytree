# Tiny static server for local preview: powershell -ExecutionPolicy Bypass -File tools\serve.ps1
param([int]$Port = 8080)
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$types = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8';
  '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.png' = 'image/png'; '.svg' = 'image/svg+xml'; '.webm' = 'audio/webm'; '.m4a' = 'audio/mp4'; '.mp3' = 'audio/mpeg'; '.ogg' = 'audio/ogg'; '.webmanifest' = 'application/manifest+json' }
$l = New-Object Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Serving $root at http://localhost:$Port/"
while ($l.IsListening) {
  $c = $l.GetContext()
  $path = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath.TrimStart('/'))
  if (-not $path) { $path = 'index.html' }
  $file = Join-Path $root $path
  try {
    if ((Test-Path $file -PathType Leaf) -and ([IO.Path]::GetFullPath($file).StartsWith($root))) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $c.Response.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
      $c.Response.Headers.Add('Cache-Control', 'no-store')
      $c.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $c.Response.StatusCode = 404 }
  } catch { $c.Response.StatusCode = 500 }
  $c.Response.Close()
}
