import json
import struct
import zlib
from concurrent.futures import ThreadPoolExecutor
from getpass import getpass
from http.client import HTTPConnection
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from uuid import uuid4

from check_auth import BASE_URL, TRUSTED_ORIGIN


def send(method, path, *, data=None, content_type=None, token=None):
    headers = {"Origin": TRUSTED_ORIGIN}

    if content_type:
        headers["Content-Type"] = content_type

    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = Request(
        f"{BASE_URL}{path}",
        data=data,
        headers=headers,
        method=method,
    )

    try:
        response = urlopen(request, timeout=60)
    except HTTPError as exc:
        response = exc

    with response:
        raw = response.read()
        result = None

        if raw:
            try:
                result = json.loads(raw)
            except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                content_type = response.headers.get("Content-Type", "")
                body_preview = raw.decode(
                    "utf-8",
                    errors="replace",
                )[:500]
                raise RuntimeError(
                    f"{method} {path} returned HTTP {response.status}; "
                    f"Content-Type={content_type!r}; "
                    f"non-JSON body={body_preview!r}"
                ) from exc

        if response.status == 429:
            retry_after = response.headers.get("Retry-After", "unknown")
            raise RuntimeError(
                f"{method} {path} was rate limited. "
                f"Retry-After={retry_after} seconds. "
                "Wait before restarting the test script."
            )

        return response.status, result, response.headers


def send_json(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None

    return send(
        method,
        path,
        data=data,
        content_type="application/json" if body is not None else None,
        token=token,
    )


def require_json(expected, method, path, body=None, token=None):
    code, result, headers = send_json(
        method,
        path,
        body,
        token,
    )
    assert code == expected, (method, path, code, result)

    return result, headers


def png_chunk(name: bytes, data: bytes) -> bytes:
    checksum = zlib.crc32(name)
    checksum = zlib.crc32(data, checksum)

    return (
        struct.pack(">I", len(data))
        + name
        + data
        + struct.pack(">I", checksum)
    )


def make_png(red: int, green: int, blue: int) -> bytes:
    width = 32
    height = 24
    scanline = b"\x00" + bytes((red, green, blue)) * width
    pixels = scanline * height

    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(
            b"IHDR",
            struct.pack(
                ">IIBBBBB",
                width,
                height,
                8,
                2,
                0,
                0,
                0,
            ),
        )
        + png_chunk(
            b"IDAT",
            zlib.compress(pixels, level=9),
        )
        + png_chunk(b"IEND", b"")
    )


def multipart(
    image: bytes,
    content_type: str = "image/png",
):
    boundary = f"localspot-{uuid4().hex}"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; '
        'name="file"; filename="check.png"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode() + image + (
        f"\r\n--{boundary}--\r\n"
    ).encode()

    return (
        body,
        f"multipart/form-data; boundary={boundary}",
    )


def upload_image(
    review_id,
    image,
    token=None,
    content_type="image/png",
):
    body, multipart_type = multipart(
        image,
        content_type,
    )

    return send(
        "POST",
        f"/api/v1/reviews/{review_id}/images",
        data=body,
        content_type=multipart_type,
        token=token,
    )


def create_user(label):
    suffix = uuid4().hex
    email = f"image-{label}-{suffix}@example.com"
    password = f"Test-{suffix}"

    require_json(
        201,
        "POST",
        "/api/v1/auth/register",
        {
            "email": email,
            "password": password,
            "display_name": f"Image User {label}",
        },
    )

    login, _ = require_json(
        200,
        "POST",
        "/api/v1/auth/login",
        {
            "email": email,
            "password": password,
        },
    )

    return login["access_token"]


def fetch_signed_url(url):
    try:
        response = urlopen(url, timeout=30)
    except HTTPError as exc:
        response = exc

    with response:
        return (
            response.status,
            response.read(),
            response.headers,
        )


def check_declared_body_limit():
    target = urlsplit(BASE_URL)
    connection = HTTPConnection(
        target.hostname,
        target.port,
        timeout=30,
    )

    connection.putrequest(
        "POST",
        "/api/v1/reviews/not-an-id/images",
    )
    connection.putheader("Origin", TRUSTED_ORIGIN)
    connection.putheader(
        "Content-Type",
        "multipart/form-data; boundary=x",
    )
    connection.putheader(
        "Content-Length",
        str(64 * 1024 * 1024),
    )
    connection.endheaders()

    response = connection.getresponse()
    raw = response.read()
    connection.close()

    return response.status, json.loads(raw)


def main():
    code, body = check_declared_body_limit()
    assert code == 413, (code, body)
    print("PASS: request body limit runs before route parsing")

    admin_email = input("Admin email: ").strip()
    admin_password = getpass("Admin password: ")
    district_id = int(input("Demo district ID: "))

    login, _ = require_json(
        200,
        "POST",
        "/api/v1/auth/login",
        {
            "email": admin_email,
            "password": admin_password,
        },
    )
    admin_token = login["access_token"]

    place, _ = require_json(
        201,
        "POST",
        "/api/v1/places",
        {
            "district_id": district_id,
            "name": f"Image Check {uuid4().hex}",
            "address": "Temporary image verification address",
            "description": (
                "Temporary place for review image verification"
            ),
            "min_price": 20000,
            "max_price": 70000,
        },
        admin_token,
    )

    owner_token = create_user("owner")
    other_token = create_user("other")

    review, _ = require_json(
        201,
        "POST",
        f"/api/v1/places/{place['id']}/reviews",
        {
            "content": (
                "Review used to verify secure image upload behavior."
            ),
            "space_rating": 5,
            "food_drink_rating": 4,
            "value_rating": 4,
        },
        owner_token,
    )

    review_id = review["id"]
    sample = make_png(20, 100, 180)

    assert upload_image(
        review_id,
        sample,
    )[0] == 401

    assert upload_image(
        review_id,
        sample,
        other_token,
    )[0] == 403

    print("PASS: image upload authorization")

    assert upload_image(
        review_id,
        sample,
        owner_token,
        "image/jpeg",
    )[0] == 422

    assert upload_image(
        review_id,
        b"broken",
        owner_token,
    )[0] == 422

    print("PASS: media type mismatch and corrupt image rejected")

    colors = [
        (20 + index * 20, 80, 180)
        for index in range(6)
    ]

    with ThreadPoolExecutor(max_workers=6) as executor:
        results = list(
            executor.map(
                lambda color: upload_image(
                    review_id,
                    make_png(*color),
                    owner_token,
                ),
                colors,
            )
        )

    statuses = sorted(
        result[0]
        for result in results
    )
    assert statuses == [
        201,
        201,
        201,
        201,
        201,
        409,
    ], statuses

    uploaded = [
        result[1]
        for result in results
        if result[0] == 201
    ]

    assert sorted(
        image["position"]
        for image in uploaded
    ) == [0, 1, 2, 3, 4]

    assert all(
        "storage_key" not in image
        for image in uploaded
    )

    assert all(
        result[2].get("Cache-Control") == "no-store"
        for result in results
        if result[0] == 201
    )

    print("PASS: concurrent maximum-five invariant")

    listed, headers = require_json(
        200,
        "GET",
        f"/api/v1/reviews/{review_id}/images",
    )

    assert len(listed) == 5
    assert headers.get("Cache-Control") == "no-store"

    signed_urls = [
        image["url"]
        for image in listed
    ]

    code, raw, headers = fetch_signed_url(
        signed_urls[0]
    )

    assert code == 200
    assert headers.get_content_type() == "image/webp"
    assert raw[:4] == b"RIFF"
    assert b"WEBP" in raw[:16]

    print(
        "PASS: private object is readable "
        "through a signed WebP URL"
    )

    reviews, headers = require_json(
        200,
        "GET",
        f"/api/v1/places/{place['id']}/reviews",
    )

    assert len(reviews["items"][0]["images"]) == 5
    assert headers.get("Cache-Control") == "no-store"

    updated, headers = require_json(
        200,
        "PATCH",
        f"/api/v1/reviews/{review_id}",
        {"value_rating": 5},
        owner_token,
    )

    assert len(updated["images"]) == 5
    assert headers.get("Cache-Control") == "no-store"

    print(
        "PASS: review responses bulk-load images "
        "without caching signed URLs"
    )

    code, _, _ = send_json(
        "DELETE",
        f"/api/v1/review-images/{listed[0]['id']}",
        token=other_token,
    )
    assert code == 403

    for image in listed:
        require_json(
            204,
            "DELETE",
            f"/api/v1/review-images/{image['id']}",
            token=owner_token,
        )

    for url in signed_urls:
        assert fetch_signed_url(url)[0] == 404

    print(
        "PASS: owner deletion removes metadata "
        "and stored objects"
    )

    code, replacement, _ = upload_image(
        review_id,
        sample,
        owner_token,
    )
    assert code == 201, (code, replacement)

    replacement_url = replacement["url"]

    require_json(
        204,
        "DELETE",
        f"/api/v1/reviews/{review_id}",
        token=admin_token,
    )

    assert fetch_signed_url(
        replacement_url
    )[0] == 404

    print(
        "PASS: review cascade queues and removes "
        "every stored object"
    )

    require_json(
        204,
        "DELETE",
        f"/api/v1/places/{place['id']}",
        token=admin_token,
    )

    print(
        f"Retained inactive test place ID: {place['id']}"
    )
    print("Two local test users were retained.")


if __name__ == "__main__":
    main()
