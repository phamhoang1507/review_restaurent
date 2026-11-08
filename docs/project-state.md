# LocalSpot project state

## Working environment

- Repository: ~/chatgpt/review_restaurent
- Host: Windows, Ubuntu WSL2.
- Docker CLI in Ubuntu connects to Docker Desktop.
- Application name: LocalSpot.
- Guidance and explanations: Vietnamese.
- Code, identifiers and CLI: English.

## Working agreement

- Agree on design before large implementation steps.
- Deliver complete files directly in chat for the user to create locally.
- Update README, configuration examples and CHANGELOG with relevant changes.
- Debug format: root cause → concrete fix → verification commands.
- Never request or commit .env contents.
- Update this document at each completed milestone.

## Architecture

- Modular monolith.
- FastAPI with synchronous SQLAlchemy database access.
- PostgreSQL 17, Redis 7.4.
- Python 3.12, uv with committed uv.lock.
- Alembic controls schema changes; API startup does not run migrations.
- API container uses a non-root user.
- compose.override.yaml enables development reload and bind mounts.

## Implemented foundation

- Settings: app/core/config.py.
- Engine and request session dependency: app/db/session.py.
- Declarative base and timestamps: app/db/base.py.
- Health endpoints: app/main.py.
- GET /health/live checks process availability.
- GET /health/ready checks PostgreSQL and Redis.
- Session commits are controlled by business services.
- updated_at uses SQLAlchemy onupdate, not a database trigger.

## Database decisions

- IDs: BIGINT IDENTITY.
- Users: role user/admin, unique index on lower(email).
- Districts: unique(province_id, name).
- Places: admin-managed, VND integer price range, is_active for closure.
- Reviews: unique(user_id, place_id); users can edit/delete their review.
- Three mandatory integer ratings from 1 to 5.
- No persisted overall rating or aggregate counters yet.
- Review images: unique storage_key and unique(review_id, position).
- Deleting a review cascades image metadata deletion only.
- Other implemented foreign keys restrict parent deletion.
- Default pagination will use created_at and id.
- File cleanup requires separate retryable processing.
- Maximum 5 images/review will require transaction and row locking.

## Verification status

- Foundation: verified healthy on the user's WSL2 machine.
- Revision 0001: applied; alembic check reported no schema drift.
- Revision 0002: applied; alembic check reported no schema drift.
- Constraint checks: four checks passed; test data rolled back.
- API host endpoint: http://localhost:8001.

## Not implemented yet

- Auth, password hashing, sessions/tokens and authorization.
- Business API routes and Pydantic request/response schemas.
- Object storage, image processing and upload.
- Search, pg_trgm and cursor pagination.
- Production deployment, TLS, backup and CI.

## Current step

Register, login and current-user endpoints verified locally.
Access-token validation and password hashing are working.
Refresh rotation, logout and rate limiting are not implemented yet.