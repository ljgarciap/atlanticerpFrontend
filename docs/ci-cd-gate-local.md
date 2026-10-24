# Gate local, promoción y deploy manual (frontend)

> Vigente desde 2026-10-03 (ADR-009: `atlanticerp-backend/docs/adr/ADR-009-gate-local-con-recibo.md`).
> La guía completa —motivo, tabla de errores, deploy manual paso a paso, tests intermitentes— está en
> `atlanticerp-backend/docs/runbooks/ci-cd-gate-local.md`. Este archivo resume lo propio del frontend.
> **Un release completo necesita los dos repos.**

## Qué hace Actions en este repo

| Rama | Actions | Duración aprox. |
|---|---|---|
| `dev`, `test` | **Build** (`tsc` + Vite, ~1 min, porque produce el `dist/` que se sube) y deploy. **Sin Vitest.** | ~2 min |
| `master` | Build **y** Vitest (+ coverage) en paralelo, luego deploy | ~8 min |
| `hotfix/**`, PR a `master` | Build y Vitest, sin deploy | ~8 min |
| Cambios solo en `docs/**` o `*.md` | Nada | — |

Cada deploy termina verificando que el sitio responda 200.

## Preparación (una sola vez por clon)

```bash
cd atlanticerp-frontend
npm ci
git config core.hooksPath .githooks        # activa el hook pre-push (NO es automático al clonar)
```

## Flujo normal

```bash
git add … && git commit -m "tipo(scope): descripción"
infra/gate.sh                                # tsc + build + Vitest completo (~3 min); deja el recibo del commit
git push origin dev                          # Actions despliega en ~2 min

git fetch origin
git push origin origin/dev:test              # promoción: el mismo commit, ya tiene recibo
git push origin origin/dev:master            # Actions corre build + Vitest y luego despliega (~8 min)
```

- Promueva con `origin/<rama>:<destino>`, nunca con ramas locales.
- Un commit de **solo documentación** encima de uno con recibo hereda el recibo.
- `infra/gate.sh --force` repite el gate; `infra/gate.sh --check [sha]` solo consulta (exit 0/1).

## Qué comprueba el gate (`infra/gate.sh`)

1. El árbol de código **es** el commit: falla si hay cambios sin commitear o archivos sin seguir en `src`,
   `public`, `index.html`, `package*.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig*.json`,
   `tailwind.config.js`, `postcss.config.js`, `.github`. Los specs temporales `e2e/_preqa_*`, capturas e informes
   se ignoran.
2. `npm run build` (`tsc && vite build`) y que `dist/` no esté vacío.
3. `vitest run` completo con `TZ=America/Panama` (como el CI). Excluye `**/.worktrees/**` (los worktrees de
   otras sesiones duplican suites y rompen React).

El recibo queda en `~/.atlanticerp-gate/atlanticerp-frontend/<sha>`.

## Hook y deploy manual

- Si el hook bloquea el push: corra `infra/gate.sh`. **No use `--no-verify`.** Escape explícito, solo en
  emergencias aprobadas por Luis: `ATLANTICERP_SKIP_GATE=1 git push origin dev`.
- Si Actions no tiene minutos (corridas en rojo **sin pasos ejecutados**):

  ```bash
  git fetch origin && git checkout <dev|test|master> && git merge --ff-only origin/<dev|test|master>
  infra/deploy-manual.sh <dev|test|prod>      # reutiliza el recibo; reconstruye dist/ y lo sube por rsync
  ```
  Requiere la llave `~/.ssh/atlanticerp/atlanticerp-key.pem`. Haga lo mismo en `atlanticerp-backend`.

## Referencias

ADR-009 (`atlanticerp-backend/docs/adr/`) · `atlanticerp-backend/docs/runbooks/ci-cd-gate-local.md` · `.github/workflows/ci-frontend.yml` ·
`.githooks/pre-push` · `infra/gate.sh` · `infra/deploy-manual.sh`
