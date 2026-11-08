import json
from http.cookies import SimpleCookie
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

BASE_URL = "http://localhost:8001"
TRUSTED_ORIGIN = "http://localhost:8001"
COOKIE_NAME = "localspot_refresh"


def request(
    method,
    path,
    body=None,
    token=None,
    cookie=None,
    origin=TRUSTED_ORIGIN,
):
    headers = {}

    if origin is not None:
        headers["Origin"] = origin

    if body is not None:
        headers["Content-Type"] = "application/json"

    if token:
        headers["Authorization"] = f"Bearer {token}"

    if cookie:
        headers["Cookie"] = f"{COOKIE_NAME}={cookie}"

    payload = json.dumps(body).encode() if body is not None else None

    req = Request(
        f"{BASE_URL}{path}",
        data=payload,
        headers=headers,
        method=method,
    )

    try:
        response = urlopen(req, timeout=30)
    except HTTPError as exc:
        response = exc

    with response:
        raw_body = response.read()
        try:
            result = json.loads(raw_body) if raw_body else None
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            content_type = response.headers.get("Content-Type", "")
            body_preview = raw_body.decode(
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

        cookies = SimpleCookie()
        for header in response.headers.get_all("Set-Cookie", []):
            cookies.load(header)

        return response.status, result, cookies


def refresh_cookie(cookies):
    assert COOKIE_NAME in cookies, "Refresh cookie missing"

    cookie = cookies[COOKIE_NAME]
    assert cookie["httponly"]
    assert cookie["samesite"].lower() == "lax"
    assert cookie["path"] == "/api/v1/auth"

    return cookie.value


def main():
    email = f"auth-check-{uuid4().hex}@example.com"
    password = f"Test-{uuid4().hex}"

    registration = {
        "email": email,
        "password": password,
        "display_name": "Auth Check",
    }

    code, user, _ = request(
        "POST",
        "/api/v1/auth/register",
        registration,
    )
    assert code == 201, (code, user)
    assert user["role"] == "user"
    assert "password_hash" not in user
    print("PASS: registration")

    code, body, _ = request(
        "POST",
        "/api/v1/auth/register",
        registration,
    )
    assert code == 409, (code, body)
    print("PASS: duplicate email rejected")

    code, body, _ = request(
        "POST",
        "/api/v1/auth/register",
        {**registration, "role": "admin"},
    )
    assert code == 422, (code, body)
    print("PASS: client cannot assign role")

    credentials = {"email": email, "password": password}

    code, body, _ = request(
        "POST",
        "/api/v1/auth/login",
        credentials,
        origin=None,
    )
    assert code == 403, (code, body)
    print("PASS: missing Origin rejected")

    code, body, _ = request(
        "POST",
        "/api/v1/auth/login",
        {"email": email, "password": "wrong-password"},
    )
    assert code == 401, (code, body)
    print("PASS: wrong password rejected")

    code, body, cookies = request(
        "POST",
        "/api/v1/auth/login",
        {"email": email.upper(), "password": password},
    )
    assert code == 200, (code, body)
    access_token = body["access_token"]
    original_refresh = refresh_cookie(cookies)
    print("PASS: login and refresh cookie")

    for token in (None, "invalid-token"):
        code, body, _ = request(
            "GET",
            "/api/v1/users/me",
            token=token,
        )
        assert code == 401, (code, body)
    print("PASS: missing and invalid access tokens rejected")

    code, body, _ = request(
        "GET",
        "/api/v1/users/me",
        token=access_token,
    )
    assert code == 200, (code, body)
    assert body["id"] == user["id"]
    assert "password_hash" not in body
    print("PASS: authenticated user response")

    code, body, _ = request(
        "POST",
        "/api/v1/auth/refresh",
        cookie=original_refresh,
        origin="https://untrusted.example",
    )
    assert code == 403, (code, body)
    print("PASS: untrusted refresh Origin rejected")

    code, body, cookies = request(
        "POST",
        "/api/v1/auth/refresh",
        cookie=original_refresh,
    )
    assert code == 200, (code, body)
    rotated_refresh = refresh_cookie(cookies)
    assert rotated_refresh != original_refresh
    print("PASS: refresh token rotated")

    code, body, _ = request(
        "POST",
        "/api/v1/auth/refresh",
        cookie=original_refresh,
    )
    assert code == 401, (code, body)

    code, body, _ = request(
        "POST",
        "/api/v1/auth/refresh",
        cookie=rotated_refresh,
    )
    assert code == 401, (code, body)
    print("PASS: token reuse revokes the family")

    code, body, cookies = request(
        "POST",
        "/api/v1/auth/login",
        credentials,
    )
    assert code == 200, (code, body)
    logout_refresh = refresh_cookie(cookies)
    access_before_logout = body["access_token"]

    code, body, cookies = request(
        "POST",
        "/api/v1/auth/logout",
        cookie=logout_refresh,
    )
    assert code == 204, (code, body)
    assert COOKIE_NAME in cookies
    assert cookies[COOKIE_NAME]["max-age"] == "0"

    code, body, _ = request(
        "POST",
        "/api/v1/auth/refresh",
        cookie=logout_refresh,
    )
    assert code == 401, (code, body)
    print("PASS: logout revokes refresh access and clears cookie")

    code, body, _ = request(
        "GET",
        "/api/v1/users/me",
        token=access_before_logout,
    )
    assert code == 200, (code, body)
    print("PASS: existing access token remains valid until expiry")

    print(f"Local test email: {email}")
    print(f"Local test password: {password}")


if __name__ == "__main__":
    main()