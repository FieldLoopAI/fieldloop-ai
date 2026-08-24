// backend/scripts/generate-review-sample.mjs
//
// Builds the structured spot-check sample Bob asked for (Prem Knowledge
// Base Questions 08_21_20.md, answer 5): 2-3 rows per SubCategory (his
// term — the CSV's SubCategory column, which is the DB's `category` level,
// ~100 per trade x 4 trades = ~400 groups total), covering every group
// rather than random-sampling or hammering one trade. Output is a CSV Bob
// can work through directly and hand back with notes.
//
// Usage: node generate-review-sample.mjs [--per-group=3] [--out=path.csv]

import supabaseClientModule from './shared/supabaseClient.js';
const { getSupabaseClient } = supabaseClientModule;
import { writeFileSync } from 'fs';

function parseArgs(argv) {
  const flags = { perGroup: 3, out: 'kb_review_sample.csv' };
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([a-z]+)=(.*)$/i);
    if (!m) continue;
    if (m[1] === 'per-group') flags.perGroup = parseInt(m[2], 10);
    if (m[1] === 'out') flags.out = m[2];
  }
  return flags;
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const { perGroup, out } = parseArgs(process.argv);
  const supabase = await getSupabaseClient();

  // Supabase/PostgREST defaults to a 1000-row cap per request — confirmed
  // the hard way (a first pass silently returned only 1000 of ~2342 rows,
  // missing two trades entirely). Paginate with .range() until a page
  // comes back short.
  const PAGE_SIZE = 1000;
  const entries = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await supabase
      .from('kb_entries')
      .select(`
        id, fact_title, fact, source_type, verify_locally, import_batch, category_id,
        kb_categories!inner ( name, subcategory_id, kb_subcategories!inner ( name, trade_id, kb_trades!inner ( name, slug ) ) )
      `)
      .eq('status', 'pending')
      .like('import_batch', '%_qavariants_%')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    entries.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  console.log(`Fetched ${entries.length} pending qavariants-batch rows.`);

  // Group by (trade, DB-category = CSV SubCategory) — this IS the ~400-group
  // unit Bob asked to sample across.
  const groups = new Map();
  for (const e of entries) {
    const trade = e.kb_categories.kb_subcategories.kb_trades.name;
    const dbSubcategory = e.kb_categories.kb_subcategories.name; // CSV Category
    const dbCategory = e.kb_categories.name; // CSV SubCategory
    const key = `${trade}||${dbSubcategory}||${dbCategory}`;
    if (!groups.has(key)) groups.set(key, { trade, dbSubcategory, dbCategory, rows: [] });
    groups.get(key).rows.push(e);
  }
  console.log(`Groups (trade x CSV SubCategory): ${groups.size}`);

  const sampleRows = [];
  for (const g of groups.values()) {
    // deterministic sample: first `perGroup` in whatever order they came
    // back (fine for a review spot-check, no need for randomness here).
    const picked = g.rows.slice(0, perGroup);
    for (const r of picked) {
      sampleRows.push({
        Trade: g.trade,
        Category: g.dbSubcategory, // CSV Category (broad)
        SubCategory: g.dbCategory, // CSV SubCategory (specific) -- matches Bob's own terminology
        Fact_Title: r.fact_title,
        Fact: r.fact,
        Source_Reference: r.source_type,
        Verify_Locally: r.verify_locally ? 'TRUE' : 'FALSE',
        Import_Batch: r.import_batch,
        Bobs_Notes: '',
      });
    }
  }
  console.log(`Sample rows selected: ${sampleRows.length} (target was ~${groups.size * perGroup})`);

  const headers = ['Trade', 'Category', 'SubCategory', 'Fact_Title', 'Fact', 'Source_Reference', 'Verify_Locally', 'Import_Batch', 'Bobs_Notes'];
  const lines = [headers.join(',')];
  for (const row of sampleRows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  writeFileSync(out, lines.join('\n'), 'utf8');
  console.log(`Wrote ${out}`);

  // Breakdown by trade for a quick sanity check.
  const byTrade = {};
  for (const row of sampleRows) byTrade[row.Trade] = (byTrade[row.Trade] || 0) + 1;
  console.log('Sample rows per trade:', byTrade);
}

main().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });
