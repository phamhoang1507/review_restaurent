\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    v_user_id BIGINT;
    v_province_id BIGINT;
    v_district_id BIGINT;
    v_place_id BIGINT;
    v_review_id BIGINT;
BEGIN
    INSERT INTO users (email, password_hash, display_name)
    VALUES (
        'constraint-' || txid_current()::text || '@example.test',
        'not-a-login-credential',
        'Constraint Test'
    )
    RETURNING id INTO v_user_id;

    INSERT INTO provinces (name)
    VALUES ('Constraint Test Province')
    RETURNING id INTO v_province_id;

    INSERT INTO districts (province_id, name)
    VALUES (v_province_id, 'Constraint Test District')
    RETURNING id INTO v_district_id;

    INSERT INTO places (
        district_id, created_by, name, address,
        description, min_price, max_price
    )
    VALUES (
        v_district_id, v_user_id, 'Constraint Test Place',
        'Test Address', 'Temporary test data', 20000, 80000
    )
    RETURNING id INTO v_place_id;

    BEGIN
        UPDATE places
        SET max_price = min_price - 1
        WHERE id = v_place_id;

        RAISE EXCEPTION 'FAIL: invalid price range was accepted';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'PASS: invalid price range rejected';
    END;

    INSERT INTO reviews (
        user_id, place_id, content,
        space_rating, food_drink_rating, value_rating
    )
    VALUES (
        v_user_id, v_place_id, 'Temporary review', 4, 5, 4
    )
    RETURNING id INTO v_review_id;

    BEGIN
        INSERT INTO reviews (
            user_id, place_id, content,
            space_rating, food_drink_rating, value_rating
        )
        VALUES (
            v_user_id, v_place_id, 'Duplicate review', 4, 4, 4
        );

        RAISE EXCEPTION 'FAIL: duplicate review was accepted';
    EXCEPTION
        WHEN unique_violation THEN
            RAISE NOTICE 'PASS: duplicate review rejected';
    END;

    BEGIN
        UPDATE reviews
        SET space_rating = 6
        WHERE id = v_review_id;

        RAISE EXCEPTION 'FAIL: invalid rating was accepted';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'PASS: invalid rating rejected';
    END;

    INSERT INTO review_images (
        review_id, storage_key, mime_type,
        size_bytes, width, height, position
    )
    VALUES (
        v_review_id,
        'constraint-test/' || txid_current()::text || '.webp',
        'image/webp',
        1024,
        100,
        100,
        0
    );

    DELETE FROM reviews
    WHERE id = v_review_id;

    IF EXISTS (
        SELECT 1
        FROM review_images
        WHERE review_id = v_review_id
    ) THEN
        RAISE EXCEPTION 'FAIL: image metadata was not cascade-deleted';
    END IF;

    RAISE NOTICE 'PASS: review deletion cascades to image metadata';
END;
$$;

ROLLBACK;