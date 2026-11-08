import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

BASE_URL = "http://localhost:8001"


def request(method, path, body=None, token=None):
    headers = {}

    if body is not None:
        headers["Content-Type"] = "application/json"

    if token:
        headers["Authorization"] = f"Bearer {token}"

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
        return response.status, json.loads(response.read())


def main():
    email = f"auth-check-{uuid4().hex}@example.com"
    password = f"Test-{uuid4().hex}"

    registration = {
        "email": email,
        "password": password,
        "display_name": "Auth Check",
    }

    code, user = request(
        "POST",
        "/api/v1/auth/register",
        registration,
    )
    assert code == 201, (code, user)
    assert user["role"] == "user"
    assert "password_hash" not in user
    print("PASS: registration")

    code, body = request(
        "POST",
        "/api/v1/auth/register",
        registration,
    )
    assert code == 409, (code, body)
    print("PASS: duplicate email rejected")

    code, body = request(
        "POST",
        "/api/v1/auth/register",
        {**registration, "role": "admin"},
    )
    assert code == 422, (code, body)
    print("PASS: client cannot assign role")

    code, body = request(
        "POST",
        "/api/v1/auth/login",
        {"email": email, "password": "wrong-password"},
    )
    assert code == 401, (code, body)
    print("PASS: wrong password rejected")

    code, body = request(
        "POST",
        "/api/v1/auth/login",
        {"email": email.upper(), "password": password},
    )
    assert code == 200, (code, body)
    token = body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0
    print("PASS: login and email normalization")

    code, body = request("GET", "/api/v1/users/me")
    assert code == 401, (code, body)
    print("PASS: missing token rejected")

    code, body = request(
        "GET",
        "/api/v1/users/me",
        token="invalid-token",
    )
    assert code == 401, (code, body)
    print("PASS: invalid token rejected")

    code, body = request(
        "GET",
        "/api/v1/users/me",
        token=token,
    )
    assert code == 200, (code, body)
    assert body["id"] == user["id"]
    assert body["email"] == email
    assert "password_hash" not in body
    print("PASS: authenticated user response")
    print(f"Created local test user: {email}")
    print(f"Local test password: {password}")


if __name__ == "__main__":
    main()