# Frontend — Angular 22

Read root `AGENTS.md` first. This app is the **source of truth** for behavior and
design; the Flutter app in `mobile/` ports from it.

## Layout

- `src/app/features/<area>/` — feature-first: pages/components per area
  (`auth`, `home`, `dashboard`, `member`, `management`, `public-registration`,
  `public-pages`, `public-shell`).
- `src/app/core/` — services, guards (`auth`, `permission`, `role`), interceptors,
  models, routing.
- `public/i18n/{bn,en}.json` — translations. Never hard-code user-visible strings.
- `src/styles.scss` — global styles / theme.

## Commands

```bash
npm install
npm start        # ng serve (dev server)
npm run build    # ng build
npm test         # ng test
```

## Conventions

- Standalone components (no NgModules).
- Permission checks go through the core guards/rbac service, not ad-hoc role strings.
- Browser GET cache: `src/app/core/interceptors/cache.interceptor.ts` (60s, cleared on
  writes/logout) — new write endpoints clear it; don't bypass it for authenticated GETs.
- Behavior changes to registration/payments/admin flows: read the matching
  `docs/batch*-contract.md` first.
