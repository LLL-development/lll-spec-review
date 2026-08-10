-- ============================================================
-- lll-spec-review — migration 0003
-- Adds doc_group_id: a stable id shared by every version of the
-- same file (same project_id + filename). Lets comments be looked
-- up across a file's whole version history instead of just the
-- exact document row they happen to be attached to.
-- ============================================================

ALTER TABLE documents ADD COLUMN doc_group_id TEXT;

-- Backfill existing rows: every version of the same (project_id,
-- filename) pair gets the earliest version's id as its group id.
UPDATE documents
   SET doc_group_id = (
     SELECT d2.id FROM documents d2
      WHERE d2.project_id = documents.project_id
        AND d2.filename   = documents.filename
      ORDER BY d2.version ASC
      LIMIT 1
   )
 WHERE doc_group_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_group ON documents(doc_group_id);