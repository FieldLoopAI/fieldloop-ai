-- 014_kb_entries_partition_by_trade.sql
-- Converts kb_entries from a single table with a trusted trade_id filter
-- into a real Postgres-native list-partitioned table, one physical
-- partition per trade. Requested explicitly by the client (2026-08-10):
-- cross-trade term collisions (e.g. "depth" means something different in
-- concrete vs. electrical vs. roofing) should be prevented structurally,
-- not just by every query correctly remembering a WHERE clause. Flagged
-- as an open decision in
-- Fieldloop Docs\FieldLoop_KB_Technical_Design.md §6 item 4 and deferred
-- until real multi-trade content existed — the client is now committing
-- to building all 4 launch trades, so this is the right moment.
--
-- APPROACH, REVISED after repeated failures on a different approach: the
-- first version of this migration tried to ATTACH PARTITION the existing
-- populated table directly (a metadata-only rename, no data copy). That
-- hit a genuinely confusing, reproducible error four times in a row
-- ("child table is missing constraint kb_entries_status_check[1]") that
-- survived multiple different fixes to the child's own constraints —
-- meaning the real mechanics of ATTACH's constraint-matching requirement
-- here were not correctly understood, and this repo's own hard-earned
-- discipline is not to keep guessing blind against live data. This
-- version sidesteps the whole question: build the new partitioned
-- structure fully empty first (every partition created fresh via
-- `PARTITION OF`, which reliably auto-inherits all parent constraints —
-- no ambiguity, well documented), then copy the 500 rows in with a plain
-- INSERT ... SELECT — ordinary row validation, not the special attach
-- path that kept failing. Trivial data volume (500 rows) makes the copy
-- instantaneous either way.
--
-- application code (search-kb-entries, list-kb-trades, the import/approve
-- scripts) needs ZERO changes — they only ever reference "kb_entries" by
-- name, and Postgres transparently routes queries to the correct
-- partition based on the trade_id filter already present in every query.
--
-- SAFETY: the original table is kept, renamed to kb_entries_old, as a
-- backup — NOT dropped by this script. Drop it manually only after
-- confirming (see verification queries at the end, and a follow-up
-- functional test) that the new kb_entries is fully correct.
--
-- Run in the Supabase SQL Editor after confirming 011-013 already ran.

-- Step 1: ensure all 4 known launch trades exist (idempotent) — needed so
-- each gets a real, stable partition instead of falling into the DEFAULT
-- catch-all. 'concrete_and_pavers' already exists from the original
-- import and is deliberately not re-inserted here.
INSERT INTO kb_trades (slug, name) VALUES
  ('general_contractor', 'General Contractor'),
  ('roofing', 'Roofing'),
  ('insulation', 'Insulation')
ON CONFLICT (slug) DO NOTHING;

-- Step 2: rename the existing table out of the way — kept as a backup.
-- All 500 rows and their constraints/indexes/trigger move with it
-- automatically (a rename, not a copy).
ALTER TABLE kb_entries RENAME TO kb_entries_old;

-- Unlike constraint and trigger names (scoped per-table — safe to reuse
-- across different tables with no collision), INDEX names in Postgres are
-- unique per SCHEMA, not per table. kb_entries_old still carries its
-- original index names unchanged by the rename above, which would
-- collide with the identically-named indexes Step 7 creates on the new
-- kb_entries below. Drop them here — this backup table doesn't need them
-- for anything (it's a temporary rollback safety net, not queried by any
-- application code going forward).
DROP INDEX IF EXISTS kb_entries_embedding_hnsw_idx;
DROP INDEX IF EXISTS kb_entries_search_text_gin_idx;
DROP INDEX IF EXISTS kb_entries_trade_status_idx;
DROP INDEX IF EXISTS kb_entries_subcategory_idx;
DROP INDEX IF EXISTS kb_entries_no_exact_dupe_idx;

-- Step 3: create the new partitioned parent — same columns as before,
-- with a composite primary key (id, trade_id), declared inline now that
-- we're not attaching any pre-existing populated table (the earlier
-- pitfall was specific to ATTACH PARTITION on an existing table; a plain
-- CREATE TABLE ... PARTITION OF further below auto-inherits this cleanly,
-- no special handling needed). previous_version_id keeps the column but
-- drops the foreign key (a self-reference across partitions needs a
-- composite FK for real benefit this field doesn't currently have any
-- code populating it yet anyway — versioning-on-edit for this schema
-- isn't built, see the design doc's still-open review-workflow decision).
CREATE TABLE kb_entries (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  category_id        uuid NOT NULL REFERENCES kb_categories (id),
  trade_id           uuid NOT NULL REFERENCES kb_trades (id),
  subcategory_id     uuid NOT NULL REFERENCES kb_subcategories (id),

  display_number     int,
  fact_title         text NOT NULL,
  fact               text NOT NULL,
  topic_tags         text[] NOT NULL DEFAULT '{}',
  source_type        text NOT NULL,
  verify_locally     boolean NOT NULL DEFAULT false,

  embedding                vector(1536),
  embedding_model_version  text,

  status             text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
  version            int NOT NULL DEFAULT 1,
  previous_version_id uuid,

  import_batch       text,
  created_by         uuid,
  reviewed_by        uuid,
  reviewed_at        timestamptz,

  search_text        tsvector,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (id, trade_id)
) PARTITION BY LIST (trade_id);

-- Step 4: create all 4 real partitions plus a DEFAULT catch-all, all
-- fresh/empty via PARTITION OF — this reliably auto-inherits every parent
-- constraint (CHECK, PK, NOT NULL) with no pre-existing-match requirement,
-- unlike ATTACH PARTITION on an existing table. Partition bounds must be
-- literal values, not subqueries — this DO block resolves each trade's
-- real uuid and builds the DDL dynamically.
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM kb_trades WHERE slug = 'concrete_and_pavers';
  EXECUTE format('CREATE TABLE kb_entries_concrete_and_pavers PARTITION OF kb_entries FOR VALUES IN (%L)', v_id);

  SELECT id INTO v_id FROM kb_trades WHERE slug = 'general_contractor';
  EXECUTE format('CREATE TABLE kb_entries_general_contractor PARTITION OF kb_entries FOR VALUES IN (%L)', v_id);

  SELECT id INTO v_id FROM kb_trades WHERE slug = 'roofing';
  EXECUTE format('CREATE TABLE kb_entries_roofing PARTITION OF kb_entries FOR VALUES IN (%L)', v_id);

  SELECT id INTO v_id FROM kb_trades WHERE slug = 'insulation';
  EXECUTE format('CREATE TABLE kb_entries_insulation PARTITION OF kb_entries FOR VALUES IN (%L)', v_id);
END $$;

CREATE TABLE kb_entries_default PARTITION OF kb_entries DEFAULT;

-- Step 5: the search_text-maintaining trigger, created BEFORE the data
-- copy below so every copied row gets it populated on insert. Row-level
-- BEFORE triggers on a partitioned table apply automatically to every
-- partition (fully supported since Postgres 11).
CREATE TRIGGER kb_entries_search_text_trigger
  BEFORE INSERT OR UPDATE ON kb_entries
  FOR EACH ROW EXECUTE FUNCTION kb_entries_update_search_text();

-- Step 6: copy the 500 rows across. search_text is deliberately excluded
-- from the column list — the trigger above recomputes it fresh for every
-- row rather than trusting the old table's already-populated value.
INSERT INTO kb_entries (
  id, category_id, trade_id, subcategory_id, display_number, fact_title,
  fact, topic_tags, source_type, verify_locally, embedding,
  embedding_model_version, status, version, previous_version_id,
  import_batch, created_by, reviewed_by, reviewed_at, created_at, updated_at
)
SELECT
  id, category_id, trade_id, subcategory_id, display_number, fact_title,
  fact, topic_tags, source_type, verify_locally, embedding,
  embedding_model_version, status, version, previous_version_id,
  import_batch, created_by, reviewed_by, reviewed_at, created_at, updated_at
FROM kb_entries_old;

-- Step 7: indexes on the partitioned parent — Postgres automatically
-- creates a matching index on every partition. Exact-duplicate guard now
-- includes trade_id (structurally required for a unique index on a
-- partitioned table) — no practical change, a category only ever belongs
-- to one trade anyway.
CREATE INDEX kb_entries_embedding_hnsw_idx ON kb_entries USING hnsw (embedding vector_cosine_ops);
CREATE INDEX kb_entries_search_text_gin_idx ON kb_entries USING gin (search_text);
CREATE INDEX kb_entries_trade_status_idx ON kb_entries (trade_id, status);
CREATE INDEX kb_entries_subcategory_idx ON kb_entries (subcategory_id, status);
CREATE UNIQUE INDEX kb_entries_no_exact_dupe_idx ON kb_entries (trade_id, category_id, lower(fact_title)) WHERE status != 'rejected';

-- Step 8: RLS. Declarative partitioning does NOT automatically inherit
-- row-security policies to partitions (confirmed against current Postgres
-- docs, not assumed) — defined explicitly on the parent AND on every
-- partition, so correctness never depends on which one a future query
-- happens to touch. (Every Lambda in this project uses the service-role
-- key, which bypasses RLS entirely regardless — this is about
-- correctness/defense-in-depth, not closing a currently-live gap.)
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['kb_entries', 'kb_entries_concrete_and_pavers',
                              'kb_entries_general_contractor', 'kb_entries_roofing',
                              'kb_entries_insulation', 'kb_entries_default']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "kb read for authenticated" ON %I', tbl);
    EXECUTE format('CREATE POLICY "kb read for authenticated" ON %I FOR SELECT TO authenticated USING (status = ''approved'')', tbl);
  END LOOP;
END $$;

-- Step 9: verify. new_total and old_total must be equal (500). The
-- per-trade breakdown should show all 500 under concrete_and_pavers and 0
-- for the other three (no content imported for them yet).
SELECT (SELECT count(*) FROM kb_entries) AS new_total, (SELECT count(*) FROM kb_entries_old) AS old_total;
SELECT t.slug, count(e.id) AS row_count
FROM kb_trades t LEFT JOIN kb_entries e ON e.trade_id = t.id
GROUP BY t.slug ORDER BY t.slug;

NOTIFY pgrst, 'reload schema';

-- NOT run automatically — only after the verification above and a
-- follow-up functional test both confirm everything is correct:
--   DROP TABLE kb_entries_old;
