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

### Fixed

- Added a writable migration override for revision generation.
- Changed API host port to 8001; internal container port remains 8000.
- Updated README to match implemented database models and migration workflow.
- Normalize refresh-cookie expiration to datetime.UTC before HTTP date formatting.
- Improve Auth verification script errors for non-JSON responses and rate limits.
- Match the login email lookup to the lower(email) functional index.
- Document safe local JWT secret initialization.
- Synchronize README and project state with implemented Auth flows.