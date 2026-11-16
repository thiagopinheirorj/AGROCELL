#!/usr/bin/env bash
# Instalador do Agrocel Certificados no servidor da empresa (Linux: Ubuntu/Debian com Docker).
# Requisito: Docker com o plugin compose (https://docs.docker.com/engine/install/).
#
#   ./instalar.sh                              # http://localhost:8080
#   ./instalar.sh 192.168.0.10 8080            # endereço que os celulares da rede vão usar
#   ./instalar.sh                              # rodar de novo atualiza o app e mantém dados e senhas
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"; APP="$(cd "$AQUI/.." && pwd)"; cd "$AQUI"
ENDERECO="${1:-}"; PORTA="${2:-}"
passo(){ printf '\n\033[36m==> %s\033[0m\n' "$1"; }
falha(){ printf '\033[31mERRO: %s\033[0m\n' "$1"; exit 1; }

passo "Conferindo o Docker"
docker version >/dev/null 2>&1 || falha "Docker não está rodando (ou o usuário não está no grupo docker)."
docker compose version >/dev/null 2>&1 || falha "Docker Compose não encontrado."

aleatorio(){ LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"; }
b64url(){ openssl base64 -A | tr '+/' '-_' | tr -d '='; }
jwt(){ local agora; agora=$(date +%s)
  local h p s; h=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  p=$(printf '{"iss":"supabase","ref":"agrocel","role":"%s","iat":%s,"exp":%s}' "$1" "$agora" $((agora+315360000)) | b64url)
  s=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$2" -binary | b64url); printf '%s.%s.%s' "$h" "$p" "$s"; }

if [ ! -f .env ]; then
  passo "Gerando senhas e chaves (guardadas em instalador/.env; não compartilhe)"
  PG=$(aleatorio 32); JWT=$(aleatorio 48)
  { echo "# Gerado em $(date '+%Y-%m-%d %H:%M'). Guarde uma cópia: sem ele os dados não abrem."
    echo "POSTGRES_PASSWORD=$PG"; echo "JWT_SECRET=$JWT"
    echo "ANON_KEY=$(jwt anon "$JWT")"; echo "SERVICE_ROLE_KEY=$(jwt service_role "$JWT")"
    echo "PORTA_APP=${PORTA:-8080}"; echo "URL_PUBLICA=http://${ENDERECO:-localhost}:${PORTA:-8080}"; } > .env
  chmod 600 .env
else
  passo "Usando as senhas e chaves já existentes em .env"
  if [ -n "$ENDERECO" ]; then
    grep -vE '^(PORTA_APP|URL_PUBLICA)=' .env > .env.tmp; mv .env.tmp .env
    echo "PORTA_APP=${PORTA:-8080}" >> .env; echo "URL_PUBLICA=http://$ENDERECO:${PORTA:-8080}" >> .env
  fi
fi
set -a; . ./.env; set +a
PORTA="$PORTA_APP"

passo "Preparando a porta de entrada (kong.yml) e o app"
sed -e "s|__ANON_KEY__|$ANON_KEY|" -e "s|__SERVICE_ROLE_KEY__|$SERVICE_ROLE_KEY|" kong.template.yml > kong.yml
mkdir -p app dados/db dados/storage backups functions/usuarios
cp "$APP/index.html" "$APP/sw.js" "$APP/versao.txt" app/
rm -rf app/assets; cp -r "$APP/assets" app/
printf '// Gerado pelo instalador: os dados ficam neste servidor. A chave abaixo é pública (anon).\nwindow.AGROCEL_CONFIG = {url: location.origin + "/api", key: "%s", nome: "servidor da empresa"};\n' "$ANON_KEY" > app/config.js
cp "$APP/supabase/functions/usuarios/index.ts" functions/usuarios/

passo "Subindo os serviços no Docker (na primeira vez baixa cerca de 1,5 GB)"
docker compose up -d --remove-orphans

passo "Esperando o banco e a API ficarem prontos"
ok=0
for i in $(seq 1 60); do
  if curl -fs -H "apikey: $ANON_KEY" "http://localhost:$PORTA/api/auth/v1/health" >/dev/null 2>&1 && curl -fs "http://localhost:$PORTA/api/storage/v1/status" >/dev/null 2>&1; then ok=1; break; fi
  sleep 5
done
[ "$ok" = 1 ] || falha "Os serviços não responderam em 5 minutos. Veja: docker compose logs"

TEM=$(docker compose exec -T db psql -U postgres -d postgres -tAc "select count(*) from pg_tables where schemaname='public' and tablename='perfis'" | tr -d '[:space:]')
if [ "$TEM" = "0" ]; then
  passo "Criando as tabelas e regras de acesso do app"
  docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$APP/supabase/schema.sql"
else
  passo "Banco já criado; aplicando só as migrações (seguras de repetir)"
fi
for m in "$APP"/supabase/migracao-*.sql; do docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$m"; done
docker compose kill -s SIGUSR1 rest >/dev/null; docker compose restart functions >/dev/null

passo "Agendando o backup diário às 22:00 (cron do usuário atual)"
( crontab -l 2>/dev/null | grep -v 'agrocel/backup.sh\|instalador/backup.sh'; echo "0 22 * * * $AQUI/backup.sh >> $AQUI/backups/backup.log 2>&1" ) | crontab - || echo "(não foi possível agendar; rode backup.sh por conta própria)"
chmod +x "$AQUI/backup.sh"

echo; printf '\033[32mPronto. O sistema está no ar em: %s\033[0m\n' "$URL_PUBLICA"
[ "$TEM" = "0" ] && printf '\033[33mPrimeiro passo: abra o endereço, clique em "Primeiro acesso do sistema" e crie o administrador.\033[0m\n'
echo "Dados em: $AQUI/dados | Backups em: $AQUI/backups | Senhas em: $AQUI/.env (guarde uma cópia)"
echo "Parar: docker compose stop | Voltar: docker compose start | Registros: docker compose logs -f"
