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
- Chưa triển khai business schema, Auth hoặc upload ảnh.

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

`POSTGRES_HOST`, `POSTGRES_PORT` và `REDIS_URL` sẽ được API sử dụng ở bước tiếp theo. Port mapping hiện tại được cấu hình trong compose.yaml.

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

Thêm FastAPI, dependency lockfile, Dockerfile và health endpoints.

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
curl --fail http://localhost:8000/health/live
curl --fail http://localhost:8000/health/ready
```

Swagger UI: http://localhost:8000/docs

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
   curl --fail http://localhost:8000/health/ready
   docker compose ps
   ```