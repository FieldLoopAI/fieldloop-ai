# FieldLoop — Step-by-Step Testing Guide

A consecutive, click-by-click walkthrough of the entire web application. Follow it in order, Step 1 through the end — each step tells you **where to go, what to click, what to enter, what to verify, and where to go next**. Keep this open in a second window while you test.

This guide covers the two web apps in this repo: the **Registration Dashboard** (internal FieldLoop staff tool) and the **Contractor Command Dashboard** (contractor-facing product). A third piece, the technician mobile app, is a separate native app not in this repo — anywhere this guide hits that boundary, it says so explicitly instead of guessing.

Where a feature's real behavior can't be confirmed from the app alone (e.g. it depends on data only the mobile app would create), it is marked **To Be Verified**.

---

## 0. Roles cheat-sheet (reference while testing)

There is one login page for everyone, at `/` (also reachable at `/dashboard`) — the app detects which population a login belongs to *after* authenticating, and routes accordingly. There's no separate staff login page anymore; `/staff/login` is kept only as a redirect stub back to `/` for old bookmarks.

| Role | Where they land after logging in at `/` | What they can do |
|---|---|---|
| `admin` | `/staff/platform` (Platform Overview) | Full read/write everywhere, only role that can export PDF, edit system settings, reveal Stripe, terminate a contractor, and see Platform Overview |
| `onboarding` | `/staff/registration` (Registration Dashboard) | Full read/write on contractor records, cannot touch financials/PDF export/system settings/Platform Overview |
| `finance` | `/staff/registration` | Read-only; sees financials (bank fields revealable) but not PII |
| `support` | `/staff/registration` | Read-only; sees contact info only, PII/financials/compliance numbers masked |
| `jenex_dev` | `/staff/registration` | Read-only, restricted to sandbox contractors only — **no test account exists yet, mark as To Be Verified** |
| `owner_admin` (contractor) | `/` (Command Dashboard renders in place, no redirect) | Full contractor dashboard — only role that exists for contractor logins today |
| Technician | Mobile app only (not in this repo) — sets password via `/technician-setup?token=...` web fallback first | No web dashboard access at all, by design |

`/staff` itself is not a page — it's a dispatcher that redirects a signed-in staff user to the row above based on their role (admin → Platform Overview, everyone else → Registration). Direct navigation/bookmarks to `/staff` still work, they just bounce onward immediately.

**Test accounts (reuse these, don't create new ones unless a step tells you to):**

| Account | Login | Password |
|---|---|---|
| Staff Admin | `a@a.com` | `TestPass123!FL` |
| Staff Onboarding | `test-onboarding@example.com` | `TestPass123!FL` |
| Staff Finance | `test-finance@example.com` | `TestPass123!FL` |
| Staff Support | `test-support@example.com` | `TestPass123!FL` |
| Contractor | `pw-contractor-1785321789808@example.com` | `TestPass123!FL` |

**Before you start:** the app must be running at `http://localhost:5173` specifically (not 5174/5177/etc.) — if a stale server is already squatting on 5173, a fresh `npm run dev` will silently start on a different port and every action in this guide will fail with a generic "Failed to fetch" error. If that happens, close all running dev servers and restart `npm run dev`.

---

## PART A — Staff Side (Registration Dashboard)

### Step 1 – Open the application
1. Start the app (`npm run dev`) and open `http://localhost:5173` in Chrome or Edge (voice features later in this guide require a Chromium browser).
2. You should land on the **unified FieldLoop login page** (kicker "SECURE SIGN IN", heading "Welcome back", subheading "Sign in with your FieldLoop account.") — this is the `/` route's default, and it's the same page contractors and staff both sign in from. The page itself has no way to know which one you are; that's resolved after you sign in.
3. Verify: page loads with no console errors, the FieldLoop branding panel is visible on the left, and there's no "Sign up"/"Create account" link (staff and contractor accounts are both provisioned manually, not self-service — **expected, not a bug**).
4. Go to Step 2.

### Step 2 – Access the Master User (Staff Admin) account
There is no self-service "create account" screen for staff users — staff accounts are provisioned manually by a developer directly in Supabase, not through the app UI. For this guide, use the pre-provisioned admin test account below rather than trying to register a new one. There's no separate staff login page to navigate to anymore — you'll sign in with staff credentials on the same page from Step 1, and the app will detect the role and route you accordingly.
1. Go to Step 3.

### Step 3 – Log in as the Master User (Staff Admin)
1. On the login form at `http://localhost:5173/`, enter:
   - **Email**: `a@a.com`
   - **Password**: `TestPass123!FL`
2. Click **"Sign in"** (button text changes to "Signing in…" briefly).
3. Verify: you're redirected to `/staff/platform` (Platform Overview) — admin is the only role that lands there by default; the header reads "{email} · admin".
4. **Invalid-login check**: sign out (see Step 18) and retry with a wrong password. Verify you see the error "The email or password is incorrect. Please try again." and remain on the login page. Log back in with the correct credentials before continuing.
5. Platform Overview itself is toured in full in Part C (Steps 39–41) — for now, click **"Registration Dashboard"** in the header to reach the onboarding wizard this part of the guide walks through. Verify it takes you to `/staff/registration` with the header reading "User: … (admin)" and a status card showing "AUTH LEVEL: Full read/write".
6. Go to Step 4.

### Step 4 – Explore the Master User (Staff) dashboard
1. In the header bar, confirm you see: the FIELDLOOP logo, a session idle-timer pill, "User: … (admin)", a **"Platform Overview"** button (admin-only — other roles won't see this, and it now takes you back to `/staff/platform` rather than being your landing page), a **"Staff Controls"** button, and **"Sign out"**.
2. Click **"Staff Controls"** — a drawer opens titled "Operator & Staff Controls" with a **"Reset Idle Timer"** button and a JSON dump labeled "Currently loaded record" (empty/null right now, since no contractor is loaded). Close the drawer.
3. Note the two landing tabs below the header: **"New Registration"** and **"Existing Contractors"** — as `admin`, "New Registration" is selected by default.
4. Verify: the "New Registration" panel shows a card "Register a new contractor" with **LEGAL BUSINESS NAME** and **EIN / TAX ID** fields and a **"Create Contractor & Continue"** button.
5. **Invalid-input check**: click **"Create Contractor & Continue"** with both fields blank. Verify an error banner appears (something like "Legal Business Name and EIN are required") and no contractor is created.
6. Go to Step 5.

### Step 5 – Register a new Contractor (Step 2 of the 8-step wizard: Business Identity)
1. Still on "New Registration", enter:
   - **LEGAL BUSINESS NAME**: `Test Contractor Co`
   - **EIN / TAX ID**: `12-3456789`
2. Click **"Create Contractor & Continue"** (shows "Creating…").
3. Verify: you're taken straight into the wizard at **Step 2 — Business identity**, the horizontal stepper at the top shows 8 steps ("Access & security" through "Activate"), and step 2 is highlighted with a badge "Onboarding — Step 2 of 8".
4. Fill in the rest of Step 2's fields:
   - DBA / Trade Name: `Test Contractor`
   - Business Structure: select `Limited Liability Company (LLC)`
   - EIN / Tax ID: already set — click **REVEAL** next to it, verify it shows the real value you typed, then click **HIDE** again.
   - Year Established: `2015`
   - Business Phone (Voice): `(555) 010-0100`
   - Business Email: `test-contractor@example.com`
   - Physical Street Address / City / State / Zip: any valid values, e.g. `100 Main St`, `Tampa`, `FL`, `33601`
5. Click **"Save & Continue"** in the footer bar. Verify: no error banner, and the stepper advances to **Step 3 — Ownership**.
6. Go to Step 6.

### Step 6 – Ownership & Principal (Step 3 — KYC)
1. Fill in: Owner/Principal Name, Title, Date of Birth, SSN — Last 4, Personal Mobile, Personal Email, Home Address.
2. **PII masking check**: since these fields have no existing secret yet (brand-new record), they should be freely editable with no lock icon or REVEAL button — verify DOB/SSN/Home Address are all typeable.
3. Set **ID Verification Status** → `Pending Document Upload / Review`, **PEP** → `No (Cleared)`, **Sanctions Screening** → `Screening Pending`.
4. Click **"Save & Continue"**. Verify it advances to Step 4, then click **"Back"** once and confirm the SSN/DOB/Home Address you typed are still there and now show as masked with a working **REVEAL**/**HIDE** toggle (since a secret now exists). Click "Save & Continue" again to move forward.
5. Go to Step 7.

### Step 7 – Key Contacts (Step 4)
1. Fill in the existing contact card: Full Name, Contact Category (`Primary Contact`), Direct Line, Email, Preferred Channel (`Voice / Phone Call`).
2. Click **"Add Contact"** — verify a second blank contact card appears.
3. Fill the second card's Full Name and set Contact Category to `Emergency Contact` — verify a **"RELATIONSHIP"** field only appears once you pick Emergency Contact.
4. Try deleting a contact via the trash icon until only one remains, then try deleting the last one — verify you get the alert "At least one contact must remain on file." and it isn't removed.
5. Click **"Save & Continue"**.
6. Go to Step 8.

### Step 8 – Compliance & Licensing (Step 5)
1. Fill in State License section (Primary License #, Issuing Authority, License State, Expiration Date), General Liability Insurance (Provider, Policy #, Expiration Date, COI Document Status), Workers' Comp & Bond section, and W-9 section (`✓ W-9 Signed & On File`).
2. Under "Additional Trade Licenses", type a value and click **"Add License"** — verify it appears as a removable pill.
3. Click **"Save & Continue"**.
4. Go to Step 9.

### Step 9 – Operations & Workforce (Step 6)
1. Fill in Primary Trade, add at least one entry to "Services Offered" via the text box + **"Add Service"** button.
2. Fill Service Radius, Counties Served, Emergency Service (`Yes — 24/7 Emergency Response`), Business Hours, Active Technician Count, Service Vehicles Count.
3. Click **"Save & Continue"**.
4. Go to Step 10.

### Step 10 – Secure Financials & Stripe Connect (Step 7, admin-only to save)
1. Fill Bank Name, Account Type, Routing Number, Account Number, Account Holder Name.
2. Click **REVEAL** next to Routing Number and Account Number — verify the real values you typed are shown, and the button toggles to **HIDE**.
3. Set Micro-Deposit Verification Status, fill Stripe Account ID, toggle a couple of "Payment Methods Accepted" pills, check the **ACH Authorization** checkbox.
4. Click **"Save & Continue"**.
5. Go to Step 11.

### Step 11 – Internal & System Settings (Step 8) and Activation
1. Verify **Contractor ID**, **Onboarded By**, **Onboarded Date** are pre-filled and read-only.
2. Set **Current Activation Status** — leave at `Pending activation` for now.
3. Set **Risk Score** to a number (e.g. `20`), add an internal note.
4. Click **"Save & Activate Contractor"**.
5. **Invalid-input check**: if any required field from earlier steps is missing, verify an error banner lists each problem as a clickable link (e.g. "Step 2 — click to fix") and clicking one jumps you straight to that step. Fix anything flagged, then re-click Activate.
6. Verify: on success, the page shows "Contractor Activated Successfully" with a Login Email / Password / Confirm Password form.
7. Go to Step 12.

### Step 12 – Create the Contractor's portal login credentials
1. On the "Contractor Activated Successfully" screen, enter a **Login Email** (e.g. `test-contractor-guide@example.com`) and a **Password** meeting the rules shown (8+ chars, 1 uppercase, 1 number, 1 special character) in both Password and Confirm Password.
2. **Invalid-input check**: type mismatched values in Password/Confirm Password and verify the inline "Passwords do not match" message appears; fix it and verify it switches to "✓ Passwords match".
3. Click **"Save Credentials & Finish"**.
4. Verify: a summary card appears showing the login email/password with copy buttons, and a **"Return to Dashboard"** button.
5. Click **"Return to Dashboard"**.
6. Go to Step 13.

### Step 13 – Test the "Existing Contractors" search tab
1. Click **"← Back to search"** (top of the contractor header area) to leave the loaded record.
2. Click the **"Existing Contractors"** tab.
3. Type part of the name `Test Contractor` into **"SEARCH BY NAME"** — verify results appear after a brief debounce, showing the name, public ID, and a "SANDBOX" tag if applicable.
4. Click the result — verify the same contractor loads back in at whatever step it was left on.
5. Also test the manual fallback: paste the contractor's ID into **"OR PASTE A CONTRACTOR ID DIRECTLY"** and click **"Load"** — verify it loads the same record.
6. Go to Step 14.

### Step 14 – Export PDF (admin-only)
1. With the test contractor loaded, click **"Export PDF"** in the footer bar.
2. Verify: a PDF downloads/opens, and any secret fields (EIN, DOB, SSN, bank info) are shown as "on file" rather than the real decrypted values.
3. Go to Step 15.

### Step 15 – Verify Step 1 (Access & Security / system settings) as admin
1. Click **Step 1 "Access & security"** in the stepper.
2. Verify the read-only RBAC matrix table is visible, then in "Security & Session Policy Configuration" (editable since you're admin): change **Idle Session Timeout** to `30`, change **Admin & Finance IP Allowlist** to `Enforced (Active)`, then back to `Disabled (Testing Mode)`.
3. Click **"Save & Continue"**/**"Save Draft"** and verify no error.
4. Scroll to "Real-Time Record Audit & Access Feed" — verify recent actions (loads, saves) from this session appear in the list.
5. Go to Step 16.

### Step 16 – Verify other staff roles' permissions (secondary role coverage)
1. Sign out (Step 18 shows how) and log back in at `http://localhost:5173/` as **`test-support@example.com`** / `TestPass123!FL`. Verify: since `support` isn't `admin`, you land directly on `/staff/registration` (no Platform Overview redirect).
2. Verify: landing tab defaults to "Existing Contractors" (support can't create). Clicking "New Registration" shows a read-only banner instead of the create form.
3. Load the test contractor from Step 5. Verify: PII (DOB/SSN/home address) and financials show fully locked with **no REVEAL button**; compliance license/policy numbers show literal `[MASKED]`; **Save Draft**/**Save & Continue**/**Export PDF** are all disabled.
4. Sign out, log in as **`test-finance@example.com`**. Verify: lands on `/staff/registration`; full business/compliance info visible; PII locked with no reveal; bank routing/account show masked with a **working REVEAL** button; Stripe fully locked; everything still read-only (no save).
5. Sign out, log in as **`test-onboarding@example.com`**. Verify: lands on `/staff/registration`; full read/write, PII fields masked but revealable, bank fields masked but revealable, Stripe fully locked (only admin can reveal Stripe), **no** "Platform Overview" button in the header (onboarding isn't admin).
6. `jenex_dev` role: **To Be Verified** — no test account currently exists for this role.
7. Sign out and log back in as the admin (`a@a.com`) before continuing.
8. Go to Step 17.

### Step 17 – Terminate Contractor (admin-only, destructive — test contractor only)
1. With the **test contractor you created in Step 5** loaded (never a real one), go to Step 8 of its wizard.
2. Click **"Terminate Contractor & Purge Secrets"** in the Danger Zone.
3. Verify a confirmation dialog warns this permanently purges secrets, and only proceeding if you actually intend to retire this test record.
4. If you want to keep using this contractor for the rest of this guide (Part B needs it), **skip actually confirming this** — just verify the button/warning exist, then cancel the dialog. Otherwise, if you confirm it, you'll need to create a fresh contractor for Part B.
5. Go to Step 18.

### Step 18 – Sign out of the Staff dashboard
1. Click **"Sign out"** in the header.
2. Verify you're returned to the unified login page at `/`.
3. Go to Step 19 (Part B).

---

## PART B — Contractor Side (Contractor Command Dashboard)

### Step 19 – Log in as the Contractor
1. Navigate to `http://localhost:5173/` — the same unified login page from Step 1/3, this time with contractor credentials.
2. Log in with either the credentials you created in Step 12, or the standing test account: **`pw-contractor-1785321789808@example.com`** / `TestPass123!FL` (recommended, since it already has real jobs/technicians/customers seeded for a fuller test).
3. **Invalid-login check**: try a wrong password once, verify "The email or password is incorrect. Please try again.", then log in correctly.
4. Verify: since a contractor identity resolves, the dashboard renders in place at `/` (no redirect, unlike a staff login) — you land on the Command Center with the tenant's real company name in the header, a security banner ("SIGNED IN AS" / "AUTH LEVEL" / "IDLE TIMEOUT"), and a 5-card KPI row (jobs, ACTIVE TECHNICIANS, AWAITING APPROVAL, UNPAID INVOICES, PLATFORM FEE (MTD)).
5. Go to Step 20.

### Step 20 – Explore the Contractor dashboard shell
1. Confirm the left sidebar lists, in order: **Live dispatch, Approvals queue, Technicians, Fleet & vehicles, Customer database, Live field data, Invoices & payments, Reports & analytics, Data archive & export, Team & access, Knowledge Base**.
2. Click through each once quickly just to confirm every panel renders without a console error before doing the detailed pass below.
3. Go to Step 21.

### Step 21 – Create a Technician
1. Click **Technicians** in the sidebar.
2. Click **"Add technician"** (top right — only visible for `owner_admin`, which you're logged in as).
3. In the **"Add New Technician"** modal, enter:
   - Full Name: `Test Tech One`
   - Mobile Phone: `5551234567` (verify it auto-formats to `(555) 123-4567` and a badge shows "E.164 Storage: …")
   - Role/Specialty: `HVAC`
   - Hourly Cost Rate: `25`, Billable Rate: `65`
   - Credential Delivery Channel: `📱 Send via SMS`
4. **Invalid-input check**: try submitting with the Full Name under 2 characters, or an invalid phone — verify inline validation blocks submission.
5. Click **"Add Technician & Deliver Credentials"** (shows "Creating account…").
6. Verify: the modal closes, and the new technician appears in the roster table with columns NAME / ROLE & SPECIALTY / CONTACT / CERTIFICATIONS / INVITE STATUS / ACTIONS, invite status likely `pending`.
7. Go to Step 22.

### Step 22 – Verify and manage the Technician
1. In the technician's row, click **"Edit"**. Verify the Edit modal is pre-filled with what you entered; change the Role/Specialty to `HVAC & Refrigeration` and click **"Save Changes"**. Verify the roster table updates.
2. If the row's invite status still isn't `active` (password not yet set), click **"Resend setup link"** — verify it shows "Sending…" then succeeds.
3. **To Be Verified**: actually retrieving the real setup link/SMS requires live Twilio/SES credentials, which aren't fully configured in this environment — if a link is available (e.g. from a `dev_log`/`dev_email` simulated message table, or shown in logs), continue to Step 23; otherwise skip Step 23 and note it as unverifiable in this pass.
4. Go to Step 23.

### Step 23 – Complete Technician Setup (web fallback page)
1. Open a new browser tab (or private window) and navigate to `http://localhost:5173/technician-setup?token=<the real token from Step 22>`.
2. Verify the page shows "One step left — set your password." with a "New password" / "Confirm password" form.
3. Enter a password 8+ characters in both fields and click **"Set Password & Finish Setup"**.
4. **Invalid-input check**: first try a password under 8 characters (verify "Password must be at least 8 characters."), and mismatched passwords (verify "Passwords do not match.").
5. Verify success screen: "Your password is set" with instructions to use the mobile app.
6. **Also verify**: navigating to `/technician-setup` with no token at all shows "Missing setup link" instead of a form.
7. Note: actually signing in as this technician requires the native mobile app (not in this repo) and Supabase's Phone auth provider, which is intentionally disabled until product launch — **do not attempt to enable it**. Technician sign-in itself is **To Be Verified** outside this guide's scope.
8. Close the extra tab, return to the Contractor dashboard tab, and go to Step 24.

### Step 24 – Deactivate a Technician (do this later, not yet)
Hold off on deactivating `Test Tech One` until Step 33 (Job workflow), since you'll want an active technician to assign a job to first. Skip ahead to Step 25 for now.

### Step 25 – Add a Customer
1. Click **Customer database** in the sidebar.
2. Click **"Add customer"**.
3. In the modal, enter:
   - Household/Business Name: `Test Customer LLC`
   - Contact Name: `Jane Test`
   - Primary Phone: `5559876543`
   - Email: `jane@example.com`
   - Preferred Contact: `Call`
   - Service Address: `200 Oak Ave, Tampa, FL 33602`
4. **Invalid-input check**: try submitting with Household Name, Phone, or Service Address blank — verify it's blocked (all three are required).
5. Click **"Add customer"**. Verify it appears in the table with JOBS = 0 and LIFETIME VALUE = $0.
6. Click **"Edit"** on the row, change the Contact Name, save, and verify the table reflects the change.
7. Use the **"Search customers"** box to search for `Test Customer` and confirm it filters correctly.
8. Go to Step 26.

### Step 26 – Add a Vehicle
1. Click **Fleet & vehicles** in the sidebar.
2. Click **"Add vehicle"**.
3. Enter Unit Number `V-99`, Make `Ford`, Model `Transit`, Year `2022`, Assigned Driver → select `Test Tech One`.
4. **Invalid-input check**: try submitting with Unit Number blank — verify it's required.
5. Click **"Add vehicle"**. Verify it appears in the table (UNIT / VEHICLE / ASSIGNED DRIVER / STATUS / HEALTH / ACTIONS), and Health shows **"NO TELEMETRY"** (expected — no OBD-II integration exists).
6. Click **"Edit"**, change the Model, save, verify the update.
7. Click **"Retire"** on a different/older vehicle if one exists (or this one, if you don't need it later) — verify it disappears from the active list and the header count decreases. If you retired `V-99`, note that Step 33's optional "Swap vehicle" test will just be against a mock action anyway, so this doesn't block anything.
8. Go to Step 27.

### Step 27 – Create a Job (manual entry) and test schedule-conflict detection
1. Click **Live dispatch** in the sidebar (this is the default landing panel too).
2. Click **"Schedule new job"**.
3. In the **"Schedule New Job"** modal:
   - Customer: choose **"Existing customer"**, select `Test Customer LLC` — verify the Job Service Address auto-fills from the customer record.
   - Job Type: `Service Call`
   - Trade Category: `HVAC`
   - Problem/Scope Description: `AC not cooling`
   - Scheduled Start: pick a time today
   - Scheduled End: pick a time 2 hours later
   - Assign Technician: `Test Tech One`
   - Estimate ($): `150`
4. **Invalid-input check**: set Scheduled End earlier than Scheduled Start — verify it's flagged/blocked.
5. Verify the info badge at the bottom reads something like "This will be saved as Scheduled — a technician and start time are both set."
6. Click **"Schedule Job"** (shows "Creating job…").
7. Verify: the new job card appears on the dispatch board with a technician pill "👤 Test Tech One" and the estimate pill.
8. **Now test the conflict warning**: repeat steps 2–6 to create a **second** job for the **same technician** with an overlapping time window (same day, overlapping start/end).
9. Verify: one (or both) of the overlapping job cards now shows an amber warning pill **"⚠ Schedule conflict with Test Tech One"** (or the other job's identifier) in its chip row.
10. Go to Step 28.

### Step 28 – Test Voice-to-Job-Schedule
1. Still on **Live dispatch**, click **"Voice schedule"** (mic icon) — only available in a Chromium browser (Chrome/Edge); if you're in Firefox/Safari the button will be disabled with a tooltip explaining why — switch browsers if needed.
2. In the "Schedule a Job by Voice" modal, click **"Start Recording"**, grant microphone permission if prompted.
3. Speak a short job description out loud, e.g.: *"Schedule a service call for Test Customer LLC tomorrow at 10 AM, AC repair, assign it to Test Tech One."*
4. Verify: status badge moves idle → connecting → listening (with a live transcript appearing as you speak) → extracting.
5. Click **"Stop"** when done speaking.
6. Verify: it hands off into the **Create Job modal**, pre-filled with what it understood, and a banner reads "🎤 Filled in from voice — please double-check the highlighted field(s) below before saving." Any field it wasn't confident about (e.g. a guessed existing customer) should be visually highlighted for review.
7. Correct any wrong/missing fields, then click **"Schedule Job"** to save it, or **Cancel** if you don't want a third test job cluttering the board.
8. **Error-path check**: reopen the voice modal and click **"Try Again"**/**"Fill In Manually Instead"** after intentionally denying mic permission once, to confirm the error banner and fallback button both work.
9. Go to Step 29.

### Step 29 – Reassign a Job and test the mock dispatch actions
1. On one of your test job cards (still `draft`/`scheduled` status), use the **"Reassign tech…"** dropdown to switch it to a different technician (add a second technician first via Step 21 if only one exists). Verify the pill updates.
2. Click **"Swap vehicle"** on a job card — verify a message confirms "Vehicle swap is a mock action." (this is intentionally not wired to real data yet).
3. Click **"Text customer"** — verify "Customer text is queued as a mock action." (same — intentionally mock).
4. Use the **date picker**, **"Today"**, and **"All"** buttons above the board to confirm the dispatch view filters correctly by date.
5. Go to Step 30.

### Step 30 – View Job File
1. On a job card, click **"View job file"**.
2. Verify the modal titled "Job file — {job id}" opens showing customer/address/trade/status/technician plus a chronological field-event list.
3. Since no mobile-app activity has occurred against this test job, verify you instead see the empty state: "No field events recorded for this job yet…" — this is expected, not a bug.
4. Click **"Close"**.
5. Go to Step 31.

### Step 31 – Live field data stream
1. Click **Live field data** in the sidebar.
2. If no jobs are currently `en_route`/`on_site`, verify the empty state "No jobs are en route or on site right now." — expected, since only the (non-existent-here) mobile app can move a job into those states. **To Be Verified** with real field activity if/when available.
3. Leave this panel open for ~20 seconds and confirm it doesn't error (it auto-polls every 20s while active).
4. Go to Step 32.

### Step 32 – Approvals queue and Invoices & payments (read-only, likely empty)
1. Click **Approvals queue**. Since estimates/change orders are created and customer-signed on the mobile app (not this dashboard), expect the empty state: "No estimates or change orders yet — these are created and sent by the technician from the field, not from this dashboard." Verify there is **no** "create estimate" button anywhere here — that's intentional (contractor's only role is Approve/Reject on an already-signed one).
2. If any estimate does exist in `signed` status, verify the **"Reject"** and **"Approve & bill"** buttons work and update its status.
3. Click **Invoices & payments**. Expect a similarly empty or sparse read-only table (INVOICE # / CUSTOMER / JOB / AMOUNT / PAYMENT METHOD / PLATFORM FEE / STATUS) — invoices are compiled by the mobile app. Verify there's no create/edit control, only **"Export CSV"** (mock).
4. Both panels' populated-state behavior is **To Be Verified** against real mobile-app-generated data.
5. Go to Step 33.

### Step 33 – Deactivate the test Technician
1. Click **Technicians**.
2. Click **"Deactivate"** on `Test Tech One`'s row.
3. Verify a confirmation modal: "Deactivate technician?" warning it revokes mobile login and unassigns upcoming jobs. Click **"Deactivate"** (shows "Working…").
4. Verify: the technician disappears from the (active-only) roster, and go back to **Live dispatch** to confirm any job that was assigned to them is now unassigned.
5. Go to Step 34.

### Step 34 – Reports & Analytics, and the Retention Queue
1. Click **Reports & analytics**.
2. Verify two report cards: "Jobs completed & billed" (per technician, all-time) and "Fleet Health — OBD-II Monitoring" (should reflect the "NO TELEMETRY" vehicle from Step 26).
3. Scroll to "Retention queue — automated customer follow-ups". If any due/paused row exists for `Test Customer LLC` or another customer, click **"Pause"**, verify the pill/label updates, then click **"Resume"** to revert it.
4. Go to Step 35.

### Step 35 – Data Archive & Export
1. Click **Data archive & export**.
2. Under "Request a new data export", leave the export type as `All records (full company archive)`, format as `ZIP (CSV + PDF + JPEG)`, and confirm the include chips are all selected by default.
3. Click **"Request export"** (shows "Submitting…").
4. Verify: a new row appears in the history table (REQUESTED / TYPE / FORMAT / INCLUDES / STATUS), status likely starting as a non-`ready` blue pill.
5. Note: there is no actual file generated or delivered yet — this is real request-tracking only, by design. Do **not** expect a download.
6. Go to Step 36.

### Step 36 – Team & Access
1. Click **Team & access**.
2. Verify the warning banner "One role today" (contractor logins only support `owner_admin` currently) and a roster table showing your own account (TEAM MEMBER / ROLE / MFA / LAST LOGIN).
3. Click **"View audit log"** — verify it expands a table (WHEN / ACTION / DETAIL / BY) showing recent actions from this session (technician added, job created, etc.). Click **"Hide audit log"** to collapse it again.
4. Go to Step 37.

### Step 37 – Knowledge Base submission
1. Click **Knowledge Base**.
2. Fill the "Submit a fact" form: pick a **Trade** from the dropdown, enter a Subcategory, Category, Fact title (e.g. `Test KB Fact`), Fact body text, optional tags, and leave "Varies by local jurisdiction?" at `No`.
3. Click **"Submit for review"** (shows "Submitting…").
4. Verify: it appears in "Your submissions" below with status `pending` (amber pill).
5. Confirm there is no approve/reject control on this page — that only exists for staff, tested next.
6. Go to Step 38.

### Step 38 – Sign out of the Contractor dashboard
1. Click **"Logout"** in the header.
2. Verify you're returned to the unified login page (`/`).
3. Go to Step 39 (Part C).

---

## PART C — Cross-Role Verification (Platform Overview & final checks)

### Step 39 – Log back in as Staff Admin and open Platform Overview
1. Go to `http://localhost:5173/`, log in as `a@a.com` / `TestPass123!FL`.
2. Verify you land directly on `/staff/platform` with 5 sidebar tabs: **Overview, Contractors, Usage, Revenue, Knowledge Base** — admin no longer needs to click a "Platform Overview" button after login, it's the default landing page.
3. **Access-control check**: sign out, log in as `test-onboarding@example.com` (non-admin), and confirm navigating directly to `/staff/platform` in the address bar redirects you away — it bounces through `/staff` (the role dispatcher) and lands on `/staff/registration`, since this route is admin-only at the router level, not just hidden in the UI. Sign back in as admin before continuing.
4. Go to Step 40.

### Step 40 – Tour Platform Overview tabs
1. **Overview tab**: verify KPI cards (Total Contractors, Suspended/Terminated, Active Technicians, Jobs All-Time, Revenue Collected — expect $0, since no real invoicing/payment pipeline exists yet), a contractor-status chart, a "Needs attention" panel, and a KB content-coverage table.
2. **Contractors tab**: search for `Test Contractor` in the roster search box; verify your Step 5 test contractor appears with STATUS / TRADE / JOBS / ACTIVE TECHS / ONBOARDED columns. Click its row.
3. Verify it opens `/staff/platform/contractors/:id` — the drill-down page — showing Profile, Compliance, Financials, Technicians, Jobs, Invoices & estimates, KB submissions, and Recent staff activity panels, all populated with the real data you entered in Parts A/B. Click **"Platform Overview"** to go back.
4. **Usage tab**: verify "Jobs by status" and "Most active contractors" reflect the jobs you created in Step 27.
5. **Revenue tab**: verify it honestly shows $0 collected (no real payment pipeline exists) rather than fabricated numbers.
6. Go to Step 41.

### Step 41 – Review the Knowledge Base submission from Step 37
1. Click the **Knowledge Base** tab.
2. Under "Pending contractor submissions", find `Test KB Fact` from Step 37.
3. Click **"Approve"** — verify it disappears from the pending list (or its status updates).
4. Log back into the Contractor dashboard (Step 19's account), open **Knowledge Base**, and verify the submission's status in "Your submissions" now shows `approved` (green pill) instead of `pending`.
5. Optionally repeat with a second submission and click **"Reject"** instead, verifying it shows `rejected`.
6. Go to Step 42.

### Step 42 – Final login/logout and access-control sweep
1. Confirm each of the following independently logs in at the same unified page (`/`) and reaches the expected screen, then logs out cleanly (no leftover session bleeding into the next login):
   - Staff Admin (`a@a.com`) → redirected to `/staff/platform`, sees "Registration Dashboard" link.
   - Staff Onboarding → redirected to `/staff/registration`, full read/write, no Platform Overview button.
   - Staff Finance → redirected to `/staff/registration`, read-only, financials visible.
   - Staff Support → redirected to `/staff/registration`, read-only, PII/financials masked.
   - Contractor (`pw-contractor-...`) → stays on `/`, sees the Command Dashboard (no redirect, since a contractor's dashboard renders in place).
   - `jenex_dev` staff role and direct technician web login: **To Be Verified** — no test account / no web UI exists for these respectively.
2. Confirm a signed-in-but-wrong-area case: while signed into a *contractor* session, navigate directly to `/staff` or `/staff/platform` — verify you're bounced back to your own Command Dashboard at `/` rather than shown a login form (a contractor identity has no `fl_users` row, so the staff-side guard treats you as unauthenticated for that area and sends you to `/`, where your still-active contractor session immediately resolves back to the dashboard).
3. Go to Step 43.

### Step 43 – Final end-to-end verification checklist
Confirm all of the following are true before signing off on this test pass:
- [ ] A brand-new contractor was created, filled through all 8 wizard steps, and activated (Steps 5–11).
- [ ] Portal login credentials were created and used to sign in as that contractor (Steps 12, 19).
- [ ] All 5 staff roles' field-masking/write-permission behavior matched the roles cheat-sheet (Step 16, 42).
- [ ] A technician was added, edited, and deactivated (Steps 21, 22, 33).
- [ ] A customer and a vehicle were added and edited (Steps 25, 26).
- [ ] A job was created manually and via voice, assigned to a technician, and a schedule conflict was surfaced (Steps 27–29).
- [ ] Every sidebar panel on the Contractor dashboard was opened at least once with no console errors (Steps 20, 31–37).
- [ ] A data export request and a KB submission were created, and the KB submission was approved/rejected from Platform Overview (Steps 35, 37, 41).
- [ ] Platform Overview's 5 tabs and the contractor drill-down page all showed real data matching what was entered earlier (Step 40).
- [ ] No destructive action (Terminate Contractor) was run against anything other than the disposable test contractor created in this guide.

If every box is checked with no unexpected errors, the application has been exercised end-to-end across both dashboards and all documented roles.
