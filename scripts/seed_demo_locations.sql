\set ON_ERROR_STOP on

BEGIN;

SELECT pg_advisory_xact_lock(87342109);

DO $$
DECLARE
    v_province_id BIGINT;
BEGIN
    SELECT id
    INTO v_province_id
    FROM provinces
    WHERE name = 'LocalSpot Demo Province'
    ORDER BY id
    LIMIT 1;

    IF v_province_id IS NULL THEN
        INSERT INTO provinces (name)
        VALUES ('LocalSpot Demo Province')
        RETURNING id INTO v_province_id;
    END IF;

    INSERT INTO districts (province_id, name)
    VALUES
        (v_province_id, 'Demo Central District'),
        (v_province_id, 'Demo Riverside District')
    ON CONFLICT (province_id, name) DO NOTHING;
END;
$$;

COMMIT;

SELECT
    p.id AS province_id,
    p.name AS province_name,
    d.id AS district_id,
    d.name AS district_name
FROM provinces AS p
JOIN districts AS d ON d.province_id = p.id
WHERE p.name = 'LocalSpot Demo Province'
ORDER BY p.id, d.name;