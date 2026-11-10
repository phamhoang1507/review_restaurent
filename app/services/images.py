import warnings
from dataclasses import dataclass
from io import BytesIO

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError, features

from app.core.storage_config import get_storage_settings

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
}

READ_CHUNK_SIZE = 64 * 1024


@dataclass(frozen=True, slots=True)
class ProcessedImage:
    data: bytes
    width: int
    height: int
    mime_type: str = "image/webp"


def read_limited_upload(upload: UploadFile) -> tuple[bytes, str]:
    declared_type = (upload.content_type or "").split(";", 1)[0].lower()

    if declared_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPEG, PNG and WebP images are supported",
        )

    maximum = get_storage_settings().image_upload_max_bytes
    upload.file.seek(0)

    chunks: list[bytes] = []
    total = 0

    while chunk := upload.file.read(READ_CHUNK_SIZE):
        total += len(chunk)

        if total > maximum:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Image exceeds the upload size limit",
            )

        chunks.append(chunk)

    if total == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Image file is empty",
        )

    return b"".join(chunks), declared_type


def process_upload_image(upload: UploadFile) -> ProcessedImage:
    settings = get_storage_settings()
    raw, declared_type = read_limited_upload(upload)

    if not features.check("webp"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Image processing is temporarily unavailable",
        )

    try:
        with warnings.catch_warnings():
            warnings.simplefilter(
                "error",
                Image.DecompressionBombWarning,
            )

            with Image.open(BytesIO(raw)) as probe:
                actual_format = probe.format

                if actual_format != ALLOWED_IMAGE_TYPES[declared_type]:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail="Image content does not match its media type",
                    )

                if getattr(probe, "n_frames", 1) != 1:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail="Animated images are not supported",
                    )

                width, height = probe.size

                if width <= 0 or height <= 0:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail="Image dimensions are invalid",
                    )

                if width * height > settings.image_max_pixels:
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        detail="Image exceeds the pixel limit",
                    )

                probe.verify()

            with Image.open(BytesIO(raw)) as source:
                source.load()
                oriented = ImageOps.exif_transpose(source)

                try:
                    width, height = oriented.size

                    if width * height > settings.image_max_pixels:
                        raise HTTPException(
                            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                            detail="Image exceeds the pixel limit",
                        )

                    has_alpha = (
                        "A" in oriented.getbands()
                        or (
                            oriented.mode == "P"
                            and "transparency" in oriented.info
                        )
                    )

                    converted = oriented.convert(
                        "RGBA" if has_alpha else "RGB"
                    )

                    try:
                        converted.thumbnail(
                            (
                                settings.image_max_dimension,
                                settings.image_max_dimension,
                            ),
                            Image.Resampling.LANCZOS,
                            reducing_gap=3.0,
                        )

                        output = BytesIO()

                        converted.save(
                            output,
                            format="WEBP",
                            quality=settings.image_webp_quality,
                            method=6,
                        )

                        return ProcessedImage(
                            data=output.getvalue(),
                            width=converted.width,
                            height=converted.height,
                        )
                    finally:
                        converted.close()
                finally:
                    if oriented is not source:
                        oriented.close()
    except HTTPException:
        raise
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
        SyntaxError,
        ValueError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Image is invalid or corrupted",
        ) from exc