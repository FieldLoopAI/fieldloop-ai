-- 012_kb_fact_system.sql
-- FieldLoop AI's real contractor/technician knowledge base — replaces the
-- small pilot table from 010_estimate_knowledge_base.sql (retired in 013).
-- Design: Fieldloop Docs\FieldLoop_KB_Technical_Design.md §2 (revision 2,
-- 2026-08-10) — schema/terminology matched directly to the client's real
-- 500-fact sample (FieldLoop_Concrete_Driveway_KB.csv): fact_title/fact
-- (atomic declarative facts, not Q&A pairs), trade -> subcategory ->
-- category hierarchy, topic_tags for hybrid search.
--
-- Run in the Supabase SQL Editor after confirming 011 already ran, and
-- after confirming pgvector is enabled (CREATE EXTENSION IF NOT EXISTS
-- vector; — already confirmed live in this project as of 2026-08-07).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS kb_trades (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kb_subcategories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id    uuid NOT NULL REFERENCES kb_trades (id),
  slug        text NOT NULL,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id, slug)
);

CREATE TABLE IF NOT EXISTS kb_categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcategory_id  uuid NOT NULL REFERENCES kb_subcategories (id),
  slug            text NOT NULL,
  name            text NOT NULL,
  display_order   int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subcategory_id, slug)
);

CREATE TABLE IF NOT EXISTS kb_entries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id        uuid NOT NULL REFERENCES kb_categories (id),

  -- Denormalized for read-path performance — every retrieval query filters
  -- by trade and/or subcategory; avoids a 3-way join on the hot path. Kept
  -- in sync by the import script, never hand-edited.
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
  previous_version_id uuid REFERENCES kb_entries (id),

  import_batch       text,
  created_by         uuid,
  reviewed_by        uuid,
  reviewed_at        timestamptz,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Vector similarity search. HNSW, not IVFFlat — IVFFlat's `lists` parameter
-- needs manual re-tuning as the table grows; HNSW doesn't have that
-- failure mode and is the better fit given this is expected to keep
-- growing well past its initial pilot size.
CREATE INDEX IF NOT EXISTS kb_entries_embedding_hnsw_idx
  ON kb_entries USING hnsw (embedding vector_cosine_ops);

-- Hybrid search, part 2: full-text index alongside the vector one — exact
-- technical terms (bar sizes, ASTM numbers) and voice-to-text transcription
-- errors are things a keyword/fuzzy match catches that pure embedding
-- similarity can blur. See match_kb_entries() below for how both combine.
--
-- Postgres's to_tsvector(regconfig, text) is only marked STABLE in the
-- catalog, not IMMUTABLE — a GENERATED ALWAYS AS ... STORED column
-- requires a genuinely IMMUTABLE expression, so this can't be a generated
-- column at all. Two different "wrap it in an IMMUTABLE function" attempts
-- both still hit "generation expression is not immutable" (SQLSTATE
-- 42P17) — a LANGUAGE sql wrapper gets inlined by the planner back into
-- the real STABLE call, and even a LANGUAGE plpgsql wrapper didn't survive
-- Postgres's dependency check for this specific case. Rather than keep
-- guessing at generated-column tricks, search_text is a plain column
-- maintained by a trigger instead — triggers have no immutability
-- restriction at all, and this is in fact the more traditional way to
-- keep a tsvector column in sync in Postgres, predating generated columns.
DROP FUNCTION IF EXISTS kb_immutable_to_tsvector(text);

ALTER TABLE kb_entries ADD COLUMN IF NOT EXISTS search_text tsvector;

CREATE OR REPLACE FUNCTION kb_entries_update_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := to_tsvector('english',
    coalesce(NEW.fact_title, '') || ' ' || coalesce(NEW.fact, '') || ' ' || array_to_string(NEW.topic_tags, ' '));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kb_entries_search_text_trigger ON kb_entries;
CREATE TRIGGER kb_entries_search_text_trigger
  BEFORE INSERT OR UPDATE ON kb_entries
  FOR EACH ROW EXECUTE FUNCTION kb_entries_update_search_text();

CREATE INDEX IF NOT EXISTS kb_entries_search_text_gin_idx
  ON kb_entries USING gin (search_text);

CREATE INDEX IF NOT EXISTS kb_entries_trade_status_idx
  ON kb_entries (trade_id, status);
CREATE INDEX IF NOT EXISTS kb_entries_subcategory_idx
  ON kb_entries (subcategory_id, status);

-- Cheap first-pass exact-duplicate guard (the real near-duplicate problem
-- needs semantic detection at import time, not a DB constraint).
CREATE UNIQUE INDEX IF NOT EXISTS kb_entries_no_exact_dupe_idx
  ON kb_entries (category_id, lower(fact_title)) WHERE status != 'rejected';

-- Hybrid retrieval function — combines vector similarity and full-text
-- rank into one ordering. Weighting (0.7/0.3) is a starting point per the
-- design doc, expected to need empirical tuning once real queries exist.
CREATE OR REPLACE FUNCTION match_kb_entries(
  query_text text,
  query_embedding vector(1536),
  filter_trade_id uuid,
  filter_subcategory_id uuid DEFAULT NULL,
  match_count int DEFAULT 5
)
RETURNS TABLE (id uuid, fact_title text, fact text, verify_locally boolean,
               category_id uuid, similarity float, rank float)
LANGUAGE sql STABLE AS $$
  SELECT id, fact_title, fact, verify_locally, category_id,
         1 - (embedding <=> query_embedding) AS similarity,
         ts_rank(search_text, websearch_to_tsquery('english', query_text)) AS rank
  FROM kb_entries
  WHERE status = 'approved'
    AND trade_id = filter_trade_id
    AND (filter_subcategory_id IS NULL OR subcategory_id = filter_subcategory_id)
    AND (embedding <=> query_embedding < 0.5
         OR search_text @@ websearch_to_tsquery('english', query_text))
  ORDER BY (1 - (embedding <=> query_embedding)) * 0.7 + ts_rank(search_text, websearch_to_tsquery('english', query_text)) * 0.3 DESC
  LIMIT match_count;
$$;

-- RLS — this content is global reference data, not contractor-scoped and
-- not sensitive. Read is open to any authenticated Supabase session
-- (contractor_users or technicians — this table has no concept of either);
-- writes only ever happen via the service-role key (import/approve
-- scripts), matching this project's established convention.
ALTER TABLE kb_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb read for authenticated" ON kb_entries
  FOR SELECT TO authenticated USING (status = 'approved');
CREATE POLICY "kb trades read" ON kb_trades FOR SELECT TO authenticated USING (true);
CREATE POLICY "kb subcategories read" ON kb_subcategories FOR SELECT TO authenticated USING (true);
CREATE POLICY "kb categories read" ON kb_categories FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
