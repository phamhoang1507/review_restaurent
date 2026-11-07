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

### Verified

- Docker Compose build và startup thành công trên Ubuntu WSL2 với Docker Desktop.
- API, PostgreSQL và Redis đều healthy.
- Liveness và readiness endpoints trả HTTP 200.
- Revision 0001 applied successfully.
- Verified users and districts constraints in PostgreSQL.
- Alembic detected no schema drift.
- API readiness remains healthy after migration.