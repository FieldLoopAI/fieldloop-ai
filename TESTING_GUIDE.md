# FieldLoop — Business Walkthrough & Review Guide

## What this guide is for

This guide lets you experience FieldLoop the same way each of its real users would — a FieldLoop staff member overseeing the whole platform, a FieldLoop staff member onboarding a brand-new contracting business, and the contracting business owner running their day-to-day operations — so you can judge for yourself whether the product does what the business needs it to do.

No technical knowledge is required anywhere in this guide. You won't need to install any software, write anything, or understand how the system works behind the scenes. Just follow the steps, look at what happens, and use the short checklist at the end of each section to confirm it worked the way it's described.

Each section below follows the same simple pattern:
- **Why it matters** — the business reason this feature exists.
- **Step by step** — exactly what to click or say, in order.
- **How to check it worked** — a short list to confirm before moving on.

---

## Before You Start

**Where to go:** Open **https://app.fieldloopai.com** in a web browser (Chrome or Microsoft Edge work best). This is the live, real system — not a demo copy — so anything you do (adding a technician, scheduling a job, etc.) is really saved.

**What you'll need:**
- A laptop or desktop computer with a web browser (Chrome or Microsoft Edge) — that's all you need for every part of this guide.

**Your login details** (use these to sign in — do not share them outside the review team):

| Experience | Username | Password |
|---|---|---|
| Contractor (business owner view) | `pw-contractor-1785321789808@example.com` | `TestPass123!FL` |
| FieldLoop Admin / Staff (covers Parts B and C) | `testadmin@gmail.com` | `testadmin` |

You can use each of these as many times as you like, and sign in and out freely — nothing about this guide is a one-time-only action.

---

## The Three Experiences at a Glance

FieldLoop is really three connected experiences, each built for a different person's job. This guide walks through all three, in this order:

| Experience | Who uses it | What it's for |
|---|---|---|
| **Part A — Contractor Dashboard** | The owner/manager of a contracting business (electricians, HVAC, plumbers, etc.) | Their daily command center: schedule jobs, manage technicians and vehicles, track customers, review invoices and reports |
| **Part B — FieldLoop Admin (Platform Overview)** | FieldLoop's own staff | A birds-eye view across every contracting business on the platform — adoption, activity, and revenue in one place |
| **Part C — Registration Dashboard** | FieldLoop's own staff (the same Admin login as Part B) | Where a brand-new contracting business is registered, verified, and activated onto the platform, and given its own login for the Contractor Dashboard |

---

## PART A — The Contractor Dashboard (Business Owner View)

This is what a contracting business owner sees and uses every day once they sign up for FieldLoop. It replaces the usual mix of phone calls, paper job sheets, and spreadsheets with one place to run the business.

### A1. Signing In

**Why it matters:** A secure, simple sign-in is the front door to the business's data — customers, jobs, financials. It needs to be easy for a business owner while keeping everything else locked down.

**Step by step:**
1. Go to **https://app.fieldloopai.com**.
2. Enter the Contractor username and password from the table above.
3. Click **Sign in**.

**How to check it worked:**
- [ ] You land on the main dashboard, with the company's name shown at the top and a row of key numbers (active jobs, active technicians, invoices awaiting approval, unpaid invoices).
- [ ] Try signing in once with a wrong password on purpose — confirm you see a clear, plain-English error message rather than anything confusing or broken.

### A2. Dispatch — Scheduling and Tracking Jobs

**Why it matters:** This is the heart of the business — getting the right technician to the right job at the right time, and knowing at a glance what's happening today. Double-booking a technician costs the business money and annoys customers, so FieldLoop should catch that automatically.

**Step by step:**
1. From the menu on the left, click **Live dispatch**.
2. Click **Schedule new job**.
3. Fill in a customer, a short description of the work, a start and end time, and assign it to a technician.
4. Save the job and confirm it appears on the board.
5. Now try FieldLoop's voice scheduling: click **Voice schedule**, and simply speak a job out loud — for example, *"Schedule a service call for [customer] tomorrow at 10 AM, AC repair, assign it to [technician]."*

**How to check it worked:**
- [ ] The new job appears on the dispatch board with the customer, technician, and time shown clearly.
- [ ] Schedule a second job for the *same* technician at an overlapping time — confirm FieldLoop shows a clear warning about the scheduling conflict instead of silently allowing it.
- [ ] When you use voice scheduling, confirm the job form fills in correctly from what you said, and anything it's unsure about is clearly flagged for you to double-check before saving.

### A3. Technicians — Managing the Workforce

**Why it matters:** An accurate, up-to-date roster of technicians — their contact info, specialty, and pay rate — is the foundation everything else (jobs, invoicing, fleet) is built on.

**Step by step:**
1. Click **Technicians** in the left menu.
2. Click **Add technician** and fill in a name, phone number, specialty, and pay rate.
3. Save — the new technician appears in the list, and FieldLoop sends them a text or email to set up their own account on the mobile app.
4. Click **Edit** on that technician to change a detail, then save again.
5. Click **Deactivate** on a technician you no longer need for this review — confirm it warns you this removes their app access and unassigns any upcoming jobs.

**How to check it worked:**
- [ ] The technician appears in the roster with all the details you entered.
- [ ] Editing a technician's details updates the list immediately.
- [ ] Deactivating a technician removes them from the active list and unassigns their upcoming jobs.

### A4. Fleet & Vehicles

**Why it matters:** Many contracting businesses track their trucks and vans alongside their technicians — who's driving what, and whether it's due for anything.

**Step by step:**
1. Click **Fleet & vehicles**.
2. Click **Add vehicle** and enter a unit number, make, model, and year, and assign it to a technician.
3. Save, then edit the vehicle to confirm changes are saved.

**How to check it worked:**
- [ ] The vehicle appears in the list with the technician correctly assigned.
- [ ] The "Health" column honestly shows no live tracking connected — this is expected today, since no GPS/vehicle-diagnostics hardware is wired in yet, not a bug.

### A5. Customer Database

**Why it matters:** A simple, always-current customer record — contact details, address, job history, and lifetime value — is what lets a business treat repeat customers well and see who its best customers are.

**Step by step:**
1. Click **Customer database**.
2. Click **Add customer** and fill in the household/business name, contact name, phone, and service address.
3. Save, then edit the record to confirm the update sticks.
4. Use the search box to find the customer by name.

**How to check it worked:**
- [ ] The new customer appears in the list, starting at zero jobs and zero lifetime value (since no job has been done for them yet).
- [ ] Search correctly narrows the list down to the matching customer.

### A6. Approvals & Invoices (Reviewing, Not Creating)

**Why it matters:** Estimates and invoices are created out in the field by the technician, on the spot, and signed by the customer there. The business owner's role here is purely to review and approve or reject — not to write the estimate themselves. This keeps the paperwork exactly matched to what the technician and customer actually agreed to.

**Step by step:**
1. Click **Approvals queue**. If nothing has come in from the field yet, you'll see a message saying so — that's expected, since this list only fills up once a technician has sent something from the mobile app (Part C covers that).
2. If an item is waiting for you, review it and click **Approve & bill** or **Reject**.
3. Click **Invoices & payments** to see the read-only invoice list.

**How to check it worked:**
- [ ] There's no way to create or edit an estimate/invoice from this screen — only to approve, reject, or review it. That's intentional.
- [ ] If an item is present, Approve/Reject changes its status correctly.

### A7. Live Field Data

**Why it matters:** A business owner can see, in near real time, which jobs are actively underway (a technician en route or on site) without having to call anyone.

**Step by step:**
1. Click **Live field data**.
2. If no technician is currently en route or on site, you'll see a message saying so — expected, since this depends on real field activity from the mobile app.

**How to check it worked:**
- [ ] The screen updates on its own every 20 seconds or so while you leave it open — no need to refresh it yourself.

### A8. Reports & Follow-Up

**Why it matters:** Owners need an honest read on how the business and its technicians are performing, and a way to make sure past customers aren't forgotten.

**Step by step:**
1. Click **Reports & analytics**.
2. Review the "Jobs completed & billed" figures per technician, and the Fleet Health summary.
3. Scroll to the **Retention queue** — a list of customers due (or overdue) for a follow-up. If any appear, try **Pause** and then **Resume** on one.

**How to check it worked:**
- [ ] The figures shown reflect real jobs and technicians you can recognize from earlier steps — nothing fabricated or "for demo purposes."
- [ ] Pause/Resume on a retention entry updates its status.

### A9. Data Export

**Why it matters:** Businesses sometimes need a full copy of their own records — for their own recordkeeping, an accountant, or a compliance request.

**Step by step:**
1. Click **Data archive & export**.
2. Leave the default options selected (a **Full**, **Jobs**, or **Invoices** export) and click **Request export**.
3. Wait a minute or two, then refresh the request history.

**How to check it worked:**
- [ ] A new entry appears in the request history showing what you asked for and its status.
- [ ] The status moves from *Queued* to *Ready*, and a **Download** button appears — clicking it downloads a real file (a ZIP for a Full export, a CSV for Jobs/Invoices).
- [ ] Note: a **Single job** or **Media only** export currently can't be fulfilled and correctly shows as *Failed* rather than hanging at *Queued* forever — that's a known, honest limitation, not a defect.

### A10. Team & Access

**Why it matters:** Accountability matters — knowing who on the team did what, and when — and a business owner needs a real way to bring on (or remove) other people who can log into their FieldLoop account.

**Step by step:**
1. Click **Team & access**.
2. Click **View audit log**.
3. Click **Invite team member**, enter an email address, and send the invite.
4. Click **Remove** next to a team member you invited, and confirm.

**How to check it worked:**
- [ ] The audit log lists recent actions you performed earlier in this walkthrough (e.g. adding a technician, creating a job), with who did it and when.
- [ ] The invited person appears in the roster with a *Pending setup* status — they'd receive a one-time setup link by email to choose their own password, the same idea as a technician's setup link (A3).
- [ ] Removing a team member takes effect immediately — if they were already signed in, their access is cut off right away, not just hidden from the list.
- [ ] Note: every team member today holds the same single Owner/Admin role — there's no dispatcher/bookkeeper/field-lead style split yet. The role field is shown, not hidden, but only has one real option.

### A11. Knowledge Base Submissions

**Why it matters:** Technicians and business owners build up real-world know-how on the job. FieldLoop lets a business owner submit a useful fact (a code requirement, a rule of thumb) so it can be reviewed and added to the shared knowledge library that the technician app draws on when answering questions in the field (see Part C).

**Step by step:**
1. Click **Knowledge Base**.
2. Fill in the short form — a trade, a category, a title, and the fact itself — and click **Submit for review**.

**How to check it worked:**
- [ ] Your submission appears below under "Your submissions" marked as pending.
- [ ] There's no way to approve your own submission from here — that only happens on the Admin side (Part B), which is correct: nothing gets added to the shared library without review.

### A12. Signing Out

Click **Logout** in the top corner. Confirm you're returned to the sign-in page.

---

## PART B — FieldLoop Admin (Platform Overview)

This is the view used internally by the FieldLoop team, not by any individual contracting business. It's a single screen showing every business on the platform at once — useful for tracking overall adoption, health, and revenue as the product grows.

### B1. Signing In as Admin

**Step by step:**
1. Sign out of the Contractor view if you're still signed in.
2. Go to **https://app.fieldloopai.com** and sign in with the Admin username and password from the table above.

**How to check it worked:**
- [ ] You land directly on the Platform Overview screen, with five tabs across the top: **Overview, Contractors, Usage, Revenue, Knowledge Base**.

### B2. Overview Tab

**Why it matters:** A single-glance summary of the whole business — how many contracting companies are on the platform, how many are active, and how much work is flowing through the system.

**How to check it worked:**
- [ ] Key numbers are shown (total contracting businesses, active technicians, jobs completed, revenue collected).
- [ ] Revenue currently shows $0 — this is honest, not a bug: real payment collection hasn't been switched on yet, a known next step for the business rather than something broken.

### B3. Contractors Tab

**Why it matters:** Lets FieldLoop staff find and check in on any specific contracting business.

**Step by step:**
1. Click the **Contractors** tab.
2. Search for the contracting business you interacted with in Part A.
3. Click its row to open its full profile.

**How to check it worked:**
- [ ] The profile page shows that business's real technicians, jobs, invoices, and knowledge-base submissions — matching exactly what you did in Part A.

### B4. Usage & Revenue Tabs

**How to check it worked:**
- [ ] The **Usage** tab reflects the job(s) you created in Part A.
- [ ] The **Revenue** tab honestly shows no revenue collected yet, rather than a made-up figure.

### B5. Reviewing Knowledge Base Submissions

**Why it matters:** This is the review step that keeps the shared knowledge library accurate — nothing a contractor or technician submits goes live until FieldLoop staff sign off on it.

**Step by step:**
1. Click the **Knowledge Base** tab.
2. Find the submission you made in Part A11.
3. Click **Approve** (or **Reject**, if you'd rather test that path).

**How to check it worked:**
- [ ] The submission's status changes.
- [ ] Sign back in as the Contractor (Part A) and confirm the submission now shows the updated status.

### B6. Signing Out

Click **Sign out**. Confirm you land back on the sign-in page.

---

## PART C — Registration Dashboard (Onboarding a New Contractor)

This is the tool FieldLoop's own staff use to bring a brand-new contracting business onto the platform — verifying who they are, checking their licensing and insurance, setting up how they get paid, and finally switching them on as a live, paying customer. It's also where staff look up and manage any contractor's file after the fact.

### C1. Signing In to the Registration Dashboard

**Why it matters:** This tool holds sensitive business, legal, and banking information for every contractor on the platform, so it needs its own secure, staff-only entry point.

**Step by step:**
1. Go to **https://app.fieldloopai.com** and sign in with the Admin username and password from the credentials table above.
2. Since Admin lands on the Platform Overview screen by default (Part B), click **Registration Dashboard** in the header to switch into this tool.

**How to check it worked:**
- [ ] You land on the Registration Dashboard, with two tabs available: **New Registration** and **Existing Contractors**.

### C2. Starting a New Contractor's Registration

**Why it matters:** This is the very first step in turning a prospective contracting business into a paying FieldLoop customer.

**Step by step:**
1. On the **New Registration** tab, enter a **Legal Business Name** and an **EIN / Tax ID**.
2. Click **Create Contractor & Continue**.

**How to check it worked:**
- [ ] A new contractor record is created, and you're taken straight into a step-by-step onboarding wizard.
- [ ] Trying to continue with either field left blank is blocked with a clear error message.

### C3. Business Profile & Owner Verification

**Why it matters:** FieldLoop needs to know exactly who it's doing business with — both the company and the real person behind it — the same "know your customer" check any legitimate financial platform performs.

**Step by step:**
1. Fill in the business's trade name, structure, phone, email, and address, then save and continue.
2. Fill in the owner's name, date of birth, last 4 of their SSN, and contact details, then save and continue.

**How to check it worked:**
- [ ] Sensitive personal details (date of birth, SSN, home address) save correctly and, once saved, are shown masked with a **Reveal** option — protecting sensitive personal data even from someone looking over your shoulder.

### C4. Key Contacts

**Why it matters:** A business may need more than one point of contact on file — for example, a day-to-day contact and a separate emergency contact.

**Step by step:**
1. Fill in the first contact's details.
2. Click **Add Contact** to add a second one.
3. Try deleting contacts down to just one, then try deleting that last one.

**How to check it worked:**
- [ ] You can add more than one contact.
- [ ] FieldLoop won't let you remove the very last contact — a business must always have at least one way to reach it on file.

### C5. Compliance & Licensing

**Why it matters:** Verifying a contractor's real license, insurance, and legal paperwork protects customers, FieldLoop, and the contractor itself from the risk of unlicensed or uninsured work — this check is core to FieldLoop's credibility as a platform.

**Step by step:**
1. Fill in the state license, general liability insurance, workers' comp, and W-9 sections.
2. Add an extra trade license using the text box and **Add License** button.

**How to check it worked:**
- [ ] The extra license appears as its own removable tag.

### C6. Operations & Workforce

**Why it matters:** Knowing a contractor's trade, coverage area, and crew size upfront helps FieldLoop understand who's actually using the platform and plan support accordingly.

**Step by step:**
1. Fill in the primary trade, at least one service offered, service area, business hours, and technician/vehicle counts.

**How to check it worked:**
- [ ] Everything saves and the wizard advances to the next step.

### C7. Banking & Payouts

**Why it matters:** This is how a contractor actually gets paid through FieldLoop — getting it right, and keeping it secure, is essential to earning their trust.

**Step by step:**
1. Fill in the bank name, account type, routing number, and account number.
2. Click **Reveal** next to the routing/account numbers to confirm what you entered, then **Hide** again.

**How to check it worked:**
- [ ] Banking numbers are masked by default with a working Reveal option, confirming this sensitive financial data is protected.

### C8. Activating the Contractor

**Why it matters:** This is the finish line of onboarding — turning a filled-out application into a live, fully active customer on the platform.

**Step by step:**
1. Review the final internal settings step (the contractor's ID and onboarding date are filled in automatically).
2. Click **Save & Activate Contractor**.

**How to check it worked:**
- [ ] If anything required from an earlier step is missing, you're shown exactly what's missing with a link that jumps straight to it.
- [ ] Once activated, a confirmation screen appears.

### C9. Creating the Contractor's Portal Login

**Why it matters:** The moment a contractor is activated, they need their own username and password to actually start using the Contractor Dashboard (Part A).

**Step by step:**
1. On the confirmation screen, enter a login email and a password meeting the rules shown, in both the Password and Confirm Password fields.
2. Click **Save Credentials & Finish**.

**How to check it worked:**
- [ ] Mismatched passwords are caught with a clear message before you can continue.
- [ ] A summary screen shows the new login, and you can copy it to use later.

### C10. Finding an Existing Contractor

**Why it matters:** Staff need to look up and revisit any contractor's file at any time — for support, a follow-up, or an update — not just at signup.

**Step by step:**
1. Click the **Existing Contractors** tab.
2. Search by the business name you just registered, or paste in its ID.

**How to check it worked:**
- [ ] The correct contractor loads back in, exactly where you left off.

### C11. Signing Out

Click **Sign out**. Confirm you land back on the sign-in page.

---

## Final Sign-Off Checklist

Before wrapping up your review, confirm the following — together, these show FieldLoop working end-to-end across all three experiences and roles:

- [ ] Signed in and out successfully as the Contractor, the Admin, and the Technician.
- [ ] Scheduled a job as the Contractor, both manually and by voice, and saw a scheduling conflict correctly flagged.
- [ ] Added and managed a technician, a vehicle, and a customer from the Contractor dashboard.
- [ ] Completed a full field job as the Technician: arrival, photos, a dictated estimate, a change order, a question asked, and marking the job complete.
- [ ] Watched an estimate/change order go from "sent" to "approved" and confirmed both the technician's and business owner's screens reflected it.
- [ ] Submitted a Knowledge Base fact as the Contractor and approved it as the Admin, then saw the status update on the Contractor side.
- [ ] Reviewed the FieldLoop Admin's company-wide Overview, Contractors, Usage, and Revenue tabs and confirmed they matched the real activity you generated.
- [ ] Understood which pieces are intentionally not live yet (invoicing, online payments, live vehicle tracking, multi-role team permissions) versus what's fully working today.

If everything above checks out, you've experienced FieldLoop the way each of its real users would — and are in a good position to judge whether it matches what the business needs.
