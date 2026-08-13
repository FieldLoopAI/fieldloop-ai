// backend/functions/list-kb-trades/index.js
//
// POST /kb/trades — lets a caller discover which trade/subcategory slugs
// are valid to pass to search-kb-entries, without needing to query
// Supabase directly. Exists specifically so the mobile app can stay
// Lambda-mediated only (MOBILE_TEAM_HANDOFF.md §2.2d's firm rule for
// technician sessions) rather than reading kb_trades/kb_subcategories
// straight from the client even though their RLS policies would allow it.
const { requireContractorRole } = require('./shared/contractorAuth');
const { requireTechnicianAuth } = require('./shared/technicianAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

async function authenticateEitherCaller(event) {
  try {
    await requireContractorRole(event, ['owner_admin']);
    return;
  } catch (contractorErr) {
    try {
      await requireTechnicianAuth(event);
      return;
    } catch (_technicianErr) {
      throw new Error(contractorErr.message.includes('No authorization header') ? 'No authorization header' : 'Not permitted: no valid contractor or technician session.');
    }
  }
}

exports.handler = async (event) => {
  try {
    await authenticateEitherCaller(event);

    const supabase = await getSupabaseClient();

    const { data: trades, error: tradesError } = await supabase
      .from('kb_trades').select('id, slug, name').order('name');
    if (tradesError) throw tradesError;

    const { data: subcategories, error: subcategoriesError } = await supabase
      .from('kb_subcategories').select('id, trade_id, slug, name').order('name');
    if (subcategoriesError) throw subcategoriesError;

    const result = trades.map((trade) => ({
      slug: trade.slug,
      name: trade.name,
      subcategories: subcategories
        .filter((s) => s.trade_id === trade.id)
        .map((s) => ({ slug: s.slug, name: s.name })),
    }));

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ trades: result }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') || err.message.includes('Not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
