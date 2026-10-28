# e2e-archivo — specs históricos heredados de binax

Estos specs (`preqa-*`, `visual-review-*`, el smoke de producción de `scrum926`) son reportes ejecutables de Pre-QA de tickets de binax (agosto–septiembre de 2026).
Se archivaron porque dependen de otro entorno y no tienen sentido para Atlantic: apuntaban a `dev.*`/`test.*`, usaban `ssh` y `tinker` contra servidores que no existen, y esperaban datos de tickets concretos.

- **No se ejecutan**: Playwright solo recorre `e2e/` (`testDir` en `playwright.config.ts`).
- **No se perdió nada**: se movieron con `git mv`, el historial de cada archivo se conserva.
- **Referencias relativas rotas a propósito**: los que importaban `./fixtures` o capturas de `e2e/` ya no resuelven. Si alguno se rescata, hay que copiarle sus fixtures.
- **Cómo rescatar uno**: `git mv e2e-archivo/<spec> e2e/`, apuntarlo a `E2E_BASE_URL` y adaptar sus datos al seed de Atlantic.
- La cobertura vigente es el humo (`npm run e2e:humo`) y los specs permanentes que quedan en `e2e/`.
