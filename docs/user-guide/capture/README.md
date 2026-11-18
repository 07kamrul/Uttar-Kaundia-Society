# Capturing user-guide screenshots

The guide (`docs/user-guide/*.md`) references images as `images/<name>.png`.
`capture.mjs` takes the page-level ones automatically; the rest are mid-flow
(wizard steps, dialogs) and are listed as **MANUAL** when the script finishes.

## Rules

- **Demo data only.** Never screenshot real members — no real names, NIDs, phones or plots.
  Use a local dev database seeded with fictional people.
- Credentials are passed through env vars and never committed.

## Steps

1. Start the backend and frontend locally against a **demo** database (see root `AGENTS.md`).
2. Create one demo member account (with dues, a payment and a plot) and one demo
   super-admin account.
3. Install Playwright once:
   ```bash
   cd frontend && npm i -D playwright && npx playwright install chromium
   ```
4. Run from the repo root:
   ```bash
   GUIDE_BASE_URL=http://localhost:4200 \
   GUIDE_MEMBER_ID=<demo member id> GUIDE_MEMBER_PW=<pw> \
   GUIDE_ADMIN_ID=<demo admin email> GUIDE_ADMIN_PW=<pw> \
   node docs/user-guide/capture/capture.mjs
   ```
5. Take the MANUAL shots by hand at phone width (412×915 in Chrome DevTools device mode)
   and save them as `docs/user-guide/images/<name>.png`.
6. Optional: draw a red box around the button each step mentions.
