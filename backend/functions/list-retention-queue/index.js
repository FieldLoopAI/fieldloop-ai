// backend/functions/list-retention-queue/index.js
// POST /retention/list — real data for Panel 8's "Retention queue" sub-panel
// (HANDOFF.md §11.3 Beat 8: automated 24hr/48hr/3mo/12mo follow-ups).
//
// Two things are honestly real here and one is a documented approximation:
//   - which customers are actually due for a follow-up, computed from real
//     jobs/customers data — real.
//   - Pause/Resume — writes a real `paused` flag into customers.retention_flags
//     (a jsonb column already scoped for `day1_sent`/`month3_sent`/
//     `month12_sent` per the original schema doc) — real.
//   - the "anchor" timestamp a follow-up is computed from is jobs.updated_at
//     on that customer's most recently touched completed job — there is no
//     `completed_at` column on `jobs` (confirmed live, HANDOFF.md §27.1-style
//     probe), so `updated_at` is the best real proxy available. This is an
//     approximation, not a guess dressed up as fact — flagged here and in
//     HANDOFF.md.
//   - Only 3 checkpoints exist in the schema's own `retention_flags` shape
//     (day1/month3/month12) — the job spine's 48hr checkpoint (§11.3) has no
//     schema slot today; not invented here, flagged as a gap instead.
//
// No automated sending exists anywhere in this repo (Beat 8 is described in
// the planning docs as "Backend, no human touch") — this Lambda only ever
// computes and returns what's due; nothing here ever marks a checkpoint
// "sent". That's real future work (a scheduler + messagingAdapter.js
// integration), tracked in HANDOFF.md, not built in this pass.
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };
const COMPLETED_STATUSES = ['complete', 'closed', 'invoiced', 'paid'];
const DAY_MS = 24 * 60 * 60 * 1000;
const CHECKPOINTS = [
  { key: 'day1_sent', label: 'Day-1 review request', offsetDays: 1 },
  { key: 'month3_sent', label: '3-month check-in', offsetDays: 90 },
  { key: 'month12_sent', label: '12-month anniversary', offsetDays: 365 },
];

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const supabase = await getSupabaseClient();

    const { data: customers, error: cErr } = await supabase
      .from('customers')
      .select('id, household_name, retention_flags')
      .eq('contractor_id', contractorUser.contractor_id);
    if (cErr) throw new Error(cErr.message);

    const { data: jobs, error: jErr } = await supabase
      .from('jobs')
      .select('id, job_id_public, customer_id, updated_at')
      .eq('contractor_id', contractorUser.contractor_id)
      .in('status', COMPLETED_STATUSES);
    if (jErr) throw new Error(jErr.message);

    // Most recently touched completed job per customer, used as the
    // follow-up anchor date (see file header re: no real completed_at).
    const latestJobByCustomer = {};
    for (const j of jobs) {
      const existing = latestJobByCustomer[j.customer_id];
      if (!existing || new Date(j.updated_at) > new Date(existing.updated_at)) {
        latestJobByCustomer[j.customer_id] = j;
      }
    }

    const now = Date.now();
    const queue = [];
    for (const customer of customers) {
      const anchorJob = latestJobByCustomer[customer.id];
      if (!anchorJob) continue; // no completed work yet — nothing to follow up on

      const flags = customer.retention_flags || {};
      const nextCheckpoint = CHECKPOINTS.find((c) => !flags[c.key]);
      if (!nextCheckpoint) continue; // every checkpoint already marked sent

      const anchorTime = new Date(anchorJob.updated_at).getTime();
      const dueAt = anchorTime + nextCheckpoint.offsetDays * DAY_MS;

      queue.push({
        customer_id: customer.id,
        customer_name: customer.household_name,
        checkpoint: nextCheckpoint.key,
        checkpoint_label: nextCheckpoint.label,
        job_id_public: anchorJob.job_id_public,
        due_at: new Date(dueAt).toISOString(),
        due_now: dueAt <= now,
        paused: Boolean(flags.paused),
      });
    }

    queue.sort((a, b) => new Date(a.due_at) - new Date(b.due_at));

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ queue }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
