#!/usr/bin/env bash
# gate.sh — gate local de atlanticerp-frontend: tsc + Vitest (suite completa) + build de producción, con "recibo".
#
# Contexto (ADR-009, ver atlanticerp/docs/adr/009-gate-local-con-recibo.md): la verificación completa
# se hace UNA vez, acá, y deja un recibo por SHA en ~/.atlanticerp-gate/<repo>/<sha>. El hook de pre-push
# (.githooks/pre-push) exige ese recibo para empujar a dev, test o master; las promociones empujan el mismo
# sha y pasan solas. En GitHub Actions solo master vuelve a correr los tests.
#
# Uso:
#   infra/gate.sh            corre el gate sobre HEAD y deja el recibo (si ya hay uno verde, lo reutiliza)
#   infra/gate.sh --force    lo vuelve a correr aunque ya haya recibo
#   infra/gate.sh --check [sha]  solo comprueba si el sha (HEAD por defecto) está cubierto (exit 0 sí / 1 no):
#                            tiene recibo verde, o desciende de uno y solo cambió documentación
set -euo pipefail

cd "$(dirname "$0")/.."
# ATLANTICERP_GATE_REPO: nombre del repo para el recibo cuando el gate corre desde un worktree con otro nombre de carpeta.
REPO="${ATLANTICERP_GATE_REPO:-$(basename "$PWD")}"
SHA="$(git rev-parse HEAD)"
DIR="${ATLANTICERP_GATE_DIR:-$HOME/.atlanticerp-gate}/$REPO"
RECEIPT="$DIR/$SHA"
MODE="${1:-run}"

# ¿Este sha está cubierto? Sí si tiene recibo verde, o si desciende de un commit con recibo verde y lo único que
# cambió desde entonces es documentación o .gitignore (docs/**, *.md, .gitignore: no pueden afectar a los tests): un informe de Pre-QA encima de un commit ya verificado
# no debería costar otra corrida completa del gate.
has_green() { [[ -f "$DIR/$1" ]] && grep -q '^result=green$' "$DIR/$1"; }
docs_only() {
  local changed
  changed="$(git diff --name-only "$1" "$2" 2>/dev/null || true)"
  [[ -n "$changed" ]] && ! echo "$changed" | grep -qvE '^docs/|\.md$|(^|/)\.gitignore$'
}
covered_sha() {
  local sha="$1" a
  has_green "$sha" && return 0
  for a in $(git rev-list --max-count=40 "$sha" 2>/dev/null); do
    if has_green "$a"; then docs_only "$a" "$sha"; return $?; fi
  done
  return 1
}

# Rutas cuyo contenido afecta el resultado (se ignora el resto: informes, capturas, specs temporales _preqa_*).
CODE_PATHS=(src public index.html package.json package-lock.json vite.config.ts vitest.config.ts tsconfig.json tsconfig.node.json tailwind.config.js postcss.config.js .github)

if [[ "$MODE" == "--check" ]]; then
  covered_sha "$(git rev-parse "${2:-HEAD}")"
  exit $?
fi

if [[ "$MODE" != "--force" ]] && covered_sha "$SHA"; then
  if has_green "$SHA"; then
    echo "gate: HEAD ${SHA:0:8} ya tiene recibo verde ($(grep '^date=' "$RECEIPT" | cut -d= -f2)) — nada que correr. Use --force para repetirlo."
  else
    echo "gate: HEAD ${SHA:0:8} solo cambió documentación respecto de un commit con recibo verde — cubierto, nada que correr."
  fi
  exit 0
fi

fail() { echo "gate: ERROR — $1" >&2; exit 1; }

# Solo se pasan a git las rutas que existen (git falla con pathspec inexistente en 'diff').
EXISTING=()
for p in "${CODE_PATHS[@]}"; do [[ -e "$p" ]] && EXISTING+=("$p"); done

echo "==> [1/4] el árbol de trabajo debe ser el commit ${SHA:0:8}"
if ! git diff --quiet HEAD -- "${EXISTING[@]}"; then
  git diff --stat HEAD -- "${EXISTING[@]}" >&2
  fail "hay cambios de código sin commitear (arriba). Commitee o descarte antes de correr el gate."
fi
UNTRACKED="$(git ls-files --others --exclude-standard -- "${EXISTING[@]}")"
if [[ -n "$UNTRACKED" ]]; then
  echo "$UNTRACKED" >&2
  fail "hay archivos de código sin seguir (arriba): los tests podrían pasar por un archivo que no está en el commit."
fi

echo "==> [2/4] tsc + build de producción (mismo 'npm run build' que CI: tsc && vite build)"
START=$SECONDS
npm run build
if [[ ! -d dist || -z "$(ls -A dist)" ]]; then fail "dist/ no existe o está vacío después del build."; fi

echo "==> [3/4] Vitest — suite completa (TZ=America/Panama como en CI)"
# '--dir src' + exclude de .worktrees: los worktrees de otras sesiones duplicarían suites y fallarían por React duplicado.
TEST_OUT="$(mktemp)"
trap 'rm -f "$TEST_OUT"' EXIT
TZ=America/Panama npx vitest run --dir src --exclude '**/.worktrees/**' 2>&1 | tee "$TEST_OUT" | tail -n 12
if grep -qE 'Test Files .*failed|Tests .*failed' "$TEST_OUT"; then fail "Vitest tiene tests fallidos."; fi
SUMMARY="$(grep -E '^\s+Tests ' "$TEST_OUT" | tail -1 | sed 's/^ *//' || true)"
[[ -n "$SUMMARY" ]] || fail "no se pudo leer el resumen de Vitest — se rechaza el recibo."

echo "==> [4/4] recibo"
mkdir -p "$DIR"
{
  echo "result=green"
  echo "repo=$REPO"
  echo "sha=$SHA"
  echo "date=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "tsc_build=ok"
  echo "vitest=${SUMMARY}"
  echo "seconds=$((SECONDS - START))"
} > "$RECEIPT"
echo "gate: VERDE — recibo en $RECEIPT"

# SCRUM-962 — auditoría de dependencias: informativa, DESPUÉS del recibo y sin afectarlo (nunca falla el gate).
echo "==> [audit] dependencias (informativo, no bloqueante)"
./infra/audit.sh || true

# SCRUM-963 — SAST (Semgrep en Docker, ~12 s): informativo, también DESPUÉS del recibo y sin afectarlo. Se omite solo si no hay Docker.
echo "==> [sast] Semgrep (informativo, no bloqueante)"
./infra/sast.sh || true
