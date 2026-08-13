// backend/scripts/approve-kb-entries.mjs
//
// TEMPORARY stand-in for a real review/approval workflow. The client wants
// a second-AI spot-check before content goes live (confirmed 2026-08-10,
// see Fieldloop Docs\FieldLoop_KB_Technical_Design.md §6 item 1), but which
// model does that check is still an open decision — building a full
// review Lambda/UI around an undecided process would be premature. This
// script exists only to unblock backend testing of the retrieval pipeline
// in the meantime: it flips a whole import batch from 'pending' to
// 'approved' with no actual accuracy review performed. Replace with the
// real workflow once the spot-check model is decided — do not treat this
// as the production approval path.
//
// Usage: node backend/scripts/approve-kb-entries.mjs <import_batch>

// See import-kb-entries.mjs for why this is a default-import + destructure
// rather than a named import from a CommonJS module.
import supabaseClientModule from './shared/supabaseClient.js';
const { getSupabaseClient } = supabaseClientModule;

async function main() {
  const importBatch = process.argv[2];
  if (!importBatch) {
    console.error('Usage: node approve-kb-entries.mjs <import_batch>');
    process.exit(1);
  }

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('kb_entries')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('import_batch', importBatch)
    .eq('status', 'pending')
    .select('id');
  if (error) throw error;

  console.log(`Approved ${data.length} rows for import_batch = '${importBatch}'.`);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
