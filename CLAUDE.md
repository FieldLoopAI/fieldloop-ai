# FieldLoop

A contractor onboarding/management platform, building toward a voice-first field service system ("FieldLoop AI"). This repo currently holds two web apps; a third component — a native Flutter mobile app for technicians — is being built separately by another developer, informed by this repo's backend/schema but not yet part of this codebase.

1. **Registration Dashboard** (`/staff/login`, `/staff`) — internal tool for FieldLoop staff (`admin`/`onboarding`/`finance`/`support`/`jenex_dev`) to onboard contractors through an 8-step wizard. Fully wired to real Lambda + Supabase, tested end-to-end (API-level + real browser via Playwright) across all 5 staff roles.
2. **Contractor Command Dashboard** (`/`, `/dashboard`) — contractor-facing product. Login/identity, technician roster management (Section 3 — add/edit/deactivate, phone-based accounts), and job dispatch (Section 1 — create/assign jobs, real customers/technicians, schedule-conflict detection, plus voice-to-job-schedule: speak a job's details, Deepgram transcribes live and GPT-4o-mini extracts structured fields into the same create-job form) are real; the rest (invoicing, fleet, reports, etc.) is intentionally still mock data (`src/command-dashboard/dashboardData.js`) — a deliberate, not-yet-done scope boundary, actively being closed feature by feature.
3. **Mobile app (technician-facing)** — not in this repo. Native Flutter (confirmed decision — supersedes the FlutterFlow/React Native options floated in the planning docs). Its backend is this same Supabase/AWS stack: technician accounts already exist and authenticate via `phone + password` Supabase Auth (built in this repo — see `backend/functions/add-technician/`). **See `HANDOFF.md` §11** before onboarding a developer onto that build — it consolidates the four FieldLoop AI planning docs plus the real, verified schema/auth details they need, and flags where those docs genuinely disagree with each other on scope.

**Read `HANDOFF.md` before making non-trivial changes.** It's the living doc: full schema (including `CHECK` constraints and recurring bug patterns to watch for), the Lambda→route map, AWS resource names, security model, and a running log of what's been tested and what hasn't. This file is intentionally short — `HANDOFF.md` has the depth.

## Stack

React 19 + Vite (frontend) → API Gateway HTTP API → AWS Lambda (Node 20.x) → Supabase Postgres (service-role key) + AWS Secrets Manager (encrypted fields: EIN, SSN, DOB, bank details, Stripe keys — never stored in plaintext or sent to the browser).

**External vendors, live and billable**: Deepgram (speech-to-text) and OpenAI/GPT-4o-mini (structured extraction) power voice-to-job-schedule (HANDOFF.md §17) — both real, working, paid APIs as of this writing, keys in `fieldloop/deepgram-credentials` / `fieldloop/openai-api-key`. Twilio (SMS) and SES (email), used for technician credential delivery (§10), are scaffolded but **not yet live** — no secret populated, calls no-op gracefully.

## Commands

```powershell
npm run dev              # Vite dev server, http://localhost:5173
npm run build             # production build
npm run lint              # oxlint
```

**Deploying a Lambda change** (from `backend/functions/`):
```powershell
.\package-lambda.ps1 -FunctionName <name>
aws lambda update-function-code --function-name fieldloop-<name> --zip-file fileb://<name>/function.zip
```
`backend/functions/shared/` is the master copy of shared helpers (`auth.js`, `supabaseClient.js`, `secrets.js`, `ipAllowlist.js`, `contractorDraft.js`) — after editing one, copy it into every function folder's own `shared/` before packaging (no Lambda Layer is set up).

**Browser-driven testing**: Playwright is a real `devDependency`. Fresh checkout needs `npx playwright install chromium` once. No project skill exists yet for driving this app — worth generating one via `/run-skill-generator` if this becomes routine.

## Known gotchas (see `HANDOFF.md` for full detail)

- **Dev server must run on port 5173.** API Gateway's CORS `AllowOrigins` is hardcoded to `http://localhost:5173` — if a stale `npm run dev` from an earlier session is squatting on that port, Vite silently picks 5174+/5177 and every Lambda call fails client-side with an opaque `Failed to fetch`. Check `netstat -ano | grep 517` for stale `node.exe` processes if this happens.
- **Schema columns that look like status enums are sometimes real `timestamptz` columns**, and several text columns have `CHECK` constraints requiring specific lowercase/snake_case values that don't match older mock-UI display text. Before wiring a new `<select>` to a DB column, check for a constraint first: `select conname, pg_get_constraintdef(oid) from pg_constraint where contype='c' and conrelid::regclass::text = '<table>';`
- **`revealedValues` in `RegistrationDashboard.jsx` is keyed by stable column name** (e.g. `'dob_ref'`), never by the field's current `*_ref` value — the latter is `undefined` for brand-new contractors and would collide every unset field onto the same key.
- Never forward masked display placeholders (e.g. `"••••••••1212"`) to a save call as if real — only send a plaintext value when the user actually revealed/edited it.
- **Deepgram's short-lived streaming JWT authenticates via `Sec-WebSocket-Protocol: ['bearer', jwt]`**, not a query parameter and not the `['token', apiKey]` trick used for static API keys — a plausible-looking third-party example led to a wrong first implementation here (see HANDOFF.md §17 for the full story and why it's worth verifying vendor auth mechanisms empirically rather than trusting secondary sources).

## Test accounts (disposable, live in Supabase)

- Staff: `test-onboarding@example.com` / `test-finance@example.com` / `test-support@example.com`, password `TestPass123!FL` — reuse for role-based testing rather than recreating.
- Contractor: `pw-contractor-1785321789808@example.com` / `TestPass123!FL` (owner_admin).
- `jenex_dev` role has no test account yet.
- Technician mobile login can't be tested end-to-end yet — Supabase's Phone auth provider is disabled project-wide (see `HANDOFF.md` §10/§11).
