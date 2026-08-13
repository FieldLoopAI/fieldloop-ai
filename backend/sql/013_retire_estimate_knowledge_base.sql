-- 013_retire_estimate_knowledge_base.sql
-- Retires the pilot-phase estimate_knowledge_base table (010) in favor of
-- the real schema in 012_kb_fact_system.sql — see
-- Fieldloop Docs\FieldLoop_KB_Technical_Design.md §1 for the reasoning
-- (different content shape: Q&A pairs vs. atomic facts; different
-- hierarchy: trade->category vs. trade->subcategory->category; no
-- semantic search on the old table). Confirmed safe to drop: as of this
-- writing the table holds only 3 disposable test rows created while
-- verifying the pilot feature, no real content.
--
-- Run this only after confirming 012 is applied and its replacement is
-- working — this migration is intentionally separate and skippable.

DROP TABLE IF EXISTS estimate_knowledge_base;

NOTIFY pgrst, 'reload schema';
