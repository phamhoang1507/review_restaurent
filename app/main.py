import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis import Redis
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import engine

from app.core.auth_config import get_auth_settings
from app.modules.auth.router import router as auth_router
from app.modules.users.router import router as users_router
from app.modules.locations.router import router as locations_router
from app.modules.places.router import router as places_router
from app.modules.reviews.router import router as reviews_router
from app.core.storage_config import get_storage_settings
from app.services.storage import create_s3_client

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    get_auth_settings()
    get_storage_settings()

    app.state.redis = Redis.from_url(
        settings.redis_url,
        socket_connect_timeout=3,
        socket_timeout=3,
    )

    app.state.s3 = None
    app.state.s3_public = None

    try:
        app.state.s3 = create_s3_client()
        app.state.s3_public = create_s3_client(public=True)
        yield
    finally:
        if app.state.s3_public is not None:
            app.state.s3_public.close()

        if app.state.s3 is not None:
            app.state.s3.close()

        app.state.redis.close()
        engine.dispose()


app = FastAPI(
    title=get_settings().app_name,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_auth_settings().auth_allowed_origins,
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=[
        "Authorization",
        "Content-Type",
    ],
    expose_headers=[
        "Retry-After",
    ],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(locations_router, prefix="/api/v1")
app.include_router(places_router, prefix="/api/v1")
app.include_router(reviews_router, prefix="/api/v1")


def check_postgres() -> None:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))


@app.get("/health/live", tags=["health"])
def liveness() -> dict[str, str]:
    return {"status": "ok"}


@app.get(
    "/health/ready",
    tags=["health"],
    responses={
        200: {"description": "All dependencies are ready"},
        503: {"description": "A required dependency is unavailable"},
    },
)
def readiness(request: Request) -> JSONResponse:
    checks: dict[str, str] = {}

    for name, check in (
        ("postgres", check_postgres),
        ("redis", request.app.state.redis.ping),
        (
            "storage",
            lambda: request.app.state.s3.head_bucket(
                Bucket=get_storage_settings().s3_bucket,
            ),
        ),
    ):
        try:
            check()
            checks[name] = "ok"
        except Exception:
            logger.warning("Readiness check failed: %s", name)
            checks[name] = "unavailable"

    healthy = all(value == "ok" for value in checks.values())

    return JSONResponse(
        status_code=200 if healthy else 503,
        content={
            "status": "ok" if healthy else "unavailable",
            "checks": checks,
        },
    )
