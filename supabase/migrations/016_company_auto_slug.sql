-- Auto-generate public_slug for companies
-- Slug = lowercase name, spaces→hyphens, non-alphanumeric removed, + 6-char id suffix for uniqueness

CREATE OR REPLACE FUNCTION slugify(v text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(v, '[^a-zA-Z0-9\s]', '', 'g'),
        '\s+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  );
$$;

-- Fill existing nulls
UPDATE companies
SET public_slug = slugify(name) || '-' || substring(id::text, 1, 6)
WHERE public_slug IS NULL OR public_slug = '';

-- Trigger for new companies
CREATE OR REPLACE FUNCTION companies_auto_slug()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.public_slug IS NULL OR NEW.public_slug = '' THEN
    NEW.public_slug := slugify(NEW.name) || '-' || substring(NEW.id::text, 1, 6);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_auto_slug ON companies;
CREATE TRIGGER trg_companies_auto_slug
  BEFORE INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION companies_auto_slug();
