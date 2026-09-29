DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM card_variants
    WHERE range IS NOT NULL
      AND range !~ '^[0-9]+$'
  ) THEN
    RAISE EXCEPTION 'card_variants.range contains a non-integer legacy value';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE card_variants
  ALTER COLUMN range TYPE integer
  USING range::integer;
