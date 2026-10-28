#!/bin/bash
# deploy-manual.sh — respaldo de CD por SSH cuando GitHub Actions no está disponible
# (ej. cuota mensual de Actions agotada en el plan Free de la organización, ver
# memory/atlanticerp/project_sesion_20260815_scrum427_431_765_752_767.md 2026-08-17).
#
# Replica EXACTAMENTE los mismos pasos que el job deploy-{env} de
# .github/workflows/*.yml — build local (mismo "npm ci && npm run build" que CI),
# rsync de dist/ al mismo destino, mismo reload de nginx.
#
# Antes de tocar el servidor exige el gate local (infra/gate.sh: tsc + build + Vitest completo, ADR-009).
# Si el commit ya tiene recibo verde (lo normal: se corrió antes del push) NO lo repite. Nunca se
# saltea la verificación: sin recibo, la corre. El dist/ se reconstruye siempre antes de subirlo.
#
# Uso: infra/deploy-manual.sh <dev|test|prod> [--force-gate]
#   --force-gate   vuelve a correr el gate aunque ya haya recibo verde para este commit
set -euo pipefail

ENV="${1:-}"
GATE_ARGS=()
[[ "${2:-}" == "--force-gate" ]] && GATE_ARGS=(--force)
if [[ "$ENV" != "dev" && "$ENV" != "test" && "$ENV" != "prod" ]]; then
  echo "Uso: $0 <dev|test|prod> [--force-gate]" >&2
  exit 1
fi

case "$ENV" in
  dev)  BRANCH="dev";  COMPOSE_FILE="/var/www/backend/infra/docker-compose.qa.yml" ;;
  test) BRANCH="test"; COMPOSE_FILE="/var/www/backend/infra/docker-compose.qa.yml" ;;
  prod) BRANCH="master"; COMPOSE_FILE="/var/www/backend/infra/docker-compose.prod.yml" ;;
esac

# El host sale del ambiente (nunca va fijo en el script): DEPLOY_HOST_DEV, DEPLOY_HOST_TEST o DEPLOY_HOST_PROD.
HOST_VAR="DEPLOY_HOST_$(echo "$ENV" | tr '[:lower:]' '[:upper:]')"
HOST="${!HOST_VAR:-}"
if [[ -z "$HOST" ]]; then
  echo "ERROR: define $HOST_VAR con el host del ambiente $ENV (todavía no hay infraestructura asignada)." >&2
  exit 1
fi

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

echo "==> [local] gate (infra/gate.sh) — reutiliza el recibo verde de este commit si ya existe"
./infra/gate.sh ${GATE_ARGS[@]+"${GATE_ARGS[@]}"}

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
