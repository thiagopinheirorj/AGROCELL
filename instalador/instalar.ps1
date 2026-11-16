<#
Instalador do Agrocel Certificados no servidor da empresa (Windows).
Requisito: Docker Desktop instalado e aberto (https://www.docker.com/products/docker-desktop/).

Como usar (PowerShell, nesta pasta):
  .\instalar.ps1                       # instala em http://localhost:8080 (só neste computador)
  .\instalar.ps1 -Endereco 192.168.0.10 -Porta 8080   # para os celulares da rede acessarem pelo IP do servidor
  .\instalar.ps1 -Atualizar            # rodar de novo depois de baixar uma versão nova do app (mantém dados e senhas)

O que ele faz: gera as senhas e chaves (uma vez), copia o app, sobe os serviços no Docker, aplica o esquema
do banco, agenda o backup diário e cria um atalho na área de trabalho. Pode ser rodado várias vezes.
#>
param(
  [string]$Endereco = "localhost",
  [int]$Porta = 8080,
  [switch]$Atualizar,
  [switch]$SemAgendarBackup,
  [switch]$SemAtalho
)
$ErrorActionPreference = "Stop"
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$app = Resolve-Path (Join-Path $aqui "..")
Set-Location $aqui

function Passo($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
function Falha($t) { Write-Host "ERRO: $t" -ForegroundColor Red; exit 1 }

# ---------- 1. Docker ----------
Passo "Conferindo o Docker"
try { $null = docker version --format '{{.Server.Version}}' 2>$null; if ($LASTEXITCODE -ne 0) { throw "x" } }
catch { Falha "Docker não está rodando. Abra o Docker Desktop e tente de novo." }
docker compose version | Out-Null
if ($LASTEXITCODE -ne 0) { Falha "Docker Compose não encontrado. Atualize o Docker Desktop." }

# ---------- 2. Senhas e chaves (só na primeira vez) ----------
function Aleatorio($n) {
  $a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  $b = New-Object byte[] $n; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  -join ($b | ForEach-Object { $a[$_ % $a.Length] })
}
function B64Url([byte[]]$b) { [Convert]::ToBase64String($b).TrimEnd("=").Replace("+", "-").Replace("/", "_") }
function Jwt($papel, $segredo) {
  $agora = [int][double]::Parse((Get-Date -UFormat %s))
  $h = B64Url([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
  $p = B64Url([Text.Encoding]::UTF8.GetBytes(('{"iss":"supabase","ref":"agrocel","role":"' + $papel + '","iat":' + $agora + ',"exp":' + ($agora + 10 * 365 * 86400) + '}')))
  $hm = New-Object Security.Cryptography.HMACSHA256; $hm.Key = [Text.Encoding]::UTF8.GetBytes($segredo)
  $s = B64Url($hm.ComputeHash([Text.Encoding]::UTF8.GetBytes("$h.$p")))
  "$h.$p.$s"
}
$envArq = Join-Path $aqui ".env"
if (-not (Test-Path $envArq)) {
  Passo "Gerando senhas e chaves (guardadas em instalador\.env; não compartilhe este arquivo)"
  $pg = Aleatorio 32; $jwt = Aleatorio 48
  @(
    "# Gerado em $(Get-Date -Format 'yyyy-MM-dd HH:mm'). Guarde uma cópia em lugar seguro: sem ele os dados não abrem.",
    "POSTGRES_PASSWORD=$pg",
    "JWT_SECRET=$jwt",
    "ANON_KEY=$(Jwt 'anon' $jwt)",
    "SERVICE_ROLE_KEY=$(Jwt 'service_role' $jwt)",
    "PORTA_APP=$Porta",
    "URL_PUBLICA=http://${Endereco}:$Porta"
  ) | Set-Content -Path $envArq -Encoding ASCII
} else {
  Passo "Usando as senhas e chaves já existentes em .env"
  if ($PSBoundParameters.ContainsKey("Endereco") -or $PSBoundParameters.ContainsKey("Porta")) {
    $c = Get-Content $envArq | Where-Object { $_ -notmatch '^(PORTA_APP|URL_PUBLICA)=' }
    $c + "PORTA_APP=$Porta" + "URL_PUBLICA=http://${Endereco}:$Porta" | Set-Content -Path $envArq -Encoding ASCII
  }
}
$cfg = @{}; Get-Content $envArq | Where-Object { $_ -match '^([A-Z_]+)=(.*)$' } | ForEach-Object { $cfg[$matches[1]] = $matches[2] }
$Porta = [int]$cfg.PORTA_APP; $url = $cfg.URL_PUBLICA

# ---------- 3. Arquivos gerados ----------
Passo "Preparando a porta de entrada (kong.yml) e o app"
(Get-Content (Join-Path $aqui "kong.template.yml") -Raw).Replace("__ANON_KEY__", $cfg.ANON_KEY).Replace("__SERVICE_ROLE_KEY__", $cfg.SERVICE_ROLE_KEY) |
  Set-Content -Path (Join-Path $aqui "kong.yml") -Encoding ASCII -NoNewline

$dest = Join-Path $aqui "app"
New-Item -ItemType Directory -Force -Path $dest, (Join-Path $aqui "dados\db"), (Join-Path $aqui "dados\storage"), (Join-Path $aqui "backups") | Out-Null
foreach ($f in "index.html", "sw.js", "versao.txt") { Copy-Item (Join-Path $app $f) $dest -Force }
Copy-Item (Join-Path $app "assets") $dest -Recurse -Force
@"
// Gerado pelo instalador: os dados ficam neste servidor. A chave abaixo é pública (anon).
window.AGROCEL_CONFIG = {url: location.origin + "/api", key: "$($cfg.ANON_KEY)", nome: "servidor da empresa"};
"@ | Set-Content -Path (Join-Path $dest "config.js") -Encoding UTF8

$fn = Join-Path $aqui "functions\usuarios"
New-Item -ItemType Directory -Force -Path $fn | Out-Null
Copy-Item (Join-Path $app "supabase\functions\usuarios\index.ts") $fn -Force

# ---------- 4. Subir os serviços ----------
Passo "Subindo os serviços no Docker (na primeira vez baixa cerca de 1,5 GB)"
docker compose up -d --remove-orphans
if ($LASTEXITCODE -ne 0) { Falha "Não foi possível subir os serviços. Veja: docker compose logs" }

Passo "Esperando o banco e a API ficarem prontos"
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$Porta/api/auth/v1/health" -Headers @{ apikey = $cfg.ANON_KEY } -TimeoutSec 5
    $s = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$Porta/api/storage/v1/status" -TimeoutSec 5
    if ($r.StatusCode -eq 200 -and $s.StatusCode -eq 200) { $ok = $true; break }
  } catch {}
  Start-Sleep -Seconds 5
}
if (-not $ok) { Falha "Os serviços não responderam em 5 minutos. Veja: docker compose logs" }

# ---------- 5. Esquema do banco ----------
$tem = (docker compose exec -T db psql -U postgres -d postgres -tAc "select count(*) from pg_tables where schemaname='public' and tablename='perfis'").Trim()
if ($tem -eq "0") {
  Passo "Criando as tabelas e regras de acesso do app"
  Get-Content (Join-Path $app "supabase\schema.sql") -Raw | docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { Falha "Erro ao aplicar supabase\schema.sql" }
} else {
  Passo "Banco já criado; aplicando só as migrações (seguras de repetir)"
}
foreach ($m in (Get-ChildItem (Join-Path $app "supabase") -Filter "migracao-*.sql" | Sort-Object Name)) {
  Get-Content $m.FullName -Raw | docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { Falha "Erro ao aplicar $($m.Name)" }
}
# PostgREST precisa recarregar o esquema depois de criar tabelas.
docker compose kill -s SIGUSR1 rest | Out-Null
docker compose restart functions | Out-Null

# ---------- 6. Backup diário e atalho ----------
if (-not $SemAgendarBackup) {
  Passo "Agendando o backup diário às 22:00 (Agendador de Tarefas: 'Agrocel backup')"
  $cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$aqui\backup.ps1`""
  schtasks /Create /F /TN "Agrocel backup" /SC DAILY /ST 22:00 /TR $cmd | Out-Null
}
if (-not $SemAtalho) {
  $ws = New-Object -ComObject WScript.Shell
  $lnk = $ws.CreateShortcut([IO.Path]::Combine([Environment]::GetFolderPath("Desktop"), "Agrocel Certificados.url"))
  $lnk.TargetPath = "http://localhost:$Porta/"; $lnk.Save()
}

Write-Host ""
Write-Host "Pronto. O sistema está no ar em: $url" -ForegroundColor Green
Write-Host "Neste computador: http://localhost:$Porta/   |   Celulares da rede: $url"
if ($tem -eq "0") { Write-Host "Primeiro passo: abra o endereço, clique em 'Primeiro acesso do sistema' e crie o administrador." -ForegroundColor Yellow }
Write-Host "Dados em: $aqui\dados   |   Backups em: $aqui\backups   |   Senhas em: $aqui\.env (guarde uma cópia)"
Write-Host "Para parar: docker compose stop   |   Para voltar: docker compose start   |   Registros: docker compose logs -f"
