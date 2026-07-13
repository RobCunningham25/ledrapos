-- Ordered documents (e.g. the club constitution) live in venue_knowledge so
-- the WhatsApp assistant's search_knowledge tool and the portal share one
-- knowledge store. sort_order gives document-type categories a stable TOC
-- order; ad-hoc knowledge rows leave it NULL.
ALTER TABLE venue_knowledge ADD COLUMN IF NOT EXISTS sort_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_venue_knowledge_category_order
  ON venue_knowledge (venue_id, category, sort_order);
