BEGIN;

-- 1. provinces
INSERT INTO provinces (name)
SELECT 'Ha Noi'
WHERE NOT EXISTS (SELECT 1 FROM provinces WHERE name = 'Ha Noi');

-- 2. districts
INSERT INTO districts (province_id, name)
SELECT p.id, 'Ba Dinh'
FROM provinces p
WHERE p.name = 'Ha Noi'
ON CONFLICT (province_id, name) DO NOTHING;

-- 3. users (password_hash là placeholder, user này KHÔNG login được)
INSERT INTO users (email, password_hash, display_name, role)
VALUES ('seed-user@example.com', 'placeholder-not-a-real-hash', 'Seed User', 'user')
ON CONFLICT DO NOTHING;

-- 4. places
INSERT INTO places (district_id, created_by, name, address, description, min_price, max_price)
SELECT d.id, u.id, 'Seed Place', '1 Seed Street', 'Seed place for testing', 20000, 70000
FROM districts d
JOIN provinces p ON p.id = d.province_id AND p.name = 'Ha Noi'
CROSS JOIN users u
WHERE d.name = 'Ba Dinh'
  AND lower(u.email) = 'seed-user@example.com'
  AND NOT EXISTS (SELECT 1 FROM places WHERE name = 'Seed Place');

-- 5. reviews
INSERT INTO reviews (user_id, place_id, content, space_rating, food_drink_rating, value_rating)
SELECT u.id, pl.id, 'Seed review content for testing.', 5, 4, 4
FROM users u
JOIN places pl ON pl.name = 'Seed Place'
WHERE lower(u.email) = 'seed-user@example.com'
ON CONFLICT (user_id, place_id) DO NOTHING;

-- 6. review_images
INSERT INTO review_images (review_id, storage_key, mime_type, size_bytes, width, height, position, status)
SELECT r.id, 'review-images/seed/seed-1.webp', 'image/webp', 1024, 32, 24, 0, 'ready'
FROM reviews r
JOIN users u ON u.id = r.user_id AND lower(u.email) = 'seed-user@example.com'
JOIN places pl ON pl.id = r.place_id AND pl.name = 'Seed Place'
ON CONFLICT (review_id, position) DO NOTHING;

-- 7. auth_sessions
INSERT INTO auth_sessions (id, user_id, family_id, token_hash, expires_at)
SELECT gen_random_uuid(), u.id, gen_random_uuid(),
       encode(sha256('seed-refresh-token'::bytea), 'hex'),
       now() + interval '7 days'
FROM users u
WHERE lower(u.email) = 'seed-user@example.com'
ON CONFLICT (token_hash) DO NOTHING;

-- 8. storage_deletion_jobs (key khác review_images để worker cleanup không xóa nhầm object thật)
INSERT INTO storage_deletion_jobs (storage_key)
VALUES ('review-images/seed/orphan-1.webp')
ON CONFLICT (storage_key) DO NOTHING;

COMMIT;

-- Verification
SELECT 'provinces' AS tbl, count(*) FROM provinces
UNION ALL SELECT 'districts', count(*) FROM districts
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'places', count(*) FROM places
UNION ALL SELECT 'reviews', count(*) FROM reviews
UNION ALL SELECT 'review_images', count(*) FROM review_images
UNION ALL SELECT 'auth_sessions', count(*) FROM auth_sessions
UNION ALL SELECT 'storage_deletion_jobs', count(*) FROM storage_deletion_jobs;

SELECT id, name FROM districts ORDER BY id;