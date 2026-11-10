from io import BytesIO

from fastapi import HTTPException, UploadFile
from PIL import Image
from starlette.datastructures import Headers

from app.core.storage_config import get_storage_settings
from app.services.images import process_upload_image


def upload(
    data: bytes,
    content_type: str,
    filename: str,
) -> UploadFile:
    return UploadFile(
        BytesIO(data),
        filename=filename,
        headers=Headers({
            "content-type": content_type,
        }),
    )


def expect_error(
    expected_status: int,
    data: bytes,
    content_type: str,
    filename: str,
) -> None:
    try:
        process_upload_image(
            upload(
                data,
                content_type,
                filename,
            )
        )
    except HTTPException as exc:
        assert (
            exc.status_code
            == expected_status
        ), exc
    else:
        raise AssertionError(
            f"Expected HTTP {expected_status}"
        )


def main() -> None:
    settings = get_storage_settings()

    source = Image.new(
        "RGB",
        (3200, 1200),
        (25, 110, 180),
    )

    exif = Image.Exif()
    exif[274] = 6
    exif[315] = "must-not-survive"

    jpeg = BytesIO()

    source.save(
        jpeg,
        format="JPEG",
        quality=90,
        exif=exif,
    )

    source.close()

    result = process_upload_image(
        upload(
            jpeg.getvalue(),
            "image/jpeg",
            "oriented.jpg",
        )
    )

    assert result.mime_type == "image/webp"

    expected_height = min(
        3200,
        settings.image_max_dimension,
    )

    expected_width = round(
        1200 * expected_height / 3200
    )

    assert result.width == expected_width
    assert result.height == expected_height

    with Image.open(
        BytesIO(result.data)
    ) as converted:
        assert converted.format == "WEBP"
        assert not converted.getexif()

    print(
        "PASS: EXIF orientation, resize, "
        "WebP conversion and metadata stripping"
    )

    png = BytesIO()

    image = Image.new(
        "RGBA",
        (40, 30),
        (255, 0, 0, 100),
    )

    image.save(
        png,
        format="PNG",
    )

    image.close()

    alpha_result = process_upload_image(
        upload(
            png.getvalue(),
            "image/png",
            "alpha.png",
        )
    )

    with Image.open(
        BytesIO(alpha_result.data)
    ) as converted:
        assert converted.mode == "RGBA"

    print(
        "PASS: transparent PNG remains transparent"
    )

    expect_error(
        422,
        png.getvalue(),
        "image/jpeg",
        "mismatch.jpg",
    )

    expect_error(
        422,
        b"not-an-image",
        "image/png",
        "broken.png",
    )

    expect_error(
        422,
        b"",
        "image/png",
        "empty.png",
    )

    expect_error(
        415,
        png.getvalue(),
        "image/gif",
        "unsupported.gif",
    )

    print(
        "PASS: invalid image inputs rejected"
    )

    frame_one = Image.new(
        "RGB",
        (20, 20),
        "red",
    )

    frame_two = Image.new(
        "RGB",
        (20, 20),
        "blue",
    )

    animated = BytesIO()

    frame_one.save(
        animated,
        format="WEBP",
        save_all=True,
        append_images=[frame_two],
        duration=100,
        loop=0,
    )

    frame_one.close()
    frame_two.close()

    expect_error(
        422,
        animated.getvalue(),
        "image/webp",
        "animated.webp",
    )

    print("PASS: animated WebP rejected")

    maximum = settings.image_upload_max_bytes

    expect_error(
        413,
        b"x" * (maximum + 1),
        "image/png",
        "too-large.png",
    )

    print("PASS: file byte limit enforced")


if __name__ == "__main__":
    main()