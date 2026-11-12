# Changelog

## Unreleased

### Added

- PostgreSQL 17 và Redis 7.4 qua Docker Compose.
- Healthchecks và persistent named volumes.
- Environment template và Git ignore rules.
- README hướng dẫn setup, verification và vận hành local.
- FastAPI application với validated environment settings.
- SQLAlchemy connection pool và session dependency.
- Redis client lifecycle và dependency readiness checks.
- Non-root API Dockerfile và development auto-reload.
- Python dependency management bằng uv và uv.lock.
- SQLAlchemy Base với constraint naming convention.
- User, Province và District models.
- Alembic configuration và revision 0001.
- Database constraints cho user role, email uniqueness và district references.
- Migration commands và hướng dẫn rollback trong README.
- Place, Review and ReviewImage SQLAlchemy models.
- Revision 0002 for places, reviews and review_images.
- Price/rating constraints and one-review-per-user-per-place uniqueness.
- Composite indexes for district places and place reviews.
- Transactional SQL checks for constraints and metadata cascade deletion.
- Versioned project context in docs/project-state.md.
- Argon2id password hashing and verification helpers.
- Validated Auth settings and environment template.
- AuthSession model and revision 0003.
- Docker Hub build/push instructions.
- Register, login and current-user endpoints.
- JWT access-token validation with issuer, audience and expiration.
- Database-backed active-user and admin authorization dependencies.
- Auth API integration check script.
- Redis-backed fixed-window rate limiting for login and registration.
- Atomic counter updates and expiration using Lua.
- Retry-After responses for exceeded limits.
- Refresh-token rotation with transactional session locking.
- Refresh-token reuse detection and session-family revocation.
- Logout with refresh-cookie deletion.
- Trusted-Origin checks for cookie-based authentication flows.
- Refresh/logout rate limits and expanded Auth integration checks.
- Interactive CLI for creating new Admin accounts.
- Duplicate-account protection without implicit privilege escalation.
- Credentialed CORS configuration for allowed frontend origins.
- Public province and district lookup endpoints with bounded pagination.
- Repeatable local demo location fixture.
- Admin-managed Places create/update/deactivate/restore operations.
- Public place detail and cursor-paginated listing.
- District and overlapping price-range filters.
- Places authorization and lifecycle integration checks.
- Reviews CRUD with owner authorization and Admin deletion.
- Cursor-paginated public reviews with author display names.
- Dynamic place rating aggregates without stored counters.
- Bulk rating lookup for Places pages.
- Review lifecycle and aggregate verification script.
- Case-insensitive place-name substring search with escaped wildcard characters.
- Minimum-rating filtering combined with existing district and price filters.
- Revision 0004 with pg_trgm and a GIN index on place names.
- Search, combined-filter and cursor-pagination integration checks.
- Private S3-compatible storage with a pinned local MinIO source build.
- Dedicated private-bucket bootstrap and storage readiness check.
- Persistent storage verification script.
- Secure review image upload endpoints.
- JPEG, PNG and WebP validation with EXIF orientation.
- WebP conversion, metadata stripping and image resizing.
- Per-user upload rate limiting and processing concurrency control.
- Database-enforced maximum of five images per review.
- Pending/ready upload lifecycle.
- Durable object-deletion outbox with exponential retry backoff.
- Storage cleanup worker and manual cleanup CLI.
- Revision 0005 for review image state and storage deletion jobs.
- Review image lifecycle integration verification script.
- React AuthProvider with session bootstrap, authentication actions, stale-operation protection and explicit registration auto-login errors.

- Frontend authentication client with in-memory access tokens, HttpOnly refresh-cookie rotation and single-flight 401 retry.

- Frontend Auth unit tests for login, single-flight refresh, one-time retry, StrictMode bootstrap and logout failure.

### Verified

- Docker Compose build và startup thành công trên Ubuntu WSL2 với Docker Desktop.
- API, PostgreSQL và Redis đều healthy.
- Liveness và readiness endpoints trả HTTP 200.
- Revision 0001 applied successfully.
- Verified users and districts constraints in PostgreSQL.
- Alembic detected no schema drift.
- API readiness remains healthy after migration.
- Revision 0003 is current with no schema drift.
- Auth integration script completed all 13 checks.
- Revision 0005 is current with no schema drift.
- Image processing verification completed all five checks.
- Review image lifecycle integration verification completed all eight checks.

- Five frontend authentication tests, Oxlint, TypeScript and Vite production build completed successfully.

### Fixed

- Added a writable migration override for revision generation.
- Changed API host port to 8001; internal container port remains 8000.
- Updated README to match implemented database models and migration workflow.
- Normalize refresh-cookie expiration to datetime.UTC before HTTP date formatting.
- Improve Auth verification script errors for non-JSON responses and rate limits.
- Match the login email lookup to the lower(email) functional index.
- Document safe local JWT secret initialization.
- Synchronize README and project state with implemented Auth flows.
- Recreated the local PostgreSQL container with its configured host port mapping for DBeaver access.
- Close boto3 clients using contextlib.closing in storage bootstrap.