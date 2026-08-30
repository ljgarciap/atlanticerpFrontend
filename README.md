# AtlanticERP — Frontend (CRM Atlantic)

SPA del CRM comercial para **Atlantic** (empresa de diseño y suministro de iluminación).
Consume la API del repo hermano [`atlanticerp-backend`](../atlanticerp-backend) (Laravel 12, multi-tenant)
y reemplaza un mock HTML+Supabase con una plataforma real.

Cubre los módulos **CRM** (pipeline de proyectos, actividades, contactos) e **Installations**
(casos de instalación/garantía). La identidad visual debe respetar los colores y componentes
de marca de Atlantic (ver tokens CSS en `atlanticerp/CLAUDE.md`).

---

## Stack

| Componente | Tecnología |
|---|---|
| Framework | React 18 + Vite + TypeScript |
| Server state | TanStack Query v5 (`@tanstack/react-query`) |
| UI state | Zustand |
| Routing | React Router v6 |
| Estilos | Tailwind CSS |
| Forms | React Hook Form + Zod |
| Charts | Chart.js 4 (`react-chartjs-2`) |
| HTTP | Axios |
| Tests | Vitest + Testing Library |

---

## Instalación y desarrollo

```bash
npm install
npm run dev
```

El dev server de Vite corre en `http://localhost:5173` por defecto (puerto configurado en
`vite.config.ts`). En desarrollo, las llamadas a `/api` se redirigen vía proxy de Vite hacia
`http://localhost:8090` (el puerto de Nginx del backend local — ver `vite.config.ts`).

---

## Build de producción

```bash
npm run build
```

Genera el build estático en `dist/`. Ese directorio es el que monta el contenedor `nginx`
del backend (`infra/docker-compose.yml` de `atlanticerp-backend`) para servir la SPA junto con el
proxy a la API Laravel.

Otros scripts disponibles (`package.json`):
```bash
npm run preview   # sirve el build de dist/ localmente para verificarlo
npm run test       # Vitest
npm run lint        # ESLint sobre src/
```

---

## Variables de entorno

Actualmente no existen archivos `.env.development` / `.env.production` en este repo — las
llamadas a la API usan rutas relativas (`/api`) resueltas vía el proxy de Vite en desarrollo
y vía Nginx en producción/contenedores, por lo que no se ha necesitado una variable de
`BASE_URL` explícita todavía. Si se agregan variables de entorno (prefijo `VITE_` requerido
por Vite para exponerlas al cliente), documentarlas aquí y mantener un `.env.example`.

---

## Estructura del proyecto

```
src/
├── api/            llamadas HTTP (authApi.ts, projectsApi.ts)
├── components/      AtlanticLogo, TopBar, KpiGrid, KanbanBoard, ProjectCard,
│                    ProjectModal, ActivityTimeline, AlertBanner
├── pages/           LoginPage, DashboardPage
├── store/           authStore.ts (Zustand)
├── types/           auth.ts, project.ts
├── App.tsx
└── main.tsx
```

> Nota: esta es la estructura real al momento de escribir este README (Fase 0/1 del
> proyecto). El login y el dashboard están en construcción — no asumir que el flujo de
> autenticación end-to-end ya funciona contra el backend real sin verificarlo primero.

---

## Referencia

Diseño de arquitectura completo, identidad de marca y convenciones del proyecto:
ver `../CLAUDE.md` (carpeta padre `atlanticerp/`).
