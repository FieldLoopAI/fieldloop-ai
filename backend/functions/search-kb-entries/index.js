// backend/functions/search-kb-entries/index.js
//
// POST /kb/search — the actual "ask a question, get an answer" endpoint.
// Reachable by both contractor dashboard users and technicians (the mobile
// app's eventual consumer) — the first endpoint in this project either
// caller type needs to reach, so it tries both auth paths rather than
// picking one. Query flow per Fieldloop Docs\FieldLoop_KB_Technical_Design.md
// §4.2: embed the question, hybrid search (match_kb_entries), and only pay
// for a full LLM call when the top match isn't confident enough to answer
// from directly — this is the single biggest cost/latency lever available,
// not an afterthought.
const { requireContractorRole } = require('./shared/contractorAuth');
const { requireTechnicianAuth } = require('./shared/technicianAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { getSecret } = require('./shared/secrets');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };
const EMBEDDING_MODEL = 'text-embedding-3-small';
// Recalibrated 2026-08-10 against real queries on the 500-fact driveway
// dataset (text-embedding-3-small): a clearly-correct match on a short
// technical fact scored 0.78-0.63 similarity, well under the original
// 0.82 starting point from the design doc — meaning every question was
// escalating to the LLM even with a clean match available. A genuinely
// vague/unrelated question's best "match" scored ~0.55, so there's real
// separation, just centered lower than assumed. Still provisional — see
// design doc §6 item 6, this needs to keep being tuned against real usage.
const CONFIDENCE_THRESHOLD = 0.70;

async function authenticateEitherCaller(event) {
  try {
    const contractor = await requireContractorRole(event, ['owner_admin']);
    return { caller: contractor, callerType: 'contractor' };
  } catch (contractorErr) {
    try {
      const technician = await requireTechnicianAuth(event);
      return { caller: technician, callerType: 'technician' };
    } catch (_technicianErr) {
      throw new Error(contractorErr.message.includes('No authorization header') ? 'No authorization header' : 'Not permitted: no valid contractor or technician session.');
    }
  }
}

async function getOpenAiKey() {
  const raw = await getSecret('fieldloop/openai-api-key');
  const apiKey = JSON.parse(raw).apiKey;
  if (!apiKey) throw new Error('Knowledge base search is not configured yet — fieldloop/openai-api-key is missing its apiKey.');
  return apiKey;
}

async function embedQuery(apiKey, text) {
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

async function escalateToLlm(apiKey, question, matches) {
  const context = matches
    .map((m, i) => `${i + 1}. ${m.fact_title}: ${m.fact}${m.verify_locally ? ' [may vary by local jurisdiction]' : ''}`)
    .join('\n');
  const systemPrompt = `You answer a contractor's on-site question using ONLY the reference facts provided below. Never invent information beyond them. If the facts don't actually answer the question, say plainly that the knowledge base doesn't have this information yet — never guess a plausible-sounding answer.\n\nReference facts:\n${context}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-2024-07-18',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`OpenAI escalation failed: ${errBody.error?.message || res.statusText}`);
  }
  const completion = await res.json();
  return completion.choices?.[0]?.message?.content?.trim() || "I don't have enough information to answer that.";
}

exports.handler = async (event) => {
  try {
    const { callerType } = await authenticateEitherCaller(event);

    const { question, trade_slug, subcategory_slug } = JSON.parse(event.body || '{}');
    if (!question?.trim()) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'question is required.' }) };
    }
    if (!trade_slug) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'trade_slug is required.' }) };
    }

    const supabase = await getSupabaseClient();

    const { data: trade, error: tradeError } = await supabase
      .from('kb_trades').select('id').eq('slug', trade_slug).single();
    if (tradeError || !trade) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `Unknown trade_slug: ${trade_slug}` }) };
    }

    let subcategoryId = null;
    if (subcategory_slug) {
      const { data: subcategory, error: subcategoryError } = await supabase
        .from('kb_subcategories').select('id').eq('trade_id', trade.id).eq('slug', subcategory_slug).single();
      if (subcategoryError || !subcategory) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `Unknown subcategory_slug: ${subcategory_slug}` }) };
      }
      subcategoryId = subcategory.id;
    }

    const apiKey = await getOpenAiKey();
    const queryEmbedding = await embedQuery(apiKey, question.trim());

    const { data: matches, error: rpcError } = await supabase.rpc('match_kb_entries', {
      query_text: question.trim(),
      query_embedding: queryEmbedding,
      filter_trade_id: trade.id,
      filter_subcategory_id: subcategoryId,
      match_count: 5,
    });
    if (rpcError) throw rpcError;

    if (!matches || matches.length === 0) {
      return {
        statusCode: 200, headers: CORS_HEADERS,
        body: JSON.stringify({ answer: "The knowledge base doesn't have anything on this yet.", source: 'no_match', verify_locally: false, matches: [] }),
      };
    }

    const top = matches[0];
    if (top.similarity >= CONFIDENCE_THRESHOLD) {
      return {
        statusCode: 200, headers: CORS_HEADERS,
        body: JSON.stringify({
          answer: top.fact,
          fact_title: top.fact_title,
          verify_locally: top.verify_locally,
          source: 'retrieval',
          similarity: top.similarity,
          caller_type: callerType,
        }),
      };
    }

    const llmAnswer = await escalateToLlm(apiKey, question.trim(), matches);
    return {
      statusCode: 200, headers: CORS_HEADERS,
      body: JSON.stringify({
        answer: llmAnswer,
        source: 'llm_escalation',
        verify_locally: matches.some((m) => m.verify_locally),
        matches: matches.map((m) => ({ fact_title: m.fact_title, similarity: m.similarity })),
        caller_type: callerType,
      }),
    };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') || err.message.includes('Not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
