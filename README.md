# LocalSpot

Backend cho nền tảng tìm kiếm và review quán cà phê, quán ăn địa phương.

Repository directory: `review_restaurent`.
Application name: `LocalSpot`.

## Current progress

- PostgreSQL và Redis chạy bằng Docker Compose.
- FastAPI chạy bằng non-root container.
- Dependency versions được cố định bằng uv.lock.
- Liveness và readiness endpoints.
- Development bind mount và auto-reload.
- Đã có models và migrations cho users, provinces, districts, places, reviews và review_images.
- Chưa triển khai Auth, business API hoặc upload ảnh.

## Requirements

- Ubuntu trên WSL2.
- Docker Desktop đang chạy và bật WSL Integration.
- Docker Compose hỗ trợ `up --wait`.
- Host port 5432 còn trống.

Chạy các lệnh trong thư mục gốc repository.

## Environment configuration

```bash
cp .env.example .env
```

`.env` không được commit. Credentials mẫu chỉ dùng cho local development.

| Variable | Purpose |
|---|---|
| COMPOSE_PROJECT_NAME | Prefix của Docker resources |
| POSTGRES_DB | Database name |
| POSTGRES_USER | Database user |
| POSTGRES_PASSWORD | Database password |
| POSTGRES_HOST | Hostname dành cho API bên trong Docker network |
| POSTGRES_PORT | PostgreSQL internal port |
| REDIS_URL | Redis connection URL dành cho API trong Docker network |

`POSTGRES_HOST`, `POSTGRES_PORT` và `REDIS_URL` API sử dụng POSTGRES_HOST, POSTGRES_PORT và REDIS_URL để kết nối services bên trong Docker network. Port mapping hiện tại được cấu hình trong compose.yaml.

## Start services

```bash
docker compose config --quiet
docker compose up -d --wait
docker compose ps
```

PostgreSQL và Redis cần hiển thị trạng thái healthy.

## Verify PostgreSQL

```bash
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT current_database(), current_user, version();"'
```

## Verify Redis

```bash
docker compose exec redis redis-cli ping
```

Expected response: `PONG`.

## Logs

```bash
docker compose logs --tail=100 postgres redis
```

## Stop services

```bash
docker compose down
```

Named volumes được giữ lại.

Lệnh dưới đây xóa toàn bộ dữ liệu PostgreSQL và Redis của project.
Chỉ chạy khi chủ động reset local environment:

```bash
docker compose down -v
```

## PostgreSQL initialization

POSTGRES_DB, POSTGRES_USER và POSTGRES_PASSWORD được dùng khi data directory còn trống.

Sửa các biến này trong .env không tự cập nhật database, user hoặc password đã tồn tại.

## Troubleshooting: host port 5432 is occupied

1. Root cause: một service khác đang sử dụng host port 5432.

2. Fix: đổi mapping PostgreSQL trong compose.yaml thành:

   ```yaml
   ports:
     - "127.0.0.1:5433:5432"
   ```

   PostgreSQL trong Docker vẫn chạy trên port 5432.
   Công cụ trên host kết nối localhost:5433.

3. Verify:

   ```bash
   docker compose up -d --wait
   docker compose ps
   ```

## Documentation maintenance

Mỗi thay đổi code phải cập nhật tài liệu và cấu hình liên quan trong cùng thay đổi:

- Thay đổi environment variables: cập nhật .env.example và README.
- Thay đổi infrastructure: cập nhật Compose và hướng dẫn vận hành.
- Thay đổi API: cập nhật schemas, ví dụ sử dụng và tests liên quan.
- Thay đổi database: cập nhật migration và tài liệu thiết kế.
- Ghi nhận các thay đổi đáng chú ý trong CHANGELOG.md.

## Next step

Design Auth flow, API contracts and authorization before implementation.

## API development

Tạo uv.lock trước lần build đầu tiên:

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e UV_CACHE_DIR=/tmp/uv-cache \
  -v "$PWD:/app" \
  -w /app \
  python:3.12-slim-bookworm \
  sh -c 'pip install --no-cache-dir --target /tmp/uv-tools uv==0.11.19 && /tmp/uv-tools/bin/uv lock'
```

Commit cả pyproject.toml và uv.lock.

```bash
docker compose up -d --build --wait
curl --fail http://localhost:8001/health/live
curl --fail http://localhost:8001/health/ready
```

Swagger UI: http://localhost:8001/docs

APP_NAME cấu hình tên ứng dụng trong OpenAPI.

compose.override.yaml tự bật auto-reload và mount source code.
Khi thay đổi dependencies, tạo lại lockfile và build lại API image.

## Health endpoints

- GET /health/live: trả 200 khi API process xử lý request được.
- GET /health/ready: kiểm tra PostgreSQL và Redis, trả 503 nếu dependency lỗi.

## API logs

```bash
docker compose logs --tail=100 api
```

## Troubleshooting: API is not ready

1. Root cause: xem dependency unavailable trong readiness response,
   rồi đối chiếu logs với hostname và credentials trong .env.

2. Fix: sửa cấu hình sai. Với API chạy trong Compose,
   POSTGRES_HOST phải là postgres và REDIS_URL là redis://redis:6379/0.
   Sau khi sửa .env:

   ```bash
   docker compose up -d --force-recreate api
   ```

3. Verify:

   ```bash
   curl --fail http://localhost:8001/health/ready
   docker compose ps
   ```

## Database migrations

Các bảng hiện tại:

- users: tài khoản, role và unique index trên lower(email).
- provinces: tỉnh/thành.
- districts: quận/huyện, tham chiếu provinces.
- alembic_version: revision do Alembic quản lý.
- places: địa điểm, khoảng giá và references tới district/user.
- reviews: một review/user/place, ba rating từ 1 đến 5.
- review_images: metadata ảnh, cascade khi xóa review.

Áp dụng migrations:

```bash
docker compose exec api alembic upgrade head
```

Xem revision và kiểm tra schema drift:

```bash
docker compose exec api alembic current
docker compose exec api alembic check
```

Xem SQL trước khi apply:

```bash
docker compose exec api alembic upgrade head --sql
```

Lệnh --sql xuất toàn bộ đường migration từ base đến head theo mặc định;
không chạy trực tiếp SQL này trên database đã có các bảng tương ứng.

Rollback một revision:

```bash
docker compose exec api alembic downgrade -1
```

Rollback migration đầu tiên sẽ xóa users, provinces và districts cùng dữ liệu.
Chỉ thực hiện trên database local dùng để kiểm thử hoặc theo kế hoạch migration
đã được review.

Migrations được chạy bằng lệnh riêng, không tự chạy trong API startup.

updated_at tự cập nhật khi thao tác qua SQLAlchemy ORM.
SQL update trực tiếp cần tự đặt updated_at vì chưa có database trigger.

## Database constraint verification

```bash
docker compose exec -T postgres sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < scripts/check_review_constraints.sql
```

Script kiểm tra invalid price range, duplicate review, invalid rating
và cascade deletion. Dữ liệu kiểm thử được rollback.

## Project context

Thiết kế, môi trường, tiến độ và các phần chưa triển khai nằm trong
docs/project-state.md. Cập nhật file này khi hoàn thành mỗi mốc.

## Generate a migration

PostgreSQL phải đang chạy và database phải ở revision head hiện tại
trước khi sinh migration tiếp theo.

```bash
docker compose \
  -f compose.yaml \
  -f compose.override.yaml \
  -f compose.migrations.yaml \
  run --rm --no-deps \
  --user "$(id -u):$(id -g)" \
  api alembic revision --autogenerate -m "describe schema change"
```

Review migration trước khi apply. Không tạo lại revision 0002 đã tồn tại.

## Auth foundation

- Password hashing: Argon2id.
- Auth configuration: app/core/auth_config.py.
- JWT signing: HS256, issuer localspot-api, audience localspot-web.
- Access token lifetime: 15 minutes.
- Refresh token lifetime: 7 days.
- auth_sessions stores SHA-256 refresh-token hashes and rotation families.
- JWT_SECRET_KEY must contain at least 32 characters; never commit it.
- REFRESH_COOKIE_SECURE=false is for local HTTP only; use true with HTTPS.

## Auth API

- POST /api/v1/auth/register: tạo user, không cho client chọn role.
- POST /api/v1/auth/login: trả JWT access token.
- GET /api/v1/users/me: yêu cầu Bearer access token.
- Password đăng ký: 12–128 ký tự.
- Email được normalize về lowercase trước khi lưu và lookup.
- Refresh rotation, logout và rate limiting chưa được triển khai.
- Chỉ chạy local; hoàn tất rate limiting trước khi mở Auth ra public.

Verification: python3 scripts/check_auth.py
scripts/check_auth.py prints the generated local test account credentials.
These credentials are for local testing only.

Script tạo và giữ lại một user test ngẫu nhiên trong database local.

## Auth rate limits

- Login: 10 requests per 60 seconds per client IP.
- Registration: 5 requests per 60 seconds per client IP.
- Limits are configurable through AUTH_RATE_WINDOW_SECONDS,
  LOGIN_RATE_LIMIT and REGISTER_RATE_LIMIT.
- Exceeding a limit returns 429 with Retry-After.
- Redis failure returns 503 for these Auth endpoints.
- Clients sharing an IP share the same endpoint quota.
- Reverse-proxy client IP handling must be configured at deployment.

## Docker Hub

Authenticate with docker login.

Build and push a clean Git revision:
docker build -t <username>/localspot-api:<commit> .
docker push <username>/localspot-api:<commit>

The image contains application code and dependencies.
Runtime configuration and database data are not included.