from fastapi import HTTPException, status
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.storage_config import get_storage_settings

MULTIPART_OVERHEAD_BYTES = 64 * 1024


class ReviewImageUploadLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    @staticmethod
    def is_review_image_upload(scope: Scope) -> bool:
        if scope["type"] != "http" or scope["method"] != "POST":
            return False

        parts = scope["path"].strip("/").split("/")

        return (
            len(parts) == 5
            and parts[:3] == ["api", "v1", "reviews"]
            and bool(parts[3])
            and parts[4] == "images"
        )

    async def __call__(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
    ) -> None:
        if not self.is_review_image_upload(scope):
            await self.app(scope, receive, send)
            return

        limit = (
            get_storage_settings().image_upload_max_bytes
            + MULTIPART_OVERHEAD_BYTES
        )

        content_length = dict(
            scope.get("headers", [])
        ).get(b"content-length")

        if content_length is not None:
            try:
                declared_length = int(content_length)
            except ValueError:
                declared_length = 0

            if declared_length > limit:
                await self.send_too_large(scope, receive, send)
                return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received

            message = await receive()

            if message["type"] == "http.request":
                received += len(message.get("body", b""))

                if received > limit:
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        detail="Image exceeds the upload size limit",
                    )

            return message

        await self.app(scope, limited_receive, send)

    @staticmethod
    async def send_too_large(
        scope: Scope,
        receive: Receive,
        send: Send,
    ) -> None:
        response = JSONResponse(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            content={
                "detail": "Image exceeds the upload size limit",
            },
        )

        await response(scope, receive, send)