<#
  Converts a "Quick Family Tree" .ftz export into data/tree.json + photos/.

  Usage (from the project folder):
    powershell -ExecutionPolicy Bypass -File tools\convert-ftz.ps1 -Ftz "G:\My Drive\Personal things\FamilyTree.ftz"

  Privacy: birth YEARS of living people (no death date, born < 100 years ago)
  are dropped from the public data; day + month are kept for birthdays.
  Pass -KeepLivingBirthYears to keep them.

  WARNING: this overwrites data/tree.json, including anything added with the
  web editor since. Use it for the first import (or a deliberate full reset).
#>
param(
  [Parameter(Mandatory = $true)][string]$Ftz,
  [string]$Out,
  [switch]$KeepLivingBirthYears
)
$ErrorActionPreference = 'Stop'
if (-not $Out) { $Out = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent }
Add-Type -AssemblyName System.IO.Compression.FileSystem

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ftz_" + [guid]::NewGuid())
[IO.Compression.ZipFile]::ExtractToDirectory($Ftz, $tmp)
$nodeFile = Get-ChildItem $tmp -Recurse -Filter node.ftt | Select-Object -First 1
if (-not $nodeFile) { throw "node.ftt not found inside $Ftz" }
$faceDir = Join-Path $nodeFile.DirectoryName 'face'

$lines = [IO.File]::ReadAllLines($nodeFile.FullName, [Text.Encoding]::UTF8)
$hdr = $lines[0].Trim([char]0xFEFF).Split("`t")
$nPeople = [int]$hdr[0]; $nUnions = [int]$hdr[1]; $focus = $hdr[2]
$thisYear = (Get-Date).Year

function DateOf($f, $i) {
  if ($f[$i] -ne '128') { return $null }
  $d = [ordered]@{}
  if ([int]$f[$i + 1]) { $d.y = [int]$f[$i + 1] }
  if ([int]$f[$i + 2]) { $d.m = [int]$f[$i + 2] }
  if ([int]$f[$i + 3]) { $d.d = [int]$f[$i + 3] }
  if ($d.Count) { return $d } else { return $null }
}

$photoOut = Join-Path $Out 'photos'
New-Item -ItemType Directory -Force $photoOut | Out-Null
New-Item -ItemType Directory -Force (Join-Path $Out 'data') | Out-Null

$people = [ordered]@{}
for ($i = 1; $i -le $nPeople; $i++) {
  $f = $lines[$i].Split("`t")
  $id = $f[0]
  $p = [ordered]@{ id = $id }
  $given = $f[13].Trim(); $nick = $null
  if ($given -match '^(.*?)\s*\((.+)\)\s*$') { $given = $Matches[1].Trim(); $nick = $Matches[2].Trim() }
  if ($given) { $p.given = $given }
  if ($f[12].Trim()) { $p.surname = $f[12].Trim() }
  if ($nick) { $p.nickname = $nick }
  $p.sex = @{ '1' = 'M'; '2' = 'F' }[$f[24]]; if (-not $p.sex) { $p.sex = 'U' }
  $birth = DateOf $f 16; $death = DateOf $f 20
  if ($death -or $f[20] -eq '128') { $p.deceased = $true }
  $living = -not $p.deceased -and -not ($birth -and $birth.y -and $birth.y -lt $thisYear - 100)
  if ($birth -and $living -and -not $KeepLivingBirthYears) { $birth.Remove('y'); if (-not $birth.Count) { $birth = $null } }
  if ($birth) { $p.birth = $birth }
  if ($death) { $p.death = $death }
  if ($f[2] -ne '0') { $p.parents = $f[2]; $p.order = [int]$f[3] }
  $extra = ($f[25..($f.Length - 1)] | Where-Object { $_.Trim() }) -join ' '
  if ($extra.Trim()) { $p.notes = $extra.Trim() }
  $face = Join-Path $faceDir "$id.jpg"
  if (Test-Path $face) { Copy-Item $face (Join-Path $photoOut "$id.jpg") -Force; $p.photo = "photos/$id.jpg" }
  $people[$id] = $p
}

$unions = [ordered]@{}
for ($i = $nPeople + 1; $i -le $nPeople + $nUnions; $i++) {
  $f = $lines[$i].Split("`t")
  $u = [ordered]@{ id = $f[0] }
  if ($f[2] -ne '0') { $u.husband = $f[2]; $u.hOrder = [int]$f[3] }
  if ($f[4] -ne '0') { $u.wife = $f[4]; $u.wOrder = [int]$f[5] }
  $unions[$f[0]] = $u
}

$tree = [ordered]@{
  version = 1
  meta    = [ordered]@{ title = 'Our Family Tree'; focusId = $focus; updated = (Get-Date -Format 'yyyy-MM-dd') }
  people  = $people
  unions  = $unions
}
$json = $tree | ConvertTo-Json -Depth 6 -Compress
[IO.File]::WriteAllText((Join-Path $Out 'data\tree.json'), $json, (New-Object Text.UTF8Encoding $false))
Remove-Item $tmp -Recurse -Force
Write-Host "Converted $($people.Count) people, $($unions.Count) unions, $((Get-ChildItem $photoOut).Count) photos -> $Out"
