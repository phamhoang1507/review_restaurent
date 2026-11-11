# LocalSpot project state

## Environment

- Repository: ~/chatgpt/review_restaurent
- Windows with Ubuntu WSL2.
- Ubuntu Docker CLI connects to Docker Desktop.
- API host URL: http://localhost:8001.
- API container port: 8000.
- PostgreSQL host port: 5432.
- Redis is accessible inside the Docker network.

## Working agreement

- Explain in Vietnamese; code and CLI use English.
- Agree on design before large implementation changes.
- Deliver files and commands in chat for execution on the user's machine.
- Specify exact file paths and insertion/replacement locations.
- Update README, .env.example and CHANGELOG with relevant changes.
- Verify and commit/push each completed feature.
- Small fixes may be included in the current feature commit.
- Never commit .env.
- Update this document at each milestone.

## Stack and architecture

- Modular monolith.
- Python 3.12 and FastAPI.
- Synchronous SQLAlchemy and psycopg.
- PostgreSQL 17 and Redis 7.4.
- uv with committed uv.lock.
- Alembic migrations run explicitly, not during API startup.
- API runs as a non-root container user.
- Development reload and read-only source bind mounts.
- compose.migrations.yaml enables writable migration generation.

## Database

- 0001: users, provinces, districts.
- 0002: places, reviews, review_images.
- 0003: auth_sessions.
- 0004: pg_trgm extension and ix_places_name_trgm GIN index.
- User email has a unique index on lower(email).
- Login queries use the same lower(email) expression.
- One review per user/place.
- Three mandatory ratings from 1 to 5.
- Prices are integer VND with database constraints.
- Review deletion cascades image metadata only.
- updated_at uses SQLAlchemy onupdate, not a database trigger.
- Default list pagination will use created_at and id.
- Aggregate ratings are not persisted yet.

## Auth implementation

- Argon2id password hashing.
- JWT access tokens with issuer, audience and expiration validation.
- User and active status loaded from the database.
- require_admin dependency exists.
- Opaque refresh tokens; database stores SHA-256 hashes.
- Refresh rotation uses transactions and row locks.
- Reuse of a revoked token revokes the session family.
- Refresh family has an absolute lifetime from login.
- Logout revokes the current family and deletes its cookie.
- Issued access tokens remain valid until expiry after logout.
- Refresh cookie: HttpOnly, SameSite=Lax, path /api/v1/auth.
- Cookie expiration is normalized to datetime.UTC.
- Login, refresh and logout require a trusted Origin.
- Redis fixed-window rate limits protect Auth endpoints.
- Clients sharing an IP share the same endpoint quota.
- Admin creation CLI: python -m app.cli create-admin.
- CORS uses the same explicit origin allowlist as Auth Origin validation.

## Endpoints

- GET /health/live
- GET /health/ready
- POST /api/v1/auth/register
- POST /api/v1/auth/login
- POST /api/v1/auth/refresh
- POST /api/v1/auth/logout
- GET /api/v1/users/me
- GET /api/v1/locations/provinces
- GET /api/v1/locations/provinces/{province_id}/districts
- GET /api/v1/places
- GET /api/v1/places/{place_id}
- POST /api/v1/places — Admin
- PATCH /api/v1/places/{place_id} — Admin
- DELETE /api/v1/places/{place_id} — Admin soft delete
- GET /api/v1/places/{place_id}/reviews
- POST /api/v1/places/{place_id}/reviews
- PATCH /api/v1/reviews/{review_id}
- DELETE /api/v1/reviews/{review_id}
- GET /api/v1/reviews/{review_id}/images
- POST /api/v1/reviews/{review_id}/images
- DELETE /api/v1/review-images/{image_id}

## Verification

- Revisions 0001 and 0002 were verified on the user's machine.
- Database constraint verification script is available.
- Auth integration script expects 13 PASS messages.
- Migration head is 0005; schema drift verification uses alembic check.
- Reviewed Auth flows passed all 13 local integration checks.
- Auth script creates persistent local test users and prints their credentials.
- Review image integration script completed all 8 lifecycle checks.

## Not implemented yet

- Frontend.
- Accent-insensitive search and large-dataset query benchmarking.
- Session retention and cleanup.
- CI/CD and production deployment.
- Production TLS, secrets management, backup and restore verification.
- Broader automated tests, including concurrent refresh scenarios.

## Git and Docker versions

- Auth foundation, basic endpoints and initial rate limiting have separate commits.
- Auth, Places, Reviews and Search have been committed.
- Secure review image upload and cleanup are the current pending feature commit.
- Docker release tags must identify a specific clean Git revision.
- Do not overwrite published release tags.
- v0.3.0-auth-complete published for the Auth/Admin/CORS milestone.
- Location lookup endpoints belong to the next development milestone.

## Current step

- Revision 0005 adds image status, position bounds and storage deletion jobs.
- Review images use pending/ready lifecycle.
- Objects remain private and browser access uses signed URLs.
- Cleanup worker retries failed object deletion.
- Next: web frontend, CI/CD and production operations.