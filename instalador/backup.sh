#!/usr/bin/env bash
# Backup do Agrocel Certificados no servidor da empresa (Linux). Gera em ./backups o banco (.dump) e os
# arquivos (.tar.gz) e guarda 30 dias. Com um argumento, copia também para essa pasta (por exemplo uma
# pasta sincronizada com a nuvem):   ./backup.sh /home/usuario/Nuvem/Agrocel
# Restaurar o banco: docker compose exec -T db pg_restore -U postgres -d postgres --clean --if-exists < backups/agrocel-AAAA-MM-DD.dump
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"; cd "$AQUI"; NUVEM="${1:-}"; GUARDAR=30
DIA=$(date +%F); DIR="$AQUI/backups"; mkdir -p "$DIR"
docker compose exec -T db pg_dump -U postgres -Fc postgres > "$DIR/agrocel-$DIA.dump"
[ "$(stat -c %s "$DIR/agrocel-$DIA.dump")" -gt 1024 ] || { echo "$(date '+%F %H:%M') ERRO pg_dump"; exit 1; }
tar -czf "$DIR/agrocel-arquivos-$DIA.tar.gz" -C "$AQUI/dados" storage
cp .env "$DIR/senhas-e-chaves.env"
find "$DIR" -name 'agrocel-*' -mtime +"$GUARDAR" -delete
if [ -n "$NUVEM" ]; then mkdir -p "$NUVEM"; cp "$DIR/agrocel-$DIA.dump" "$DIR/agrocel-arquivos-$DIA.tar.gz" "$DIR/senhas-e-chaves.env" "$NUVEM/"; find "$NUVEM" -name 'agrocel-*' -mtime +"$GUARDAR" -delete; fi
echo "$(date '+%F %H:%M') OK backup em $DIR${NUVEM:+ + cópia em $NUVEM}"
