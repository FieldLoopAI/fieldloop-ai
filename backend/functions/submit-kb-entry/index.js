// backend/functions/submit-kb-entry/index.js
// POST /kb/submit — lets a contractor (owner_admin) submit their own fact to
// the FieldLoop AI Knowledge Base. Inserts as status: 'pending', same as
// backend/scripts/import-kb-entries.mjs's bulk CSV path — a FieldLoop
// reviewer approves (backend/scripts/approve-kb-entries.mjs) or rejects
// (reject-kb-entries.mjs) it before it's ever searchable via /kb/search.
// Resolves-or-creates the subcategory/category the same way
// import-kb-entries.mjs's resolveHierarchy() does, scoped under an
// existing trade (trade itself must already exist — picked from
// /kb/trades — so a contractor can't spawn a brand-new top-level trade).
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { getSecret } = require('./shared/secrets');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };
const EMBEDDING_MODEL = 'text-embedding-3-small';

function slugify(name) {
  return name.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

async function embedFact(apiKey, text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`OpenAI embedding failed: ${errBody.error?.message || res.statusText}`);
  }
  const json = await res.json();
  return json.data[0].embedding;
}

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const body = JSON.parse(event.body || '{}');
    const {
      trade_slug, subcategory_name, category_name,
      fact_title, fact, topic_tags, source_type, verify_locally,
    } = body;

    const factTitle = (fact_title || '').trim();
    const factText = (fact || '').trim();
    const subcategoryName = (subcategory_name || '').trim();
    const categoryName = (category_name || '').trim();

    if (!trade_slug) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'trade_slug is required.' }) };
    if (!factTitle || !factText) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'fact_title and fact are both required.' }) };
    if (!subcategoryName || !categoryName) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'subcategory_name and category_name are both required.' }) };

    const supabase = await getSupabaseClient();

    const { data: trade } = await supabase.from('kb_trades').select('id').eq('slug', trade_slug).maybeSingle();
    if (!trade) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `Unknown trade_slug: ${trade_slug}` }) };

    const subcategorySlug = slugify(subcategoryName);
    let { data: subcategory } = await supabase
      .from('kb_subcategories').select('id').eq('trade_id', trade.id).eq('slug', subcategorySlug).maybeSingle();
    if (!subcategory) {
      const { data: newSub, error: subErr } = await supabase
        .from('kb_subcategories').insert({ trade_id: trade.id, slug: subcategorySlug, name: subcategoryName }).select('id').single();
      if (subErr) throw new Error(subErr.message);
      subcategory = newSub;
    }

    const categorySlug = slugify(categoryName);
    let { data: category } = await supabase
      .from('kb_categories').select('id').eq('subcategory_id', subcategory.id).eq('slug', categorySlug).maybeSingle();
    if (!category) {
      const { data: newCat, error: catErr } = await supabase
        .from('kb_categories').insert({ subcategory_id: subcategory.id, slug: categorySlug, name: categoryName }).select('id').single();
      if (catErr) throw new Error(catErr.message);
      category = newCat;
    }

    const apiKeyRaw = await getSecret('fieldloop/openai-api-key');
    const apiKey = JSON.parse(apiKeyRaw).apiKey;
    if (!apiKey) throw new Error('Knowledge base submission is not configured yet — fieldloop/openai-api-key is missing its apiKey.');
    const embedding = await embedFact(apiKey, `${factTitle}. ${factText}`);

    const importBatch = `contractor_submission_${contractorUser.contractor_id.slice(0, 8)}_${Date.now()}`;
    const tags = Array.isArray(topic_tags)
      ? topic_tags.map((t) => String(t).trim()).filter(Boolean)
      : String(topic_tags || '').split(',').map((t) => t.trim()).filter(Boolean);

    const { data: entry, error } = await supabase
      .from('kb_entries')
      .insert({
        category_id: category.id,
        trade_id: trade.id,
        subcategory_id: subcategory.id,
        fact_title: factTitle,
        fact: factText,
        topic_tags: tags,
        source_type: (source_type || '').trim() || 'contractor submission',
        verify_locally: Boolean(verify_locally),
        embedding,
        embedding_model_version: EMBEDDING_MODEL,
        status: 'pending',
        import_batch: importBatch,
        created_by: contractorUser.id,
      })
      .select('id, import_batch, status')
      .single();
    if (error) throw new Error(error.message);

    return {
      statusCode: 200, headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        entry,
        message: "Submitted — a FieldLoop reviewer will approve this before it appears in Knowledge Base search results.",
      }),
    };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
