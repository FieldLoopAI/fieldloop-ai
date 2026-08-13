// backend/scripts/import-kb-entries.mjs
//
// Manually-run bulk importer for the knowledge base (see
// Fieldloop Docs\FieldLoop_KB_Technical_Design.md §3.3) — not a Lambda,
// since embedding hundreds of rows doesn't fit inside a single HTTP
// request/Lambda invocation. Reuses this repo's existing service-role
// Secrets Manager access pattern (backend/functions/shared/secrets.js,
// supabaseClient.js) rather than duplicating it.
//
// Usage:
//   node backend/scripts/import-kb-entries.mjs <path/to/file.csv> \
//     --trade="Concrete & Pavers" --subcategory="Driveway Concrete"
//
// The real client-delivered CSV shape (confirmed against
// FieldLoop_Concrete_Driveway_KB.csv) has no trade/subcategory columns —
// those are constant for an entire file and passed on the command line
// instead of asking the client to add two repeated columns to every row.
//
// Requires local AWS credentials configured (same as running
// package-lambda.ps1) and `npm install` run once in this folder.

import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
// Own copies of the shared helpers, per this repo's no-Lambda-Layer,
// copy-per-consumer convention (backend/functions/shared/ is the master).
// Named-export interop with these CommonJS modules isn't reliably detected
// by Node's ESM loader for this export shape — import the module object
// and destructure instead of `import { getSecret } from ...`.
import secretsModule from './shared/secrets.js';
import supabaseClientModule from './shared/supabaseClient.js';
const { getSecret } = secretsModule;
const { getSupabaseClient } = supabaseClientModule;

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBED_BATCH_SIZE = 100;
const NEAR_DUPLICATE_THRESHOLD = 0.95;

function slugify(name) {
  return name.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseArgs(argv) {
  const csvPath = argv[2];
  const flags = {};
  for (const arg of argv.slice(3)) {
    const m = arg.match(/^--([a-z]+)=(.*)$/i);
    if (m) flags[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  if (!csvPath || !flags.trade || !flags.subcategory) {
    console.error('Usage: node import-kb-entries.mjs <csv> --trade="..." --subcategory="..."');
    process.exit(1);
  }
  return { csvPath, trade: flags.trade, subcategory: flags.subcategory };
}

function validateRows(rows) {
  const valid = [];
  const rejected = [];
  const warnings = [];
  const seenTitlesByCategory = new Map();

  for (const [i, row] of rows.entries()) {
    const rowNum = i + 2; // account for header row, 1-indexed
    const factTitle = (row.fact_title || '').trim();
    const fact = (row.fact || '').trim();
    const category = (row.category || '').trim();
    const verifyLocallyRaw = (row.verify_locally || '').trim();

    if (!factTitle || !fact) {
      rejected.push({ row: rowNum, reason: 'empty fact_title or fact', data: row });
      continue;
    }
    if (!category) {
      rejected.push({ row: rowNum, reason: 'empty category', data: row });
      continue;
    }
    if (!/^(true|false)$/i.test(verifyLocallyRaw)) {
      rejected.push({ row: rowNum, reason: `verify_locally must be TRUE/FALSE, got "${verifyLocallyRaw}"`, data: row });
      continue;
    }

    const dupeKey = `${category}::${factTitle.toLowerCase()}`;
    if (seenTitlesByCategory.has(dupeKey)) {
      rejected.push({ row: rowNum, reason: `exact-duplicate fact_title within category (also row ${seenTitlesByCategory.get(dupeKey)})`, data: row });
      continue;
    }
    seenTitlesByCategory.set(dupeKey, rowNum);

    if (/�|â€/.test(factTitle) || /�|â€/.test(fact)) {
      warnings.push({ row: rowNum, warning: 'possible mangled encoding (replacement character or "â€" artifact) — re-check source file encoding' });
    }

    valid.push({
      rowNum,
      displayNumber: row.id ? parseInt(row.id, 10) : null,
      category,
      factTitle,
      fact,
      topicTags: (row.topic_tags || '').split(';').map((t) => t.trim()).filter(Boolean),
      sourceType: (row.source_type || '').trim() || 'general practice',
      verifyLocally: /^true$/i.test(verifyLocallyRaw),
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
    console.log(`  embedded ${Math.min(i + EMBED_BATCH_SIZE, texts.length)}/${texts.length}`);
  }
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

function findNearDuplicates(valid, embeddings) {
  const nearDuplicates = [];
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      if (sim >= NEAR_DUPLICATE_THRESHOLD) {
        nearDuplicates.push({ a: valid[i].factTitle, b: valid[j].factTitle, similarity: sim.toFixed(3) });
      }
    }
  }
  return nearDuplicates;
}

async function resolveHierarchy(supabase, tradeName, subcategoryName, categoryNamesInOrder) {
  const tradeSlug = slugify(tradeName);
  let { data: trade } = await supabase.from('kb_trades').select('id').eq('slug', tradeSlug).single();
  if (!trade) {
    ({ data: trade } = await supabase.from('kb_trades').insert({ slug: tradeSlug, name: tradeName }).select('id').single());
  }

  const subcategorySlug = slugify(subcategoryName);
  let { data: subcategory } = await supabase.from('kb_subcategories').select('id')
    .eq('trade_id', trade.id).eq('slug', subcategorySlug).single();
  if (!subcategory) {
    ({ data: subcategory } = await supabase.from('kb_subcategories')
      .insert({ trade_id: trade.id, slug: subcategorySlug, name: subcategoryName }).select('id').single());
  }

  const categoryIdByName = {};
  for (const [order, name] of categoryNamesInOrder.entries()) {
    const slug = slugify(name);
    let { data: category } = await supabase.from('kb_categories').select('id')
      .eq('subcategory_id', subcategory.id).eq('slug', slug).single();
    if (!category) {
      ({ data: category } = await supabase.from('kb_categories')
        .insert({ subcategory_id: subcategory.id, slug, name, display_order: order + 1 }).select('id').single());
    }
    categoryIdByName[name] = category.id;
  }

  return { tradeId: trade.id, subcategoryId: subcategory.id, categoryIdByName };
}

async function main() {
  const { csvPath, trade, subcategory } = parseArgs(process.argv);
  const rows = parse(readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true });
  console.log(`Read ${rows.length} rows from ${csvPath}`);

  const { valid, rejected, warnings } = validateRows(rows);
  console.log(`Valid: ${valid.length}, rejected: ${rejected.length}, warnings: ${warnings.length}`);
  if (valid.length === 0) {
    console.log('Nothing valid to import.');
    printSummary({ imported: 0, rejected, warnings, nearDuplicates: [] });
    return;
  }

  const apiKeyRaw = await getSecret('fieldloop/openai-api-key');
  const apiKey = JSON.parse(apiKeyRaw).apiKey;
  if (!apiKey) throw new Error('fieldloop/openai-api-key secret is missing its apiKey.');

  console.log('Embedding facts...');
  const embeddings = await embedInBatches(apiKey, valid.map((r) => `${r.factTitle}. ${r.fact}`));

  const nearDuplicates = findNearDuplicates(valid, embeddings);

  const categoryNamesInOrder = [...new Set(valid.map((r) => r.category))];
  const supabase = await getSupabaseClient();
  const { tradeId, subcategoryId, categoryIdByName } = await resolveHierarchy(supabase, trade, subcategory, categoryNamesInOrder);

  const importBatch = `${slugify(subcategory)}_${new Date().toISOString().slice(0, 10)}`;
  const insertRows = valid.map((r, i) => ({
    category_id: categoryIdByName[r.category],
    trade_id: tradeId,
    subcategory_id: subcategoryId,
    display_number: r.displayNumber,
    fact_title: r.factTitle,
    fact: r.fact,
    topic_tags: r.topicTags,
    source_type: r.sourceType,
    verify_locally: r.verifyLocally,
    embedding: embeddings[i],
    embedding_model_version: EMBEDDING_MODEL,
    status: 'pending',
    import_batch: importBatch,
  }));

  const { data: inserted, error } = await supabase.from('kb_entries').insert(insertRows).select('id');
  if (error) throw error;

  console.log(`\nImported ${inserted.length} rows under import_batch = '${importBatch}' (status: pending).`);
  printSummary({ imported: inserted.length, rejected, warnings, nearDuplicates, importBatch });
}

function printSummary({ imported, rejected, warnings, nearDuplicates, importBatch }) {
  console.log('\n=== Import Summary ===');
  console.log(`Imported: ${imported}${importBatch ? ` (import_batch: ${importBatch})` : ''}`);
  if (rejected.length) {
    console.log(`\nRejected (${rejected.length}):`);
    for (const r of rejected) console.log(`  row ${r.row}: ${r.reason}`);
  }
  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  row ${w.row}: ${w.warning}`);
  }
  if (nearDuplicates.length) {
    console.log(`\nNear-duplicates (${nearDuplicates.length}, review manually):`);
    for (const d of nearDuplicates) console.log(`  "${d.a}" ~ "${d.b}" (similarity ${d.similarity})`);
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
