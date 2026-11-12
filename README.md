# LocalSpot

Full-stack web application cho nền tảng tìm kiếm và review quán cà phê, quán ăn địa phương.

Repository directory: `review_restaurent`.
Application name: `LocalSpot`.

## Current progress

- PostgreSQL và Redis chạy bằng Docker Compose.
- FastAPI chạy bằng non-root container.
- Dependency versions được cố định bằng uv.lock.
- Liveness và readiness endpoints.
- Development bind mount và auto-reload.
- Đã có models và migrations cho users, provinces, districts, places, reviews và review_images.
- Đã triển khai register, login, current user, refresh rotation và logout.
- Đã có Auth rate limiting, Origin validation và dependency phân quyền.
- Đã triển khai Places/Reviews API, rating aggregates và search/filter.
- Đã thêm private object storage và bucket bootstrap.
- Đã triển khai secure review image upload API và storage cleanup worker.
- React, TypeScript và Vite frontend chạy bằng Docker Compose.
- Frontend Auth client và AuthProvider khôi phục session bằng HttpOnly refresh cookie.
- Màn hình Login/Register hỗ trợ validation, lỗi rate limit, thông tin tài khoản và logout.
- React Router cung cấp Home, Login, Register, protected Account và trang 404.

## Requirements

- Ubuntu trên WSL2.
- Docker Desktop đang chạy và bật WSL Integration.
- Docker Compose hỗ trợ `up --wait`.
- Host port 5432 còn trống.
- Host port 8001 còn trống.
- Host port 5173 còn trống.
- Host ports 9000 và 9001 còn trống.

Chạy các lệnh trong thư mục gốc repository.

## Environment configuration

```bash
python3 - <<'PY'
from pathlib import Path
import secrets
import shutil

path = Path(".env")

if not path.exists():
    shutil.copyfile(".env.example", path)

lines = path.read_text().splitlines()
found = False

for index, line in enumerate(lines):
    key, separator, value = line.partition("=")

    if separator and key.strip() == "JWT_SECRET_KEY":
        found = True

        if value.strip() in {"", '""', "''"}:
            lines[index] = f"JWT_SECRET_KEY={secrets.token_hex(32)}"

if not found:
    lines.append(f"JWT_SECRET_KEY={secrets.token_hex(32)}")

path.write_text("\n".join(lines) + "\n")
print("Local environment ready; existing non-empty JWT secret preserved.")
PY
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
| APP_NAME | Tên ứng dụng trong OpenAPI |
| VITE_API_BASE_URL | API URL được frontend gọi từ browser |
| JWT_SECRET_KEY | Secret ký JWT, tối thiểu 32 ký tự |
| JWT_ALGORITHM | Thuật toán ký, hiện chỉ hỗ trợ HS256 |
| JWT_ISSUER / JWT_AUDIENCE | Issuer và audience của access token |
| ACCESS_TOKEN_MINUTES | Thời hạn access token, mặc định 15 phút |
| REFRESH_TOKEN_DAYS | Thời hạn tuyệt đối của refresh family, mặc định 7 ngày |
| REFRESH_COOKIE_NAME | Tên refresh cookie |
| REFRESH_COOKIE_SECURE | false cho local HTTP, true cho HTTPS |
| AUTH_ALLOWED_ORIGINS | JSON array dùng cho CORS và trusted-Origin validation của Auth |
| AUTH_RATE_WINDOW_SECONDS | Độ dài cửa sổ rate limit |
| LOGIN_RATE_LIMIT | Login requests/IP/window |
| REGISTER_RATE_LIMIT | Register requests/IP/window |
| REFRESH_RATE_LIMIT | Giới hạn riêng cho từng endpoint refresh và logout |
| S3_ENDPOINT_URL | MinIO endpoint dùng trong Docker network |
| S3_PUBLIC_ENDPOINT_URL | Endpoint được ký vào URL trả cho browser |
| S3_ACCESS_KEY / S3_SECRET_KEY | MinIO credentials |
| S3_BUCKET | Private bucket chứa ảnh review |
| S3_PRESIGNED_TTL_SECONDS | Thời hạn signed URL |
| IMAGE_UPLOAD_MAX_BYTES | Giới hạn byte của file ảnh |
| IMAGE_MAX_PIXELS | Giới hạn tổng pixel |
| IMAGE_MAX_DIMENSION | Kích thước tối đa sau resize |
| IMAGE_WEBP_QUALITY | Chất lượng WebP |
| IMAGE_UPLOAD_RATE_LIMIT | Upload/user/window |
| IMAGE_UPLOAD_RATE_WINDOW_SECONDS | Upload rate-limit window |
| IMAGE_PROCESSING_CONCURRENCY | Số ảnh xử lý đồng thời mỗi process |
| IMAGE_PENDING_TTL_SECONDS | TTL của pending upload |
| STORAGE_CLEANUP_INTERVAL_SECONDS | Chu kỳ cleanup worker |

API sử dụng POSTGRES_HOST, POSTGRES_PORT và REDIS_URL để kết nối services
bên trong Docker network. Host port mapping nằm trong compose.yaml.

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

Build the public Places listing and filters, then add CI/CD, reverse proxy,
TLS, monitoring, backup and restore verification.

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
- GET /health/ready: kiểm tra PostgreSQL, Redis và storage bucket; trả 503 nếu dependency lỗi.

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
- auth_sessions: refresh-token hashes, expiration và session families.

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
downgrade -1 rollback revision gần nhất. Nếu database đang ở 0003,
lệnh này xóa auth_sessions cùng dữ liệu phiên đăng nhập.

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

Không tạo lại các revision 0001–0004 đã tồn tại.

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
- POST /api/v1/auth/refresh: rotate refresh cookie và cấp access token mới.
- POST /api/v1/auth/logout: revoke session family và xóa refresh cookie.
- Password đăng ký: 12–128 ký tự.
- Email được normalize về lowercase trước khi lưu và lookup.

Verification: python3 scripts/check_auth.py
scripts/check_auth.py prints the generated local test account credentials.
These credentials are for local testing only.

Script tạo và giữ lại một user test ngẫu nhiên trong database local.

## Refresh sessions and CSRF

- Login, refresh và logout yêu cầu Origin khớp AUTH_ALLOWED_ORIGINS.
- CORS và CSRF Origin validation dùng chung AUTH_ALLOWED_ORIGINS.
- CORS cho phép credentialed requests từ các origin cụ thể.
- Refresh token được lưu trong HttpOnly, SameSite=Lax cookie.
- Cookie path: /api/v1/auth.
- Database chỉ lưu SHA-256 hash của refresh token.
- Rotation giữ nguyên thời hạn tuyệt đối 7 ngày từ login.
- Dùng lại token đã revoke sẽ revoke toàn bộ session family.
- Frontend phải tránh gửi nhiều refresh requests đồng thời.
- Logout không vô hiệu hóa access token đã phát hành; token hết hạn tối đa sau 15 phút.
- Refresh/logout có rate limit riêng theo REFRESH_RATE_LIMIT.
- Production HTTPS phải bật REFRESH_COOKIE_SECURE=true.
- Old session records cần retention/cleanup trước khi vận hành production.

Local verification: python3 scripts/check_auth.py
Expected: 13 PASS messages.

## Auth rate limits

- Login: 10 requests per 60 seconds per client IP.
- Registration: 5 requests per 60 seconds per client IP.
- Limits are configurable through AUTH_RATE_WINDOW_SECONDS,
  LOGIN_RATE_LIMIT and REGISTER_RATE_LIMIT.
- Exceeding a limit returns 429 with Retry-After.
- Redis failure returns 503 for these Auth endpoints.
- Clients sharing an IP share the same endpoint quota.
- Reverse-proxy client IP handling must be configured at deployment.

## Create an Admin

```bash
docker compose exec api \
  python -m app.cli create-admin \
  --email admin@example.com \
  --display-name "LocalSpot Admin"
```

Password được nhập tương tác, không hiển thị trên terminal.

CLI chỉ tạo tài khoản mới. Email đã tồn tại sẽ bị từ chối;
không tự nâng quyền hoặc đổi password.

Password phải dài 12–128 ký tự.

## Frontend integration

- Frontend development origin: http://localhost:5173.
- API base URL: http://localhost:8001/api/v1.
- CORS uses AUTH_ALLOWED_ORIGINS.
- Login, refresh and logout requests use credentials: "include".
- Store the access token in frontend memory.
- Send the access token through the Authorization Bearer header.
- Coordinate concurrent requests so only one refresh runs at a time.
- Frontend quality gate runs Oxlint, Auth unit tests, TypeScript checking and a Vite production build.
- AuthProvider bootstraps the current session once, including React StrictMode remounts.
- AuthProvider exposes login, register, logout, retryBootstrap and the current user.
- Registration signs the new account in after the register request succeeds.
- If automatic login fails after account creation, RegistrationLoginError lets the UI continue at Login without retrying registration.
- Bootstrap failures are separate from form submission failures and can be retried.
- Login/Register fields use native semantics, autocomplete attributes and linked validation messages.
- Auth errors distinguish invalid credentials, duplicate email, rate limits and temporary service failures.
- Authenticated users see their account identity and can end the current session.
- Pure form tests cover normalization, mode-specific constraints and API error mapping.
- react-router-dom 7.18.5 is pinned for client-side navigation.
- Routes: `/`, `/login`, `/register`, protected `/account` and a wildcard 404 page.
- Protected redirects preserve only validated internal paths and return users after authentication.
- Navigation uses semantic links, active-route state and responsive keyboard-accessible controls.
- Route-state tests cover internal return paths and rejection of external redirect targets.

BrowserRouter requires the production reverse proxy to serve `index.html` for
unknown frontend paths such as `/account`. The reverse-proxy fallback will be
configured during the DevOps milestone.

Run the frontend quality gate:

```bash
docker compose run --rm --no-deps frontend npm run check
```

Use localhost consistently for frontend and API in local development.

## Location lookup API

Public endpoints:

- GET /api/v1/locations/provinces
- GET /api/v1/locations/provinces/{province_id}/districts

Both endpoints support limit and offset.

- Default limit: 100.
- Maximum limit: 200.
- A missing province returns 404.
- Invalid pagination parameters return 422.

Create local demo locations:

```bash
docker compose exec -T postgres sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < scripts/seed_demo_locations.sql
```

The fixture contains fictional demo locations.
It is not an official administrative dataset.

## Places API

Public:

- GET /api/v1/places
- GET /api/v1/places/{place_id}

Admin:

- POST /api/v1/places
- PATCH /api/v1/places/{place_id}
- DELETE /api/v1/places/{place_id}

List parameters:

- limit: default 20, maximum 100.
- cursor: use next_cursor from the previous response.
- district_id: filter by district.
- min_price/max_price: inclusive overlapping price-range filter.

Order: created_at DESC, id DESC.

Keep filters unchanged while following next_cursor.
Pagination is not a database snapshot; concurrent edits can change results.

DELETE sets is_active=false and preserves database history.
Public endpoints hide inactive places.
Admin PATCH with {"is_active": true} restores a place.

Place responses include rating and review_count.
A place without reviews returns rating=null and review_count=0.
Rating is calculated from original criterion scores and rounded to two decimals.
Search and filters:

- q: case-insensitive name substring, maximum 200 characters.
- Percent and underscore in q are treated as literal characters.
- Accent-insensitive search is not implemented.
- min_rating: 0–5, compared against the unrounded average.
- Places without reviews are excluded when min_rating is provided.
- Name search uses a pg_trgm GIN index.
- Keep all filters unchanged when following next_cursor.

Verification:

```bash
python3 scripts/check_places.py
```

The script requires an Admin account and an existing district ID.
It retains a test user and an inactive test place in the local database.

## Reviews API

Public:

- GET /api/v1/places/{place_id}/reviews

Authenticated:

- POST /api/v1/places/{place_id}/reviews
- PATCH /api/v1/reviews/{review_id}
- DELETE /api/v1/reviews/{review_id}
- GET /api/v1/reviews/{review_id}/images
- POST /api/v1/reviews/{review_id}/images
- DELETE /api/v1/review-images/{image_id}

Rules:

- One review per user/place; duplicates return 409.
- Content: 10–5000 characters.
- Each criterion requires an integer from 1 to 5.
- Owners can edit their own reviews.
- Owners and Admins can delete reviews.
- Admins cannot edit another user's review.
- Creating/editing reviews requires an active place.
- Owners/Admins may delete reviews of inactive places.
- Review listing uses created_at/id cursor pagination.
- Review deletion queues object deletion through the durable cleanup outbox.
- JPEG, PNG and static WebP uploads are validated and converted to WebP.
- Each review supports at most five images.
- Image objects remain private; API responses expose short-lived signed URLs.

Verification:

```bash
python3 scripts/check_reviews.py
```

The script retains two test users and one inactive place.

Review image integration verification:

```bash
python3 scripts/check_review_images.py
```

Expected: 8 PASS messages. The script requires an existing Admin account and a valid district ID.
It retains two test users and one inactive place, and removes every uploaded test object.

## Search verification

```bash
python3 scripts/check_search.py
```

The script requires an Admin account and an existing district ID.
It retains three inactive places, two reviews and one test user.

Revision 0004 creates pg_trgm if absent and adds ix_places_name_trgm.
The migration user requires permission to install the extension.

Small datasets may legitimately use sequential scans.
Evaluate search and aggregate filtering with EXPLAIN ANALYZE on realistic data.

## Private object storage

- S3 API: http://localhost:9000.
- Console: http://localhost:9001.
- Container endpoint: http://minio:9000.
- Browser endpoint: S3_PUBLIC_ENDPOINT_URL.
- Dedicated private bucket: S3_BUCKET.
- Presigned URL lifetime: S3_PRESIGNED_TTL_SECONDS, default 300 seconds.
- Credentials: S3_ACCESS_KEY and S3_SECRET_KEY.
- Signing region: S3_REGION, default us-east-1.
- Never replace a URL's hostname after signing it.
- Bootstrap removes anonymous policies from the dedicated LocalSpot bucket.
- Local development uses MinIO root credentials.
- Deployment requires a separate least-privilege application identity.

MinIO is built from RELEASE.2025-10-15T17-29-55Z
using docker/minio/Dockerfile.

Build with docker compose build minio.
Do not pull the local image tag.

The upstream Community repository is no longer maintained.
This dependency is for local development; deployment storage is not finalized.

storage-init is a one-shot job. Exited (0) is expected.
It uses the application image, so source changes require rebuilding storage-init.

Rebuild application images:

```bash
docker compose build api storage-init
```

Verify storage:

```bash
docker compose exec -T api python < scripts/check_storage.py
```

Expected: 6 PASS messages.

The check creates and deletes one temporary object.
It also reapplies the dedicated bucket's private-policy configuration.

Data is stored in minio_data.
docker compose down preserves it; down -v deletes it.

Review image upload/list/delete endpoints and durable object cleanup are implemented.

## Docker Hub

Authenticate with docker login.

Build and push a clean Git revision:
docker build -t <username>/localspot-api:<commit> .
docker push <username>/localspot-api:<commit>

The image contains application code and dependencies.
Runtime configuration and database data are not included.
