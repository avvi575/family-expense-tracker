-- Create logical schemas for import staging and finalized expenses.
CREATE SCHEMA IF NOT EXISTS "import";
CREATE SCHEMA IF NOT EXISTS "stage";

-- Add persistent review audit columns before moving the tables.
ALTER TABLE "public"."statement_rows"
ADD COLUMN IF NOT EXISTS "reviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;

ALTER TABLE "public"."bank_statement_rows"
ADD COLUMN IF NOT EXISTS "reviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;

ALTER TABLE "public"."expenses"
ADD COLUMN IF NOT EXISTS "reviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;

-- Existing categorized rows were already effectively reviewed; keep uncategorized
-- rows available for manual review.
UPDATE "public"."statement_rows"
SET "reviewed" = TRUE
WHERE "categoryId" IS NOT NULL OR "suggestedCategoryId" IS NOT NULL;

UPDATE "public"."bank_statement_rows"
SET "reviewed" = TRUE
WHERE "categoryId" IS NOT NULL OR "suggestedCategoryId" IS NOT NULL;

UPDATE "public"."expenses"
SET "reviewed" = TRUE,
    "reviewedAt" = "createdAt",
    "reviewedById" = "createdById";

-- Add review audit foreign keys and indexes.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'statement_rows_reviewedById_fkey'
          AND conrelid = 'public.statement_rows'::regclass
    ) THEN
        ALTER TABLE "public"."statement_rows"
        ADD CONSTRAINT "statement_rows_reviewedById_fkey"
        FOREIGN KEY ("reviewedById") REFERENCES "public"."users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'bank_statement_rows_reviewedById_fkey'
          AND conrelid = 'public.bank_statement_rows'::regclass
    ) THEN
        ALTER TABLE "public"."bank_statement_rows"
        ADD CONSTRAINT "bank_statement_rows_reviewedById_fkey"
        FOREIGN KEY ("reviewedById") REFERENCES "public"."users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'expenses_reviewedById_fkey'
          AND conrelid = 'public.expenses'::regclass
    ) THEN
        ALTER TABLE "public"."expenses"
        ADD CONSTRAINT "expenses_reviewedById_fkey"
        FOREIGN KEY ("reviewedById") REFERENCES "public"."users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;

-- Move import-stage tables into the import schema. PostgreSQL preserves their
-- existing constraints and rewrites cross-schema foreign-key targets.
ALTER TABLE "public"."statement_imports" SET SCHEMA "import";
ALTER TABLE "public"."statement_rows" SET SCHEMA "import";
ALTER TABLE "public"."bank_statement_imports" SET SCHEMA "import";
ALTER TABLE "public"."bank_statement_rows" SET SCHEMA "import";
ALTER TABLE "public"."bank_statement_splits" SET SCHEMA "import";
ALTER TABLE "public"."recurring_patterns" SET SCHEMA "import";

-- Move finalized expense records into the stage schema.
ALTER TABLE "public"."expenses" SET SCHEMA "stage";

CREATE INDEX IF NOT EXISTS "expenses_importedRowId_key"
ON "stage"."expenses"("importedRowId");

CREATE INDEX IF NOT EXISTS "statement_rows_importId_reviewed_idx"
ON "import"."statement_rows"("importId", "reviewed");

CREATE INDEX IF NOT EXISTS "bank_statement_rows_importId_reviewed_idx"
ON "import"."bank_statement_rows"("importId", "reviewed");

-- Grant the application role access to both logical schemas and their tables.
GRANT USAGE ON SCHEMA "import", "stage" TO "fet";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "import" TO "fet";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "stage" TO "fet";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "import", "stage" TO "fet";

ALTER DEFAULT PRIVILEGES IN SCHEMA "import"
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "fet";
ALTER DEFAULT PRIVILEGES IN SCHEMA "stage"
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "fet";
ALTER DEFAULT PRIVILEGES IN SCHEMA "import"
GRANT USAGE, SELECT ON SEQUENCES TO "fet";
ALTER DEFAULT PRIVILEGES IN SCHEMA "stage"
GRANT USAGE, SELECT ON SEQUENCES TO "fet";
