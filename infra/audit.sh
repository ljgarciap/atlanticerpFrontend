#!/usr/bin/env bash
# audit.sh — SCRUM-962: auditoría de dependencias de producción de atlanticerp-frontend (`npm audit --omit=dev`).
#
# NO BLOQUEANTE por diseño (spec docs/specs/scrum-962-dependency-scanning.md): imprime un resumen y
# sale 0 aunque haya advisories, para que ni el gate local (recibo) ni el CI de master dependan de él.
# Pasa a bloqueante solo por decisión de Luis, tras 2 semanas con la línea base depurada.
#
# Uso:
#   infra/audit.sh            reporte (exit 0 siempre)
#   infra/audit.sh --strict   exit 1 si hay vulnerabilidades altas o críticas (lo usa el workflow semanal)
#
# Solo mira producción (--omit=dev): lo de desarrollo no llega al bundle. No requiere node_modules, solo el
# package-lock.json. Sin red / sin npm: avisa y sale 0 — un audit que no corrió no debe tumbar nada.
# Si $GITHUB_STEP_SUMMARY existe (Actions), el resumen también se escribe ahí.
set -uo pipefail

cd "$(dirname "$0")/.."
STRICT=0
[[ "${1:-}" == "--strict" ]] && STRICT=1

command -v npm     >/dev/null 2>&1 || { echo "audit: npm no disponible — auditoría omitida."; exit 0; }
command -v python3 >/dev/null 2>&1 || { echo "audit: python3 no disponible — auditoría omitida."; exit 0; }

# npm audit sale con código != 0 cuando hay hallazgos: se ignora, el JSON es lo que importa.
RAW="$(npm audit --omit=dev --json 2>/dev/null || true)"
[[ -n "$RAW" ]] || { echo "audit: npm audit no devolvió resultado (¿sin red?) — auditoría omitida."; exit 0; }

printf '%s' "$RAW" | STRICT="$STRICT" REPO="$(basename "$PWD")" python3 -c '
import json, os, sys
try:
    d = json.load(sys.stdin)
except ValueError:
    print("audit: respuesta de npm audit ilegible — auditoría omitida."); sys.exit(0)
if "error" in d and "vulnerabilities" not in d:
    print("audit: npm audit falló ({}) — auditoría omitida.".format((d["error"] or {}).get("code", "?"))); sys.exit(0)

vulns = d.get("vulnerabilities") or {}
sev = {"critical": 0, "high": 0, "moderate": 0, "low": 0, "info": 0}
for v in vulns.values():
    s = (v.get("severity") or "info").lower()
    sev[s] = sev.get(s, 0) + 1
total = sum(sev.values())

lines = ["audit [{}] npm (producción): {} vulnerabilidades (críticas {}, altas {}, moderadas {}, bajas {})".format(
    os.environ["REPO"], total, sev["critical"], sev["high"], sev["moderate"], sev["low"])]
for name, v in sorted(vulns.items()):
    fix = v.get("fixAvailable")
    if fix is True:
        fix_txt = "fix disponible"
    elif isinstance(fix, dict):
        fix_txt = "fix: {}@{}{}".format(fix.get("name"), fix.get("version"), " (MAJOR)" if fix.get("isSemVerMajor") else "")
    else:
        fix_txt = "sin fix"
    lines.append("  - {} [{}] {}".format(name, v.get("severity"), fix_txt))
print("\n".join(lines))

summary = os.environ.get("GITHUB_STEP_SUMMARY")
if summary:
    with open(summary, "a") as f:
        f.write("### Auditoría de dependencias — npm (producción)\n\n```\n" + "\n".join(lines) + "\n```\n")

sys.exit(1 if os.environ["STRICT"] == "1" and (sev["critical"] or sev["high"]) else 0)
'
