#!/bin/bash
# deploy-manual.sh — respaldo de CD por SSH cuando GitHub Actions no está disponible
# (ej. cuota mensual de Actions agotada en el plan Free de la organización, ver
# memory/atlanticerp/project_sesion_20260815_scrum427_431_765_752_767.md 2026-08-17).
#
# Replica EXACTAMENTE los mismos pasos que el job deploy-{env} de
# .github/workflows/*.yml — build local (mismo "npm ci && npm run build" que CI),
# rsync de dist/ al mismo destino, mismo reload de nginx.
#
# A diferencia del CD real, este script corre vitest+tsc localmente ANTES de tocar
# el servidor (mismo gate que el job "ci" de GHA) — nunca saltea la verificación
# solo porque Actions esté caído.
#
# Uso: infra/deploy-manual.sh <dev|test|prod>
set -euo pipefail

ENV="${1:-}"
if [[ "$ENV" != "dev" && "$ENV" != "test" && "$ENV" != "prod" ]]; then
  echo "Uso: $0 <dev|test|prod>" >&2
  exit 1
fi

case "$ENV" in
  dev)  HOST="dev.atlanticerp.ai";  BRANCH="dev";  COMPOSE_FILE="/var/www/backend/infra/docker-compose.qa.yml" ;;
  test) HOST="test.atlanticerp.ai"; BRANCH="test"; COMPOSE_FILE="/var/www/backend/infra/docker-compose.qa.yml" ;;
  prod) HOST="atlanticerp.ai";      BRANCH="master"; COMPOSE_FILE="/var/www/backend/infra/docker-compose.prod.yml" ;;
esac

SSH_KEY="$HOME/.ssh/atlanticerp/atlanticerp-key.pem"
SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no ubuntu@$HOST"

echo "==> [local] verificando rama actual está pusheada a origin/$BRANCH"
LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse "origin/$BRANCH")
if [[ "$LOCAL_SHA" != "$REMOTE_SHA" ]]; then
  echo "ERROR: HEAD local ($LOCAL_SHA) no coincide con origin/$BRANCH ($REMOTE_SHA)." >&2
  echo "Pushear primero — este script despliega lo que está commiteado, no un working tree sucio." >&2
  exit 1
fi

echo "==> [local] tsc + vitest (mismo gate que el job CI de GitHub Actions)"
npx tsc --noEmit
npx vitest run

echo "==> [local] npm run build (mismo build que CI)"
npm run build

if [ ! -d "dist" ] || [ -z "$(ls -A dist)" ]; then
  echo "ERROR: dist/ no existe o está vacío después del build." >&2
  exit 1
fi
echo "dist/ OK — $(find dist -type f | wc -l) archivos generados."

echo "==> [remoto $HOST] rsync dist/ -> /var/www/static/"
rsync -avz --delete \
  -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
  dist/ \
  ubuntu@"$HOST":/var/www/static/

echo "==> [remoto $HOST] reload nginx"
$SSH "docker compose -f $COMPOSE_FILE exec -T nginx nginx -s reload"

echo "==> Deploy $ENV completado."
echo "==> [local] verificando $HOST responde"
curl -sf "https://$HOST/" > /dev/null && echo "OK: https://$HOST/ responde." || echo "ADVERTENCIA: el sitio no respondió — revisar manualmente."
