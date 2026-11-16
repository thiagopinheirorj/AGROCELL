<#
Backup do Agrocel Certificados instalado no servidor da empresa (Windows).
Gera em .\backups: o banco (agrocel-AAAA-MM-DD.dump) e os arquivos (fotos e PDFs, agrocel-arquivos-AAAA-MM-DD.zip).
Guarda os últimos 30 dias. Se informar -Nuvem, copia também para essa pasta (por exemplo a pasta do OneDrive
ou do Google Drive deste computador, que sobe sozinha para a nuvem).

  .\backup.ps1
  .\backup.ps1 -Nuvem "$env:USERPROFILE\OneDrive\Agrocel backups"

Para restaurar o banco: docker compose exec -T db pg_restore -U postgres -d postgres --clean --if-exists < backups\agrocel-AAAA-MM-DD.dump
e descompacte o zip em dados\storage.
#>
param([string]$Nuvem = "", [int]$Guardar = 30)
$ErrorActionPreference = "Stop"
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $aqui
$dia = Get-Date -Format "yyyy-MM-dd"
$dir = Join-Path $aqui "backups"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$log = Join-Path $dir "backup.log"

try {
  $dump = Join-Path $dir "agrocel-$dia.dump"
  # O dump é binário: o redirecionamento do cmd preserva os bytes (o do PowerShell não).
  cmd /c "docker compose exec -T db pg_dump -U postgres -Fc postgres > `"$dump`""
  if ($LASTEXITCODE -ne 0 -or (Get-Item $dump).Length -lt 1024) { throw "pg_dump falhou" }
  $zip = Join-Path $dir "agrocel-arquivos-$dia.zip"
  if (Test-Path $zip) { Remove-Item $zip -Force }
  if (Get-ChildItem (Join-Path $aqui "dados\storage") -Recurse -File -ErrorAction SilentlyContinue) {
    Compress-Archive -Path (Join-Path $aqui "dados\storage\*") -DestinationPath $zip -CompressionLevel Optimal
  }
  Copy-Item (Join-Path $aqui ".env") (Join-Path $dir "senhas-e-chaves.env") -Force
  Get-ChildItem $dir -Filter "agrocel-*" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$Guardar) } | Remove-Item -Force
  if ($Nuvem) {
    New-Item -ItemType Directory -Force -Path $Nuvem | Out-Null
    Copy-Item $dump $Nuvem -Force; if (Test-Path $zip) { Copy-Item $zip $Nuvem -Force }
    Copy-Item (Join-Path $dir "senhas-e-chaves.env") $Nuvem -Force
    Get-ChildItem $Nuvem -Filter "agrocel-*" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$Guardar) } | Remove-Item -Force
  }
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm') OK banco $([math]::Round((Get-Item $dump).Length/1KB)) KB$(if($Nuvem){" + cópia em $Nuvem"})" | Add-Content $log
  Write-Host "Backup feito em $dir"
} catch {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm') ERRO $($_.Exception.Message)" | Add-Content $log
  Write-Host "ERRO no backup: $($_.Exception.Message)" -ForegroundColor Red; exit 1
}
