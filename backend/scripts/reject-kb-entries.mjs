// backend/scripts/reject-kb-entries.mjs
//
// Companion to approve-kb-entries.mjs — flips a pending import_batch (e.g. a
// contractor's own submission via POST /kb/submit) to 'rejected' instead of
// 'approved'. Same temporary-stand-in caveat as approve-kb-entries.mjs: no
// real review UI exists yet, this just unblocks a reviewer acting on a
// pending batch from the command line.
//
// Usage: node backend/scripts/reject-kb-entries.mjs <import_batch>

// See import-kb-entries.mjs for why this is a default-import + destructure
// rather than a named import from a CommonJS module.
import supabaseClientModule from './shared/supabaseClient.js';
const { getSupabaseClient } = supabaseClientModule;

async function main() {
  const importBatch = process.argv[2];
  if (!importBatch) {
    console.error('Usage: node reject-kb-entries.mjs <import_batch>');
    process.exit(1);
  }

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('kb_entries')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('import_batch', importBatch)
    .eq('status', 'pending')
    .select('id');
  if (error) throw error;

  console.log(`Rejected ${data.length} rows for import_batch = '${importBatch}'.`);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
