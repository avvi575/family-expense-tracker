-- Backfill reviewedAt and reviewedById for existing categorized rows that were
-- marked reviewed by the previous migration but missing audit timestamps.
-- For statement rows: use the import's createdAt/uploadedById.
-- For bank statement rows: use the import's createdAt/uploadedById.
-- Only affects rows where reviewed=true but reviewedAt is null.

UPDATE "import"."statement_rows" sr
SET "reviewedAt" = si."createdAt",
    "reviewedById" = si."uploadedById"
FROM "import"."statement_imports" si
WHERE sr."importId" = si."id"
  AND sr."reviewed" = TRUE
  AND sr."reviewedAt" IS NULL
  AND (sr."categoryId" IS NOT NULL OR sr."suggestedCategoryId" IS NOT NULL);

UPDATE "import"."bank_statement_rows" br
SET "reviewedAt" = bi."createdAt",
    "reviewedById" = bi."uploadedById"
FROM "import"."bank_statement_imports" bi
WHERE br."importId" = bi."id"
  AND br."reviewed" = TRUE
  AND br."reviewedAt" IS NULL
  AND (br."categoryId" IS NOT NULL OR br."suggestedCategoryId" IS NOT NULL);