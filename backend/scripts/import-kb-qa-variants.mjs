// backend/scripts/import-kb-qa-variants.mjs
//
// Bulk importer for the "Question/Answer_OnSite_Format/Category/SubCategory/
// Code_Reference" CSV shape (Bob's 2026-08-21 trade content: Roofing,
// Insulation, Concrete & Pavers, General Contractor — ~17,000 raw rows
// combined). This is a DIFFERENT shape from import-kb-entries.mjs's
// fact_title/fact/category/verify_locally CSVs (the original 500-fact
// Concrete sample) — kept as a separate script rather than bolted onto the
// original importer, since the processing pipeline is fundamentally
// different (clustering + title generation vs. a direct 1-row-1-fact copy).
//
// Field mapping, confirmed with Bob (Prem Knowledge Base Questions
// 08_21_20.md) and the client's earlier design doc answers:
//   - Answer_OnSite_Format = the fact (stored + spoken to the technician).
//   - Question / Question_Variations = recognition phrasing ONLY — never
//     stored or spoken verbatim, folded into the embedding + topic_tags of
//     the single canonical entry instead.
//   - CSV Category (10/trade, broad)    -> DB subcategory
//   - CSV SubCategory (100/trade, fine) -> DB category
//     (inverted names between the CSV and the DB schema — confirmed
//     deliberately with Bob, see Q2 in the review doc above.)
//   - Code_Reference -> source_type, and drives the verify_locally flag.
//
// Each (Category, SubCategory) group holds ~5 underlying facts x ~N
// phrasing variants (N varies, not a fixed count). Per Bob's answer to Q3,
// we do NOT store all N variant rows — one clean primary entry per fact,
// with every variant's recognition phrasing folded into that one entry
// (embedding + topic_tags), never stored as separate near-duplicate rows.
// Clustering uses real-embedding cosine similarity within each
// (Category,SubCategory) group (max ~50 rows -> cheap), threshold 0.85 —
// empirically calibrated against a real group of this data: same-fact pairs
// scored 0.85-0.97, different-fact pairs (same subcategory) scored
// 0.42-0.76, with a clean gap at 0.80-0.85. Not guessed.
//
// Usage:
//   node import-kb-qa-variants.mjs <csv> --trade="Roofing" [--dry-run] [--limit=200]
//
// --dry-run: runs the full pipeline (embeddings + title generation, real
//   API calls) but skips creating new subcategory/category rows and skips
//   the final kb_entries insert — prints what it WOULD do. Use this first.
// --limit=N: only process the first N raw rows (for fast iteration).

import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import secretsModule from './shared/secrets.js';
import supabaseClientModule from './shared/supabaseClient.js';
const { getSecret } = secretsModule;
const { getSupabaseClient } = supabaseClientModule;

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBED_BATCH_SIZE = 100;
const CHAT_MODEL = 'gpt-4o-mini-2024-07-18';

// Any of these tokens appearing anywhere in Code_Reference (split on '/')
// means "flag verify_locally = true" per Bob's rule: a real code/standard
// citation can vary by jurisdiction/adoption cycle; a generic citation
// (manufacturer spec, standard/industry/best practice, building science
// guidance, engineering judgment, etc.) does not.
const CODE_BODY_PATTERN = /\b(IRC|IPC|IMC|IECC|NEC|ACI|ICPI|NCMA|ASTM|OSHA|ANSI|ADA|ICC|NFPA|UL|TCNA|RESNET|PROWAG|ASCE|ASME|IBC|HVI|DOE|EPA|ASHRAE|NKBA(?!\s*guideline)|OSHA)\b/i;
const CODE_BODY_PHRASE_PATTERN = /(local\s+(building\s+department|building\s+code|code|amendment|zoning|ordinance|public\s+works|stormwater|drainage|energy\s+code|wildfire|one-call|recycling|historic\s+preservation)|state\s+licensing\s+board)/i;

function slugify(name) {
  return name.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseArgs(argv) {
  const csvPath = argv[2];
  const flags = { dryRun: false, limit: null };
  for (const arg of argv.slice(3)) {
    if (arg === '--dry-run') { flags.dryRun = true; continue; }
    const m = arg.match(/^--([a-z]+)=(.*)$/i);
    if (!m) continue;
    if (m[1] === 'trade') flags.trade = m[2].replace(/^"|"$/g, '');
    if (m[1] === 'limit') flags.limit = parseInt(m[2], 10);
  }
  if (!csvPath || !flags.trade) {
    console.error('Usage: node import-kb-qa-variants.mjs <csv> --trade="Roofing" [--dry-run] [--limit=200]');
    process.exit(1);
  }
  return { csvPath, ...flags };
}

function validateRows(rawRows) {
  const valid = [];
  const rejected = [];
  const warnings = [];
  for (const [i, row] of rawRows.entries()) {
    const rowNum = i + 2;
    const question = (row.Question || '').trim();
    const answer = (row.Answer_OnSite_Format || '').trim();
    const category = (row.Category || '').trim();
    const subcategory = (row.SubCategory || '').trim();
    const codeRef = (row.Code_Reference || '').trim();
    if (!question || !answer || !category || !subcategory || !codeRef) {
      rejected.push({ row: rowNum, reason: 'missing Question/Answer_OnSite_Format/Category/SubCategory/Code_Reference' });
      continue;
    }
    const combined = question + answer + (row.Question_Variations || '');
    if (/�|â€/.test(combined)) {
      warnings.push({ row: rowNum, warning: 'possible mangled encoding' });
    }
    valid.push({
      rowNum,
      question,
      variations: (row.Question_Variations || '').trim(),
      answer,
      category, // CSV Category -> DB subcategory
      subcategory, // CSV SubCategory -> DB category
      codeRef,
    });
  }
  return { valid, rejected, warnings };
}

async function embedInBatches(apiKey, texts) {
  const embeddings = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(`OpenAI embedding batch failed: ${errBody.error?.message || res.statusText}`);
    }
    const json = await res.json();
    embeddings.push(...json.data.map((d) => d.embedding));
    process.stdout.write(`\r  embedded ${Math.min(i + EMBED_BATCH_SIZE, texts.length)}/${texts.length}`);
  }
  process.stdout.write('\n');
  return embeddings;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Clustering signal: NOT embedding similarity — confirmed by direct
// inspection (see the KB import discussion) that a single similarity
// threshold over-merges genuinely distinct facts whenever a subcategory has
// several closely-related-but-numerically-different facts (e.g. "3.5in
// batt -> R-13" and "5.5in batt -> R-19" scored well above 0.85 against
// each other, since both are about "batt R-value by wall depth"). That's a
// real correctness risk, not just a tidiness one — the wrong canonical
// answer could get picked for a fact family that actually has several
// distinct correct answers.
//
// The reliable signal instead: every row in this dataset is generated as
// <templated lead-in phrase> + <core fact content>, and the core fact
// content is BYTE-IDENTICAL across every phrasing variant of the same
// underlying fact (confirmed across Roofing, Insulation, and General
// Contractor samples) — lead-ins vary in length/wording, but the tail never
// does. A FIXED-length suffix window doesn't work here: a short fact's
// content (as little as ~79 chars in real data) is shorter than a
// generously-sized window, so the window overflows into the (variable-
// length) lead-in and desyncs the match — confirmed directly, not assumed
// (a 90-char window split one true 4-row cluster into 4 singletons because
// each lead-in bled a different number of leftover characters into it).
//
// Instead: compare each PAIR by their actual longest common suffix,
// relative to their own lengths — no fixed window, so it adapts to
// whatever the real content length is. Two rows are the same fact if they
// share an identical tail covering at least 70% of the shorter answer's
// length (and at least 30 characters, to avoid a coincidental short
// punctuation-only match).
const LCS_MIN_ABSOLUTE = 30;
const LCS_MIN_RATIO = 0.7;

function longestCommonSuffixLength(a, b) {
  let i = a.length - 1, j = b.length - 1, count = 0;
  while (i >= 0 && j >= 0 && a[i] === b[j]) { count++; i--; j--; }
  return count;
}

function sameFactBySuffix(a, b) {
  const na = a.trim().replace(/\s+/g, ' ').toLowerCase();
  const nb = b.trim().replace(/\s+/g, ' ').toLowerCase();
  const lcs = longestCommonSuffixLength(na, nb);
  return lcs >= LCS_MIN_ABSOLUTE && lcs >= LCS_MIN_RATIO * Math.min(na.length, nb.length);
}

function clusterGroup(indices, valid) {
  const parent = new Map(indices.map((i) => [i, i]));
  function find(x) { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; }
  function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); }

  for (let a = 0; a < indices.length; a++) {
    for (let b = a + 1; b < indices.length; b++) {
      const i = indices[a], j = indices[b];
      if (sameFactBySuffix(valid[i].answer, valid[j].answer)) union(i, j);
    }
  }

  const clusters = new Map();
  for (const i of indices) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(i);
  }
  return [...clusters.values()];
}

// Safety net, not the clustering mechanism itself: after suffix-clustering,
// flag (don't silently trust) any multi-row cluster whose average pairwise
// embedding similarity is surprisingly low — that would mean the
// suffix-match assumption broke down for this cluster (e.g. a near-miss
// punctuation difference) and it needs a human look, not blind acceptance.
const SAFETY_SIMILARITY_FLOOR = 0.80;

function averagePairwiseSimilarity(clusterIndices, embeddings) {
  if (clusterIndices.length < 2) return 1;
  let sum = 0, n = 0;
  for (let a = 0; a < clusterIndices.length; a++) {
    for (let b = a + 1; b < clusterIndices.length; b++) {
      sum += cosineSimilarity(embeddings[clusterIndices[a]], embeddings[clusterIndices[b]]);
      n++;
    }
  }
  return sum / n;
}

// Picks the row whose embedding is most "central" (highest average
// similarity to the rest of the cluster) as the canonical representative,
// rather than an arbitrary first-row pick.
function pickCanonical(clusterIndices, embeddings) {
  if (clusterIndices.length === 1) return clusterIndices[0];
  let best = clusterIndices[0], bestScore = -Infinity;
  for (const i of clusterIndices) {
    let sum = 0;
    for (const j of clusterIndices) {
      if (i === j) continue;
      sum += cosineSimilarity(embeddings[i], embeddings[j]);
    }
    const avg = sum / (clusterIndices.length - 1);
    if (avg > bestScore) { bestScore = avg; best = i; }
  }
  return best;
}

function classifyVerifyLocally(codeRef) {
  const parts = codeRef.split('/').map((p) => p.trim());
  return parts.some((p) => CODE_BODY_PATTERN.test(p) || CODE_BODY_PHRASE_PATTERN.test(p));
}

// One call per fact, not a batch — a batched numbered-list prompt hit a
// real, silent-corruption-risk failure mode (asked for 20 titles, GPT
// returned 21, with no reliable way to know which input each extra title
// belonged to). A 1:1 call has no alignment ambiguity: the response is
// either this fact's title or a clear per-fact error. Run with bounded
// concurrency (TITLE_CONCURRENCY parallel in flight) so ~2-4k facts still
// finishes in a reasonable time despite the extra round trips — pure
// latency, not correctness, is the tradeoff being made here.
const TITLE_CONCURRENCY = 8;

async function generateOneTitle(apiKey, answer) {
  const prompt = `Write a short descriptive title (3-7 words, like "Subgrade Soil Stripping" or "Shingle Wind Ratings") that identifies what this fact is about. Do not restate the whole fact. Return ONLY a JSON object: {"title": "..."}\n\nFact: ${answer}`;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`OpenAI title-generation call failed: ${errBody.error?.message || res.statusText}`);
  }
  const json = await res.json();
  let parsed;
  try {
    parsed = JSON.parse(json.choices[0].message.content);
  } catch (e) {
    throw new Error(`Title generation returned unparseable JSON: ${json.choices[0].message.content.slice(0, 200)}`);
  }
  const title = (parsed.title || '').trim();
  if (!title) throw new Error(`Title generation returned an empty title for: ${answer.slice(0, 80)}`);
  return title;
}

async function generateTitles(apiKey, facts) {
  // facts: array of { answer } — returns array of short titles, same order.
  const titles = new Array(facts.length).fill(null);
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (nextIndex < facts.length) {
      const i = nextIndex++;
      titles[i] = await generateOneTitle(apiKey, facts[i].answer);
      completed++;
      process.stdout.write(`\r  titled ${completed}/${facts.length}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(TITLE_CONCURRENCY, facts.length) }, worker));
  process.stdout.write('\n');
  return titles;
}

async function resolveTrade(supabase, tradeName) {
  const tradeSlug = slugify(tradeName);
  const { data: trade, error } = await supabase.from('kb_trades').select('id, slug, name').eq('slug', tradeSlug).single();
  if (error || !trade) {
    throw new Error(`Trade "${tradeName}" (slug "${tradeSlug}") does not already exist in kb_trades. This script requires an existing launch trade — refusing to silently create a new one (check for a typo in --trade).`);
  }
  return trade;
}

async function resolveSubcategory(supabase, tradeId, name, cache, dryRun) {
  const slug = slugify(name);
  const key = `${tradeId}::${slug}`;
  if (cache.has(key)) return cache.get(key);
  let { data: sub } = await supabase.from('kb_subcategories').select('id').eq('trade_id', tradeId).eq('slug', slug).single();
  if (!sub) {
    if (dryRun) {
      sub = { id: `DRY-RUN-NEW-SUBCATEGORY:${slug}` };
    } else {
      const { data: created, error } = await supabase.from('kb_subcategories').insert({ trade_id: tradeId, slug, name }).select('id').single();
      if (error) throw error;
      sub = created;
    }
  }
  cache.set(key, sub.id);
  return sub.id;
}

async function resolveCategory(supabase, subcategoryId, name, order, cache, dryRun) {
  const slug = slugify(name);
  const key = `${subcategoryId}::${slug}`;
  if (cache.has(key)) return cache.get(key);
  let { data: cat } = await supabase.from('kb_categories').select('id').eq('subcategory_id', subcategoryId).eq('slug', slug).single();
  if (!cat) {
    if (dryRun) {
      cat = { id: `DRY-RUN-NEW-CATEGORY:${slug}` };
    } else {
      const { data: created, error } = await supabase.from('kb_categories').insert({ subcategory_id: subcategoryId, slug, name, display_order: order }).select('id').single();
      if (error) throw error;
      cat = created;
    }
  }
  cache.set(key, cat.id);
  return cat.id;
}

async function main() {
  const { csvPath, trade: tradeName, dryRun, limit } = parseArgs(process.argv);
  let rawRows = parse(readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true });
  if (limit) rawRows = rawRows.slice(0, limit);
  console.log(`Read ${rawRows.length} raw rows from ${csvPath}${dryRun ? ' [DRY RUN]' : ''}`);

  const { valid, rejected, warnings } = validateRows(rawRows);
  console.log(`Valid: ${valid.length}, rejected: ${rejected.length}, warnings: ${warnings.length}`);
  if (rejected.length) {
    console.log('Rejected rows:');
    for (const r of rejected.slice(0, 20)) console.log(`  row ${r.row}: ${r.reason}`);
    if (rejected.length > 20) console.log(`  ... and ${rejected.length - 20} more`);
  }
  if (valid.length === 0) { console.log('Nothing valid to import.'); return; }

  const apiKeyRaw = await getSecret('fieldloop/openai-api-key');
  const apiKey = JSON.parse(apiKeyRaw).apiKey;
  if (!apiKey) throw new Error('fieldloop/openai-api-key secret is missing its apiKey.');

  const supabase = await getSupabaseClient();
  const trade = await resolveTrade(supabase, tradeName);
  console.log(`Trade: ${trade.name} (${trade.id})`);

  // Group by (Category, SubCategory) = (DB subcategory, DB category).
  const groups = new Map();
  for (const [idx, r] of valid.entries()) {
    const key = `${r.category}||${r.subcategory}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(idx);
  }
  console.log(`Groups: ${groups.size} (Category,SubCategory) pairs`);

  console.log('\nEmbedding all raw-row answers (used for the final search index + the clustering safety check)...');
  const rawEmbeddings = await embedInBatches(apiKey, valid.map((r) => r.answer));

  console.log('\nClustering within each group (exact suffix match on the answer text)...');
  const clusterSizeHistogram = {};
  const canonicalFacts = []; // { canonicalIdx, clusterIndices, category, subcategory }
  const lowConfidenceClusters = [];
  for (const [key, indices] of groups.entries()) {
    const clusters = clusterGroup(indices, valid);
    for (const cluster of clusters) {
      const size = cluster.length;
      clusterSizeHistogram[size] = (clusterSizeHistogram[size] || 0) + 1;
      const canonicalIdx = pickCanonical(cluster, rawEmbeddings);
      const [category, subcategory] = key.split('||');
      canonicalFacts.push({ canonicalIdx, clusterIndices: cluster, category, subcategory });

      if (cluster.length > 1) {
        const avgSim = averagePairwiseSimilarity(cluster, rawEmbeddings);
        if (avgSim < SAFETY_SIMILARITY_FLOOR) {
          lowConfidenceClusters.push({ key, cluster, avgSim });
        }
      }
    }
  }
  console.log(`Formed ${canonicalFacts.length} canonical facts from ${valid.length} raw rows.`);
  console.log(`Cluster size histogram: ${JSON.stringify(clusterSizeHistogram)}`);

  // Sanity-check outliers worth a human glance.
  const bigClusters = canonicalFacts.filter((f) => f.clusterIndices.length > 15);
  const singletons = canonicalFacts.filter((f) => f.clusterIndices.length === 1);
  console.log(`Clusters >15 rows (worth eyeballing): ${bigClusters.length}`);
  console.log(`Singleton clusters (no detected duplicate phrasing): ${singletons.length}`);

  if (lowConfidenceClusters.length) {
    console.log(`\n*** WARNING: ${lowConfidenceClusters.length} suffix-matched cluster(s) have surprisingly low embedding similarity (<${SAFETY_SIMILARITY_FLOOR}) — the suffix-match assumption may have broken down here. Review before trusting: ***`);
    for (const lc of lowConfidenceClusters.slice(0, 10)) {
      console.log(`  "${lc.key}" — ${lc.cluster.length} rows, avg similarity ${lc.avgSim.toFixed(3)}:`);
      for (const i of lc.cluster) console.log(`      - ${valid[i].answer.slice(0, 100)}`);
    }
  } else {
    console.log('No low-confidence clusters flagged by the embedding safety check.');
  }

  if (dryRun) {
    const suspiciouslyLarge = canonicalFacts.filter((f) => f.clusterIndices.length > 6);
    if (suspiciouslyLarge.length) {
      console.log(`\n--- Eyeball check: ${suspiciouslyLarge.length} cluster(s) >6 rows (possible over-merge) ---`);
      for (const f of suspiciouslyLarge.slice(0, 5)) {
        console.log(`Cluster of ${f.clusterIndices.length} in "${f.category}" / "${f.subcategory}":`);
        for (const i of f.clusterIndices) {
          console.log(`    - ${valid[i].answer.slice(0, 90)}`);
        }
      }
    }
  }

  // Build recognition text per canonical fact — uses each variant row's
  // clean `Question` field directly (already a full, natural phrasing of
  // the same underlying question, one per row, no delimiter-parsing
  // needed) rather than parsing Question_Variations' embedded quoted
  // phrases: that field pairs phrases by literal apostrophe characters,
  // which desyncs the moment any variant's text contains a contraction
  // ("what's", "doesn't") — confirmed by inspection, real fragments of
  // template label text (e.g. "on a whole-house retrofit; Client-speak:")
  // leaked into what were meant to be clean short tags. Question is
  // reliably clean since it's one full sentence per row with no internal
  // delimiter parsing required.
  //
  // topic_tags is deliberately left empty for this import — there's no
  // clean short-keyword source in this CSV shape (unlike the original
  // 500-fact import's dedicated topic_tags column), and the paraphrase-
  // recognition goal is better served by the vector embedding below
  // (semantic match) than by noisy keyword tags for full-text search.
  const facts = canonicalFacts.map((f) => {
    const clusterRows = f.clusterIndices.map((i) => valid[i]);
    const canonical = valid[f.canonicalIdx];
    const questionSet = new Set(clusterRows.map((r) => r.question));
    const recognitionSnippet = [...questionSet].slice(0, 8).join(' | ');
    return {
      answer: canonical.answer,
      codeRef: canonical.codeRef,
      category: f.category,
      subcategory: f.subcategory,
      topicTags: [],
      recognitionSnippet,
      variantCount: f.clusterIndices.length,
    };
  });

  console.log('\nGenerating fact titles (gpt-4o-mini, batched)...');
  const titles = await generateTitles(apiKey, facts);

  // The DB's exact-dupe guard is unique on (trade_id, category_id,
  // lower(fact_title)) — DB category = CSV SubCategory, so two canonical
  // facts under the same (CSV Category, CSV SubCategory) pair can't share a
  // title. GPT-generated titles occasionally collide (confirmed live: a
  // real Insulation run hit this on its very first insert chunk). Fix
  // deterministically rather than re-calling the LLM: append a counter
  // suffix to any repeat within its group.
  let titleCollisions = 0;
  {
    const seenPerGroup = new Map();
    for (let i = 0; i < titles.length; i++) {
      const groupKey = `${facts[i].category}||${facts[i].subcategory}`;
      if (!seenPerGroup.has(groupKey)) seenPerGroup.set(groupKey, new Map());
      const seen = seenPerGroup.get(groupKey);
      const lower = titles[i].toLowerCase();
      const count = (seen.get(lower) || 0) + 1;
      seen.set(lower, count);
      if (count > 1) {
        titles[i] = `${titles[i]} (${count})`;
        titleCollisions++;
      }
    }
  }
  console.log(`Title collisions within a category, resolved with a counter suffix: ${titleCollisions}`);

  console.log('\nEmbedding final canonical entries (title + fact + recognition phrasing)...');
  const finalTexts = facts.map((f, i) => `${titles[i]}. ${f.answer} ${f.recognitionSnippet}`);
  const finalEmbeddings = await embedInBatches(apiKey, finalTexts);

  let verifyTrueCount = 0, verifyFalseCount = 0;
  const subCache = new Map();
  const catCache = new Map();
  const insertRows = [];
  const categoryOrderCounters = new Map();

  for (let i = 0; i < facts.length; i++) {
    const f = facts[i];
    const verifyLocally = classifyVerifyLocally(f.codeRef);
    if (verifyLocally) verifyTrueCount++; else verifyFalseCount++;

    const subcategoryId = await resolveSubcategory(supabase, trade.id, f.category, subCache, dryRun);
    const orderKey = subcategoryId;
    const order = (categoryOrderCounters.get(orderKey) || 0) + 1;
    categoryOrderCounters.set(orderKey, order);
    const categoryId = await resolveCategory(supabase, subcategoryId, f.subcategory, order, catCache, dryRun);

    insertRows.push({
      category_id: categoryId,
      trade_id: trade.id,
      subcategory_id: subcategoryId,
      fact_title: titles[i],
      fact: f.answer,
      topic_tags: f.topicTags,
      source_type: f.codeRef,
      verify_locally: verifyLocally,
      embedding: finalEmbeddings[i],
      embedding_model_version: EMBEDDING_MODEL,
      status: 'pending',
      import_batch: `${slugify(tradeName)}_qavariants_${new Date().toISOString().slice(0, 10)}`,
    });
  }

  console.log(`\nverify_locally: True=${verifyTrueCount}, False=${verifyFalseCount}`);
  console.log(`New subcategories that would be/were created: ${[...subCache.values()].filter((v) => String(v).startsWith('DRY-RUN')).length || '(see dry-run flag above)'}`);

  if (dryRun) {
    console.log('\n=== DRY RUN — no rows inserted, no new subcategory/category rows created ===');
    console.log('Sample of 5 canonical facts that would be inserted:');
    for (const row of insertRows.slice(0, 5)) {
      console.log(`  [${row.verify_locally ? 'VERIFY' : 'ok'}] "${row.fact_title}" — ${row.fact.slice(0, 100)}... (source: ${row.source_type}, tags: ${row.topic_tags.slice(0, 3).join(', ')})`);
    }
    return;
  }

  // Hard pre-insert guard: fail closed, before writing anything, if any
  // (category_id, lower(fact_title)) pair still collides — mirrors the DB's
  // own unique index exactly. A mid-run failure (partway through chunked
  // inserts) is worse than not starting at all: some rows would land,
  // some wouldn't, and cleanup means figuring out exactly where it broke.
  {
    const seenPairs = new Set();
    for (const row of insertRows) {
      const key = `${row.category_id}::${row.fact_title.toLowerCase()}`;
      if (seenPairs.has(key)) {
        throw new Error(`Pre-insert check failed: duplicate (category_id, fact_title) would violate the DB's unique index — "${row.fact_title}". This should have been caught by the collision-resolution pass above; refusing to insert anything.`);
      }
      seenPairs.add(key);
    }
  }

  console.log(`\nInserting ${insertRows.length} canonical entries as 'pending'...`);
  // Insert in chunks to avoid one giant request.
  const INSERT_CHUNK = 200;
  let insertedTotal = 0;
  for (let i = 0; i < insertRows.length; i += INSERT_CHUNK) {
    const chunk = insertRows.slice(i, i + INSERT_CHUNK);
    const { data, error } = await supabase.from('kb_entries').insert(chunk).select('id');
    if (error) throw error;
    insertedTotal += data.length;
    process.stdout.write(`\r  inserted ${insertedTotal}/${insertRows.length}`);
  }
  process.stdout.write('\n');
  console.log(`\nDone. import_batch = '${insertRows[0]?.import_batch}'`);
}

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
