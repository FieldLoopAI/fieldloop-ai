# Mobile Team Handoff — FieldLoop AI Technician App

Context file for an AI coding agent starting the native Flutter technician
app in a **separate repository**. This repo (`FieldLoop`) holds two web
apps and the entire shared backend; the Flutter app is not in this repo and
is being built by a different developer. This file is a snapshot as of the
current session — verify against `HANDOFF.md` and `CLAUDE.md` in the
`FieldLoop` repo if it's available to you, since those are the living
source of truth and may have moved on since this was written.

---

## 1. Project Overview

- **FieldLoop** = a contractor onboarding/management platform, building
  toward **FieldLoop AI**, a voice-first field service system.
- Three components total:
  1. **Registration Dashboard** — internal staff tool (FieldLoop employees
     onboard/manage contractor accounts). Not mobile-relevant.
  2. **Contractor Command Dashboard** — web app for the contractor's own
     office/dispatcher staff (job dispatch, technician roster, etc.).
     Its backend is what the mobile app also uses.
  3. **Mobile app (this handoff's subject)** — native Flutter, **technician-
     facing only**. Not in the `FieldLoop` repo. Backend/auth is already
     built there and is what this file describes.
- **Stack (shared across all three)**: React/Vite web apps → AWS API
  Gateway (HTTP API) → AWS Lambda (Node 20.x) → Supabase Postgres
  (service-role key) + AWS Secrets Manager for encrypted fields. **New
  mobile-facing endpoints should follow this same Lambda + API Gateway +
  Supabase pattern** unless a specific reason not to (see §6 re: Lambda
  cold-starts vs. persistent voice connections — unresolved).
- **Who the mobile app is for**: field technicians employed by a
  contractor. They do NOT have web dashboard access — technician accounts
  are deliberately kept off the web (see §2). The mobile app is their only
  way to interact with FieldLoop.
- **System boundary** (confirmed by the project owner, not up for debate):
  FieldLoop's responsibility starts the moment a job record is created and
  ends when the platform fee is collected and the retention sequence
  completes. No lead generation, marketing, or scheduling logic — those
  stay the contractor's own systems.

---

## 2. Knowledge Base Summary — Decisions & Context Relevant to Mobile

> Note: this repo also has a distinctly-named internal staff tool for
> *drafting and approving* knowledge-base content (admin/onboarding-only,
> web dashboard) — that curation tool itself is not mobile-facing. The
> content it approves **is** mobile-facing, though — see §2.5, which is
> the real technician-facing retrieval endpoint built on top of it.

### 2.1 Mobile framework — confirmed, final
- **Native Flutter.** This supersedes FlutterFlow and React Native, both
  of which were floated in earlier planning documents (not in this repo —
  see `Fieldloop Docs\` sibling folder: `FieldLoop_AI_Prototype_6-Week_
  Roadmap*.docx`, `FieldLoop_AI_Master_Implementation_Guide_v2.docx`,
  `FieldLoop_Pre-Implementation_Review.docx`, `FieldLoop_AI_Contractor_
  Walkthrough_CONFIDENTIAL.pdf`).
- **Why**: FlutterFlow was the original pick in two of the four planning
  docs. A third doc (Pre-Implementation Review) argued FlutterFlow can't
  reliably do background GPS, streaming voice, or Bluetooth headset
  session control — recommended hand-coded Flutter or React Native
  (Expo bare) instead. The project owner directly confirmed **native
  Flutter** as the final decision, overriding all four docs. None of the
  four documents reflect this exact choice — treat the direct confirmation
  as current truth over any of them.

### 2.2 Auth flow — technician identity is phone-based, plus email when on file
- A technician's login **is their mobile phone number** by default — this
  was a deliberate, confirmed design decision (reversed once from an
  initial email-based mistake — see §3). **Updated**: as of §2.2c below,
  a technician who has an email on file gets that registered as a second,
  equally-real Auth identity, and `signInWithPassword({ email, password })`
  is manually tested and confirmed working today — not just phone. See
  §2.2c for the full mechanism and §4 for the current, corrected state of
  the Phone-provider blocker (it no longer blocks every technician).
- Technicians get **no web dashboard access at all**. When a contractor's
  `owner_admin` creates a technician, **no `contractor_users` row is ever
  created** for them — that row is what gates the web Contractor Command
  Dashboard, and that dashboard currently has zero per-role content
  gating (any `contractor_users` session sees the full company view). A
  technician must only ever be able to reach the mobile app.
- **Credential creation flow (current, as of this session)** — replaced an
  earlier raw-password-over-SMS design:
  1. Contractor's `owner_admin` adds a technician via the web dashboard
     (name, mobile phone — required, this is their login — optional
     email, role, certs, rates, delivery channel).
  2. Backend creates a Supabase Auth user via
     `supabase.auth.admin.createUser({ phone, password, phone_confirm: true, user_metadata: { must_change_password: true, contractor_id } })`.
     The `password` here is an internal-only, cryptographically random
     value that is **never shown to anyone** (no SMS, no email, no API
     response, no log) — it exists only so the Auth user has *something*
     to authenticate with until the technician sets a real one.
  3. Backend issues a one-time **setup link** (not a password) — a
     256-bit token, SHA-256 hashed before storage, 48-hour expiry — and
     sends it via SMS/email (or shows it once in the admin UI if delivery
     isn't configured, which it currently isn't — see §4).
  4. The technician opens the link (currently a **web fallback page**,
     since no mobile app exists yet — this is exactly what your Flutter
     app's deep link should eventually replace) and chooses their own
     password (8+ characters, no complexity rule — technicians are field
     workers typing on a phone).
  5. That calls `POST {API_BASE_URL}/technicians/complete-setup` — **no
     auth header, this is the one unauthenticated endpoint in the whole
     backend**, auth = possession of a valid/unexpired/unused token.
     - Request: `{ "token": "...", "new_password": "..." }`
     - Success: `{ "success": true }` — **no session returned**.
     - All failure cases (invalid, expired, already used, deactivated
       technician) return the **identical** generic error:
       `{ "error": "This setup link is invalid or has expired." }` —
       deliberately indistinguishable, don't try to tell them apart.
     - On success, the real Auth password is set, `technicians.
       password_changed` flips to `true`, `invite_status` flips to
       `'active'`, and every other outstanding setup token for that
       technician is invalidated.
  6. **Sign-in is a separate call**, identical for first-ever login and
     every login after: `supabase.auth.signInWithPassword({ phone,
     password })`.
- **⚠ Flag for the mobile team to confirm with the dashboard/backend
  team**: `user_metadata.must_change_password: true` was set at account
  creation as part of an *earlier* design (raw password delivered
  directly, mobile app expected to force a change on first login and
  clear the flag via `auth.updateUser()`). Under the **current** setup-
  link flow, the technician already sets their real password *before*
  ever reaching the mobile app, via `complete-technician-setup` — meaning
  by the time they first sign into your app, they've already chosen a
  real password. **It's unconfirmed whether `must_change_password` is
  still being set at all in the current flow, or whether it's a leftover
  flag from the superseded design that no longer needs mobile-side
  handling.** Don't build a forced-password-reset screen around this flag
  without checking current backend behavior first — it may be dead logic.
- **Deep link target** (once you have a real domain): `{SETUP_BASE_URL}/
  technician-setup?token=...`. An HTTPS universal link was deliberately
  chosen over a custom URI scheme (`fieldloop://`) because SMS clients
  often won't linkify non-http(s) schemes as tappable text. `SETUP_BASE_URL`
  is currently a **placeholder** (`https://app.fieldloop.io`) — no real
  hosting domain exists yet. You'll need a real domain before you can
  register iOS Associated Domains / Android App Links against it.

### 2.2a Setup-flow: in-app code (Flow A) — built, deployed, verified live. This is your contract.

Two delivery flows were evaluated for how a technician finishes setup:
**Flow A** (short human-typable code, entered on an in-app "Have a setup
code?" screen) vs. **Flow B** (a tokenized link opening a web page —
what existed before this session, §2.2 above). **Flow A was chosen,
built, and deployed** — primarily because Flow B needs a production
domain plus iOS Associated Domains / Android App Links verification to
open *in the app* rather than a browser, and neither exists yet
(`SETUP_BASE_URL` is still a placeholder, §2.2). Flow A skips that
dependency and keeps the whole setup flow in one app.

**Both flows are live simultaneously, not either/or** — the exact same
`add-technician` call issues *both* a code and a link together (same
underlying `technician_setup_tokens` row, shared expiry, completing via
either invalidates both). Build against the code path below; the web
page/link still works unchanged as a fallback you don't need to think
about.

**Your contract — `POST {API_BASE_URL}/technicians/complete-setup`, no
auth header:**

```json
{ "phone": "+19415551234", "code": "AB3D-3F9K", "new_password": "..." }
```

- `phone`: the technician's login phone, any format your app collects —
  the backend normalizes it. `code`: what the technician typed; dashes
  and case don't matter (`ab3d3f9k` and `AB3D-3F9K` are equivalent) — no
  client-side normalization needed, send exactly what they typed.
  `new_password`: 8+ characters, no complexity rule.
- Success: `{ "success": true }` — **no session returned**, same as
  before. Immediately follow with `supabase.auth.signInWithPassword({
  phone, password })`, identical to first-ever and every later login.
- **Every failure case returns the identical generic error**:
  `{ "error": "This setup code or link is invalid or has expired." }` —
  wrong code, expired, already used, deactivated technician, unknown
  phone number, *or currently locked out* all look the same from the
  outside. Don't try to distinguish them or show a "5 attempts remaining"
  counter — the backend deliberately gives you nothing to build that
  from, on purpose.
- **Lockout**: 5 wrong codes for the same technician (by phone) locks
  that technician out for 15 minutes — during which even the *correct*
  code is rejected with the same generic error. This is enforced
  entirely server-side; nothing for your app to implement beyond
  surfacing the generic error message and letting the technician retry
  later. If you want a "resend code" affordance in the UI, it's the
  existing `resend-technician-setup` flow (owner_admin-only, so this
  would be the contractor re-sending it, not the technician
  self-serving) — there's no technician-initiated resend endpoint.

The original `{ token, new_password }` shape (§2.2 step 5, the web link)
still works unchanged if you ever need it, but the code path above is
what your "Have a setup code?" screen should call.

**Verified live** (this session): real disposable technician created via
`add-technician`, correct code → `{"success":true}` and
`password_changed`/`invite_status` flipped correctly in the DB; a second
technician sent 5 wrong codes, then a follow-up attempt using their
*actual correct* code was still rejected — confirmed the lockout blocks
a correct code once triggered, not just wrong ones.

### 2.2b Password storage — concrete answer

- **Supabase Auth (`auth.users`) is the only place a password is ever
  stored.** Supabase hashes it (bcrypt) internally; no FieldLoop code —
  Lambda or otherwise — ever sees or persists a raw or hashed password.
- `technicians.auth_user_id` (uuid) is the link to `auth.users`. Confirmed
  live against the schema: **the `technicians` table has no
  `password_hash` column at all** (unlike `fl_users`/`contractor_users`,
  which have an unused legacy one from an older design — don't follow that
  pattern here, it's dead).
- `technicians.password_changed` (bool) and `technicians.invite_status`
  are the only app-visible state flags around this — both already wired
  by `complete-technician-setup` (§2.2 step 5).

### 2.2c Auth flow, step by step (mobile app login screen: identifier + password)

1. App collects `identifier` (email or phone) + `password`. Client-side,
   normalize: if it looks like a phone, convert to E.164; otherwise treat
   as email.
2. **This session also fixed a real gap**: previously, `add-technician`
   only ever registered a **phone** identity in `auth.users` — never an
   email one, even when the technician had an email on file. That meant
   typing an email into the identifier field would always fail to sign in,
   silently contradicting the finalized "email or phone" login screen.
   Fixed (pending deploy — see §3): `add-technician` now also passes
   `email` + `email_confirm: true` to `auth.admin.createUser()` whenever
   an email is on file, registering it as a second, pre-confirmed identity
   on the same Auth user. `update-technician` mirrors this — if a
   technician's email is added or changed later, it's synced to the Auth
   user the same way, parallel to the existing phone-change handling.
3. App calls `supabase.auth.signInWithPassword({ phone, password })` or
   `{ email, password })` depending on which identifier type was entered.
   Supabase verifies against `auth.users` internally.
4. On success, Supabase returns a JWT (access token, `sub` claim =
   `auth.uid()` = the technician's `auth_user_id`) + a refresh token.
   Store both in secure storage.
5. Attach the JWT as `Authorization: Bearer <token>` on every call to a
   FieldLoop Lambda — same pattern `src/shared/services/api.js` already
   uses for the web dashboards. The Lambda decodes it, looks up the
   technician by `auth_user_id`, and enforces `contractor_id` scoping
   explicitly in its own query (same shape as `requireContractorRole`
   elsewhere in this codebase).
6. RLS is **not** involved in step 5 — every existing Lambda uses the
   Supabase service-role key, which bypasses RLS entirely; authorization
   is enforced by hand in each Lambda's `WHERE` clause instead. RLS only
   matters if your app ever queries Supabase directly with the anon key +
   technician JWT — see the gotcha in §2.2d.

### 2.2d ⚠ RLS gotcha — `get_my_contractor_id()` doesn't know about technicians

The tenant-isolation RLS policy on every product table (`customers`,
`jobs`, `technicians`, `vehicles`, etc. — §3) is `contractor_id =
get_my_contractor_id()`. That function (`backend/sql/
004_fix_get_my_contractor_id_recursion.sql`) is `security definer` and
does exactly this:

```sql
select contractor_id from contractor_users where auth_user_id = auth.uid() limit 1;
```

It only ever looks at `contractor_users` — and technicians **deliberately
never get a `contractor_users` row** (§2.2, "no web dashboard access").
So if your app ever queries Supabase directly (client SDK, anon key +
technician JWT) instead of going through a Lambda, every tenant-isolated
RLS policy will resolve `get_my_contractor_id()` to `null` for a
technician and **silently return zero rows** — not an error, just an
empty result set, including for a technician trying to read their own
`technicians` row. This has never been hit yet because nothing currently
queries Supabase directly with a technician session.

**Resolved (this session): the mobile app is Lambda-mediated only, full
stop — no direct Supabase table queries from a technician session,
ever.** This matches how both existing web dashboards already work (every
client in this repo goes through a Lambda with the service-role key; RLS
never enters the picture for any of them), so it's not a new constraint,
just making an existing pattern explicit for a team that didn't write it.

Worth being explicit about *why* this needed saying out loud: Supabase's
own docs and most tutorials push the opposite pattern — client SDK
querying tables directly, RLS doing the authorization — because that's
Supabase's actual selling point, and it's *required* for Supabase
Realtime specifically (no Lambda-mediated equivalent exists in this
stack). A developer new to this repo could reasonably default to that
idiom without knowing it's wrong here. If Realtime (or any other
direct-access use case — offline caching, etc.) becomes a real
requirement later, that decision has to be revisited deliberately and
`get_my_contractor_id()` extended to also check
`technicians.auth_user_id` first (a real migration + re-verification of
the recursion-safety that function already had one bug around once — see
the migration file's own comments) — not silently reached for as a
shortcut.

### 2.3 The interaction model (voice-first design, not yet built anywhere)
- Wake word **"FieldLoop"** + a **direction word** carrying intent — e.g.
  *"FieldLoop, Photos"*, *"FieldLoop, Prepare Estimate"*, *"FieldLoop,
  Job Complete"*.
- Every voice command has a **bilingual (English/Spanish)** equivalent.
- **Every voice action has a visible on-screen button as a silent
  failsafe** — jobsites are loud, phones mishear; voice is the fast path,
  never the only path. Build the on-screen path first-class, not as an
  afterthought.

### 2.4 The 8-beat job spine (every job follows this shape)
| Beat | What happens | Driven by |
|---|---|---|
| 1. Intake | Job created: address, contact, problem, parts hint, appointment | Contractor's dispatcher (web) |
| 2. Assign & notify | Job pushed to a technician's phone as their Active Job | Dispatcher → mobile app |
| 3. En route | Tech taps En Route; navigation launches; job data cached offline | Technician + app |
| 4. Arrival | Geofence (or manual "I've Arrived" failsafe) starts the labor clock | GPS + failsafe toggle |
| 5. Assess | Photos + spoken notes archived; troubleshooting/coaching on demand | Technician voice + AI |
| 6. Estimate | Proposal built by voice, reviewed, sent, signed | Technician voice + customer |
| 7. Execute & invoice | Work done; change orders; usage logged; invoice compiled; payment taken | Technician + Stripe Connect |
| 8. Retain | Automated follow-up sequence (24hr/48hr/3mo/12mo) | **Backend, no human touch** — not mobile scope |

- A **`Project` vs `Service Call`** flag at intake changes downstream
  behavior (Project = multi-day labor tracking, phased estimating,
  milestone billing e.g. 30% deposit before the job hits the dispatch
  board). **No schema support for this exists yet** — see §4.

### 2.5 Knowledge base retrieval — built, deployed, verified live. This is your contract for Beat 5 (Assess).

This is the "technician asks a question, gets a real answer" endpoint referenced in §2 above. Built and verified against a real 500-fact dataset (concrete driveway construction) — the mechanism is proven; content coverage today is limited to that one trade/subcategory, more to be imported over time by the client.

**Update 2026-08-10**: the client committed to authoring content for all 4 launch trades and asked that trade segmentation be a real structural guarantee, not just a trusted filter — the backend now stores `kb_entries` as a native Postgres table physically partitioned by trade (one partition per trade, e.g. all `concrete_and_pavers` rows live in a separate physical table from `roofing` rows), and this has been empirically verified: the same question asked against a different trade correctly returns `no_match` rather than a wrong-trade answer. This is purely a backend storage detail — **nothing about the `/kb/trades` or `/kb/search` request/response contract below changed**, it's documented here only as reassurance that cross-trade term collisions (e.g. "depth" meaning something different in concrete vs. roofing) can't leak through. All 4 trades (`concrete_and_pavers`, `general_contractor`, `roofing`, `insulation`) now exist and are discoverable via `/kb/trades`; only `concrete_and_pavers` has real content imported so far — expect `no_match` for the other 3 until the client imports their content.

**Auth**: same `Authorization: Bearer <technician JWT>` you already use everywhere else (§2.2c) — no new auth mechanism. Both endpoints below also accept a contractor-side JWT (dashboard use), but your app only ever sends a technician one.

**Step 1 — discover valid trade/subcategory slugs**: `POST {API_BASE_URL}/kb/trades`, empty body.
```json
{
  "trades": [
    {
      "slug": "concrete_and_pavers",
      "name": "Concrete & Pavers",
      "subcategories": [
        { "slug": "driveway_concrete", "name": "Driveway Concrete" }
      ]
    }
  ]
}
```
Call this once (e.g. on app start or when entering the Assess flow) rather than hardcoding slugs — the list will grow as the client imports more trades. This endpoint exists specifically so your app never needs to query Supabase directly for this (§2.2d's Lambda-mediated-only rule stays intact).

**Step 2 — ask a question**: `POST {API_BASE_URL}/kb/search`
```json
{ "question": "What compaction density do I need for the subgrade?", "trade_slug": "concrete_and_pavers", "subcategory_slug": "driveway_concrete" }
```
`subcategory_slug` is optional (omit to search the whole trade). Response shape varies by how confident the match was — **check the `source` field**, don't assume `answer` is always present the same way:

```json
// source: "retrieval" — a confident direct match, no LLM involved, fastest/cheapest path
{ "answer": "...", "fact_title": "...", "verify_locally": true, "source": "retrieval", "similarity": 0.78 }

// source: "llm_escalation" — no single confident match; an LLM synthesized an answer
// from the top few candidates (or said it doesn't know, if none actually apply)
{ "answer": "...", "verify_locally": true, "source": "llm_escalation", "matches": [ { "fact_title": "...", "similarity": 0.55 } ] }

// source: "no_match" — nothing in the knowledge base was even a rough candidate
{ "answer": "The knowledge base doesn't have anything on this yet.", "source": "no_match", "verify_locally": false, "matches": [] }
```

**Two UI requirements, not optional, both already decided with the client — don't build a screen that skips either**:
1. **Per-answer caveat**: whenever `verify_locally: true`, render a visually distinct caveat — not just another sentence in the answer text — e.g. *"⚠️ This may vary by local code/jurisdiction — verify with your local building department before relying on it."* (`Fieldloop Docs\FieldLoop_KB_Technical_Design.md` §4.4/§6 has the client-approved wording.)
2. **Session-opening disclaimer** — confirmed with the client 2026-08-10, **not yet built anywhere, purely a mobile-side requirement**: before a technician asks their *first* question in a job-site session, show/speak: *"Do not rely on AI sources for construction codes or specifications; contractors must independently confirm all actual requirements."* This is separate from the per-answer caveat above — it's a one-time session-start warning, not per-answer.

**What's still open, not resolved by this build**:
- The confidence threshold (0.70) that decides `retrieval` vs. `llm_escalation` is real but provisional — expect it to keep getting tuned as more real usage happens; don't hardcode assumptions about exactly where that line sits.
- No caching, no rate-limiting on this endpoint yet — each call does a real embedding + search, and sometimes a real LLM call. Not a blocker, just don't hammer it in a tight loop while testing.
- Content coverage is one trade/subcategory today (`concrete_and_pavers` / `driveway_concrete`), even though all 4 trades now exist structurally (see the partitioning update above). A `no_match` response for anything outside concrete driveways is expected, not a bug.

---

## 3. What's Done — Backend/Schema Ready for Mobile to Integrate With

- **Technician creation, editing, deactivation** — all live, real Lambdas,
  tested against the live stack:
  - `POST /technicians` (`add-technician`, owner_admin only) — creates the
    Auth user + `technicians` row + setup token, per §2.2's flow. **As of
    this session**, if an email is on file it's also registered as a
    second, pre-confirmed Auth identity (`email_confirm: true`) alongside
    the phone one — see §2.2c — so "sign in with email" actually has
    something to match against. **Deployed and verified live** — a direct
    `auth.admin.createUser()` call with the same combined
    `{ phone, phone_confirm, email, email_confirm }` shape now in
    production returned both identities present and confirmed.
  - `POST /technicians/update` (`update-technician`) — partial update;
    if `mobile_phone` changes, moves the Auth account's phone in lockstep
    and (if the technician hasn't completed setup yet) invalidates old
    setup tokens and issues a fresh one to the corrected number. **As of
    this session**, an email add/change is synced to the Auth identity the
    same way (§2.2c) — deployed, same verification as above.
  - `POST /technicians/deactivate` (`deactivate-technician`) — soft-delete
    (`technicians.is_active = false`, not a hard delete — `technicians` is
    referenced by job history), bans the Auth account (~100 year ban, not
    deleted — keeps `auth_user_id` valid for historical job records),
    auto-unassigns the tech's `draft`/`scheduled` jobs only (completed job
    history is left untouched).
  - `POST /technicians/resend-setup` (`resend-technician-setup`) — issues
    a new setup token without invalidating an existing unexpired one
    (both stay valid until whichever is used first).
  - `POST /technicians/complete-setup` (`complete-technician-setup`) —
    **the endpoint your app's first-login flow calls**. Accepts either
    `{ token, new_password }` (web-link path, §2.2) or
    `{ phone, code, new_password }` (in-app code path — **use this one**,
    full contract in §2.2a, deployed and verified live this session,
    including the 5-attempt/15-minute lockout).
- **Real Supabase schema for the product domain** (confirmed live, not
  assumed): `customers`, `technicians`, `vehicles`, `jobs`,
  `job_technician_assignments`, `field_events`, `estimates_and_change_
  orders`, `invoices`, `data_export_requests` — all with proper
  tenant-isolation RLS (`contractor_id = get_my_contractor_id()`).
- **`jobs.status`** — empirically confirmed valid values (probe-inserted
  and verified, not guessed): `draft`, `scheduled`, `en_route`, `on_site`,
  `complete`, `closed`, `invoiced`, `paid`. This is a **different
  vocabulary** than what any planning doc guessed — use these exact
  strings.
- **Job dispatch (web side, Beat 1–2)** — `create-job`, `list-jobs`,
  `assign-job` Lambdas already push a technician assignment into
  `jobs.lead_technician_id` / `job_technician_assignments`. This is what
  your app's "Active Job" (Beat 2) should read from once a job is
  assigned to a technician.
- **Knowledge base retrieval (Beat 5 — Assess)** — `POST /kb/trades`
  (discover valid slugs) and `POST /kb/search` (ask a question, get a
  confidence-gated answer), both accepting your technician JWT directly.
  **Deployed and verified live** against a real 500-fact dataset — full
  contract, response shapes, and the two required UI caveats in §2.5.
- **Messaging delivery adapter** — a shared helper
  (`backend/functions/shared/messagingAdapter.js`) with three provider
  modes (`dev_log` / `dev_email` / `prod_sms`, currently defaulted to
  `dev_email`) already routes technician setup-link delivery. Reusable
  pattern if the mobile app needs its own outbound SMS/email later
  (proposal links, change-order approval texts, etc.).
- **Voice pipeline reference implementation exists (web side only, not
  mobile, but a proven pattern)** — the Contractor Command Dashboard's
  "voice-to-job-schedule" feature is a real, live-verified example of
  Deepgram streaming STT (JWT minted server-side via `POST /v1/auth/
  grant`, browser connects directly to Deepgram using
  `Sec-WebSocket-Protocol: ['bearer', jwt]` — **not** a query parameter,
  a wrong secondary source suggested that first and it silently failed)
  + GPT-4o-mini structured extraction from the transcript. If your app's
  voice pipeline follows a similar shape, this is a working reference to
  copy the pattern from, not something mobile calls directly.
- **AWS Secrets Manager convention**: every vendor credential lives at
  `fieldloop/<vendor>-credentials` (or `-api-key`), fetched server-side
  only, never sent to any client. Established secrets: Supabase
  service-role key, Deepgram, OpenAI. **Groq** was recently documented for
  provisioning (`fieldloop/groq-api-key`) as a candidate LLM vendor for
  the mobile voice/AI pipeline — **⚠ not confirmed whether this secret has
  actually been created yet or whether anything integrates with it** —
  verify before assuming it exists.

---

## 4. What's Not Done / In Progress (backend/dashboard side)

- **🟡 Partial blocker, corrected from an earlier version of this doc:
  Supabase's Phone auth provider is still disabled project-wide**, so
  `supabase.auth.signInWithPassword({ phone, password })` still fails
  with `AuthApiError: Phone logins are disabled` /
  `code: 'phone_provider_disabled'` until Authentication → Providers →
  **Phone** is enabled in the Supabase dashboard. **This is no longer a
  block on technician sign-in overall** — per §2.2c, `add-technician`
  registers an email identity on the same Auth account whenever the
  technician has one on file, and `signInWithPassword({ email, password
  })` is **manually tested and confirmed working right now**, live sign-in,
  not just account creation. Build your login screen to accept either
  identifier as originally planned (§2.2c) — email sign-in genuinely works
  today; only a technician with **no email at all** is still fully
  blocked, and only for them does enabling Phone auth remain a real
  prerequisite. Enabling it may require picking an SMS provider
  (Twilio/MessageBird/Vonage/TextLocal) to save the toggle — unconfirmed
  whether that's a hard requirement for password-based sign-in
  specifically, or only for OTP-based sign-in. No SMS provider credentials
  exist yet on the project owner's side as of this writing.
- **Twilio/SES not configured** — `fieldloop/twilio-credentials` and
  `fieldloop/ses-credentials` don't exist in Secrets Manager. Setup-link
  delivery currently no-ops gracefully (falls back to `dev_email` mode or
  showing the link once in the admin UI) — real SMS delivery to
  technicians isn't live yet.
- **`SETUP_BASE_URL` is a placeholder** (`https://app.fieldloop.io`) — see
  §2.2. No real domain provisioned.
- **No `Project` vs `Service Call` schema support** — `jobs.job_type`
  CHECK constraint currently accepts **only** `'service_call'` (confirmed
  by probe-testing ~20 candidate values, all others rejected). The
  milestone-billing / phased-estimating behavior described in the
  planning docs for "Project" mode has no backend support at all yet — a
  migration would be needed before any Project-type job could exist.
- **No photo/video/media upload pattern exists anywhere in this repo** —
  confirmed via a full repo search (backend + frontend) before this was
  written. No Supabase Storage bucket usage, no S3 upload Lambda, no
  multipart handling anywhere. Beat 5 (Assess — "photos archived") has
  **zero backend support today**. This is new ground for whoever builds
  it — likely needs a joint decision (mobile team + backend) on Supabase
  Storage vs. S3, not something to assume is "mobile-only" work.
- **`get_my_contractor_id()` has no path for technicians** (§2.2d) — fine
  today since nothing queries Supabase directly with a technician session,
  but a real landmine (silent empty results, not an error) the moment
  anything does. Needs an explicit decision before direct-Supabase access
  is used from the mobile app.
- **No voice-to-estimate extraction, no real-time on-site checklist/
  gap-flagging engine.** These remain unbuilt. **Updated — no longer true
  of question-answering specifically**: a technician-facing retrieval
  endpoint now exists and is deployed/verified (`/kb/trades`, `/kb/search`
  — full contract in §2.5). What's still missing is the *voice* layer on
  top of it (wake word, wiring a spoken question into `/kb/search`, the
  session-opening disclaimer) — that part is genuinely mobile-side work,
  not backend.

---

## 5. Explicitly Out of Scope for Dashboard/Backend — Required on Mobile Side

- **First-time login detection + forced password-reset screen** — ⚠ see
  the flag in §2.2: confirm with the backend team whether
  `must_change_password` is still meaningfully set before building UI
  around it; it may be a leftover flag from a superseded design.
- **Home screen and all subsequent technician-facing screens** — job
  list, Active Job view, navigation/routing UI, everything.
- **En route / arrival flow** — navigation launch, offline job-data
  caching, geofence-based labor-clock start, and the manual "I've
  Arrived" failsafe toggle (Beat 3–4).
- **Assess beat (Beat 5)** — photo capture and spoken-notes capture UI
  **still require new backend work** (media upload pipeline — see §4),
  not purely mobile-side. The troubleshooting/coaching-on-demand half of
  this beat is different: the backend (`/kb/trades` + `/kb/search`, §2.5)
  is built and deployed — what's left there is purely mobile-side (voice
  UI, wiring a spoken question into the endpoint, the two required
  caveats).
- **Estimate building (Beat 6)** — voice-driven proposal construction,
  review, send, e-signature capture. **Pricing model (single price vs.
  tiered Good/Better/Best) is unresolved for this specific mobile
  flow** — see §6. Do not assume the unrelated staff-side "Knowledge
  Base" feature's single-price decision applies here; that was scoped to
  a different feature entirely.
- **Change orders, invoicing, Stripe Connect payment capture (Beat 7).**
- **Bilingual (EN/ES) voice command handling, wake-word detection
  ("FieldLoop, ...")**, and the on-screen failsafe button required behind
  every voice action (§2.3).
- **Barcode/part scanning UI**, if in scope — all planning docs agree
  regardless of phase-inclusion: usage-reporting only, **never** orders
  parts or syncs inventory. Confirm phase-inclusion first (§6).
- **Building-code compliance lookup UI**, if in scope — unresolved, see §6.
- **First-login password-reset UI itself** is mobile's to build once the
  `must_change_password` question above is resolved.

Beat 8 (Retain) is explicitly **backend-only, not mobile scope** — listed
here only so it isn't mistakenly picked up.

---

## 6. Open Questions / Decisions Pending

Pull directly from the four external planning docs' unresolved conflicts
(none of these are settled — confirm with the project owner before
building against any of them):

- **Estimate pricing** — single verbatim price (one planning doc, explicit
  "no tiering" rule) vs. tiered Good/Better/Best (another doc, shown
  throughout with dollar examples). The underlying `estimates_and_
  change_orders` table has `tier_good`/`tier_better`/`tier_best` columns
  — schema-level evidence it wasn't built around single-price-only,
  regardless of which rule wins. **Not the same decision as the unrelated
  staff-side Knowledge Base feature's single-price choice — don't treat
  that as precedent here.**
- **Platform fee %** — 1.95% vs. 1.5%, self-contradictory even within one
  planning doc. `contractor_financials.platform_fee_rate` sample data
  uses 1.95% as a data point, not a confirmed answer. Do not hardcode
  either without confirming.
- **Voice/AI vendor pairing for the mobile pipeline specifically** — three
  different proposals across docs (Deepgram+GPT-4o/Groq chained;
  Deepgram+Groq-for-internal+GPT-4o-for-client-facing; or "don't
  finalize yet, run two field-test spikes first" — Bluetooth audio
  bandwidth test, and a live pipeline test vs. OpenAI's Realtime
  speech-to-speech API). **No source confirms whether those spikes were
  ever run.** Ask before committing to a vendor.
- **Backend compute for the voice/AI pipeline** — Lambda (matches the
  rest of this codebase) vs. a persistent PaaS server (Railway/Fly.io/
  Render), the latter argued for because Lambda cold-starts are a poor
  fit for a persistent/streaming voice connection. This is a real,
  independent technical concern — evaluate on its own merits for the
  mobile pipeline specifically, separate from any AWS-ownership question
  (which is resolved — this repo already has a working AWS account/Lambda
  setup).
- **Shokz headset requirement** — one planning doc treats a specific
  model (OpenComm2, the mobile-paired variant — **not** the OpenComm2 UC
  USB/desktop variant) as mandatory hardware, citing a wideband-vs-
  narrowband Bluetooth audio risk. Other docs don't mention it. Confirm
  whether this is still a real hardware requirement before assuming
  any Bluetooth audio path will just work.
- **Dispatcher UI shape** (chat-only vs. full "Command Center" dashboard)
  — mostly a web-dashboard-side question; low direct relevance to mobile
  except as context for what the dispatcher (Beat 1–2) experience looks
  like on the other end of your "Assign & notify" step.
- **Barcode scanning, consumer financing on the estimate screen, and
  12-month automated retention** — each has at least one planning doc
  saying "in Phase 1" and another saying "explicitly out." No resolution
  recorded anywhere. Confirm phase scope before building any of them.
- **Supabase Phone provider enablement** (§4) — no longer blocking overall
  (email sign-in works today for technicians with an email on file); still
  needed for the remaining no-email-on-file case, and needs an explicit
  decision + possibly SMS provider credentials from the project owner.
- **`must_change_password` flag relevance** (§2.2) — needs a direct answer
  from whoever owns the backend/dashboard side before mobile builds a
  screen around it.
- **Groq secret provisioning status** (§3) — unconfirmed whether
  `fieldloop/groq-api-key` actually exists yet; the setup steps were
  documented but execution wasn't verified in this session.
- **Direct-Supabase access from mobile — yes or never?** (§2.2d) — decides
  whether the `get_my_contractor_id()` gap needs fixing at all. If the app
  stays 100% Lambda-mediated (matching every other client in this repo),
  it's a non-issue.
