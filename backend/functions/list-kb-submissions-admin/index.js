// backend/functions/list-kb-submissions-admin/index.js
// POST /kb/admin/submissions — admin-only. Every contractor's KB fact
// submissions (not just one contractor's, unlike list-my-kb-submissions),
// for the Platform Overview's review queue. A submission is any kb_entries
// row with created_by set — the bulk CSV importer (import-kb-entries.mjs)
// never sets that column, so it's a reliable way to isolate contractor
// submissions from the original 500-fact import.
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { enforceIpAllowlist } = require('./shared/ipAllowlist');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    const flUser = await requireRole(event, ['admin']);
    await enforceIpAllowlist(event, flUser);
    const body = event.body ? JSON.parse(event.body) : {};
    const { status } = body; // optional filter: 'pending' | 'approved' | 'rejected' | 'superseded'

    const supabase = await getSupabaseClient();

    let query = supabase
      .from('kb_entries')
      .select('id, fact_title, fact, status, import_batch, created_by, created_at, reviewed_at, reviewed_by, kb_trades ( name ), kb_categories ( name )')
      .not('created_by', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (status) query = query.eq('status', status);

    const { data: entries, error } = await query;
    if (error) throw new Error(error.message);

    // Resolve submitter (contractor_users.id -> contractors.legal_name) —
    // created_by has no FK (verified live), so this is a manual lookup.
    const submitterIds = [...new Set(entries.map((e) => e.created_by).filter(Boolean))];
    let contractorNameBySubmitter = {};
    if (submitterIds.length) {
      const { data: submitters } = await supabase
        .from('contractor_users').select('id, contractor_id, email').in('id', submitterIds);
      const contractorIds = [...new Set((submitters || []).map((s) => s.contractor_id))];
      const { data: contractorRows } = await supabase.from('contractors').select('id, legal_name').in('id', contractorIds);
      const nameByContractor = Object.fromEntries((contractorRows || []).map((c) => [c.id, c.legal_name]));
      contractorNameBySubmitter = Object.fromEntries(
        (submitters || []).map((s) => [s.id, { legal_name: nameByContractor[s.contractor_id] || 'Unknown', email: s.email }])
      );
    }

    const enriched = entries.map((e) => ({ ...e, submitter: contractorNameBySubmitter[e.created_by] || null }));

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ submissions: enriched }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') || err.message.includes('Blocked') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
