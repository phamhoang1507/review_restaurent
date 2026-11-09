from getpass import getpass
from uuid import uuid4

from check_auth import request


def main():
    admin_email = input("Admin email: ").strip()
    admin_password = getpass("Admin password: ")
    district_id = int(input("Demo district ID: "))

    code, body, _ = request(
        "POST",
        "/api/v1/auth/login",
        {
            "email": admin_email,
            "password": admin_password,
        },
    )
    assert code == 200, (code, body)
    admin_token = body["access_token"]

    code, user, _ = request(
        "GET",
        "/api/v1/users/me",
        token=admin_token,
    )
    assert code == 200 and user["role"] == "admin", (code, user)
    print("PASS: Admin login")

    suffix = uuid4().hex
    user_email = f"places-check-{suffix}@example.com"
    user_password = f"Test-{suffix}"

    code, body, _ = request(
        "POST",
        "/api/v1/auth/register",
        {
            "email": user_email,
            "password": user_password,
            "display_name": "Places Check",
        },
    )
    assert code == 201, (code, body)

    code, body, _ = request(
        "POST",
        "/api/v1/auth/login",
        {
            "email": user_email,
            "password": user_password,
        },
    )
    assert code == 200, (code, body)
    user_token = body["access_token"]

    payload = {
        "district_id": district_id,
        "name": f"Places Check {suffix}",
        "address": "Local development fixture",
        "description": "Created by the Places verification script",
        "min_price": 20000,
        "max_price": 80000,
    }

    code, body, _ = request("POST", "/api/v1/places", payload)
    assert code == 401, (code, body)
    print("PASS: anonymous creation rejected")

    code, body, _ = request(
        "POST",
        "/api/v1/places",
        payload,
        token=user_token,
    )
    assert code == 403, (code, body)
    print("PASS: regular user creation rejected")

    code, place, _ = request(
        "POST",
        "/api/v1/places",
        payload,
        token=admin_token,
    )
    assert code == 201, (code, place)
    place_id = place["id"]
    assert place["created_by"] == user["id"]
    print("PASS: Admin creates place")

    code, body, _ = request(
        "GET",
        f"/api/v1/places/{place_id}",
    )
    assert code == 200 and body["id"] == place_id, (code, body)
    print("PASS: public place detail")

    code, body, _ = request(
        "GET",
        f"/api/v1/places?district_id={district_id}&limit=1",
    )
    assert code == 200, (code, body)
    assert len(body["items"]) == 1
    assert body["items"][0]["id"] == place_id
    print("PASS: district filter and bounded list")

    code, body, _ = request(
        "PATCH",
        f"/api/v1/places/{place_id}",
        {"max_price": 10000},
        token=admin_token,
    )
    assert code == 422, (code, body)
    print("PASS: partial update cannot invalidate price range")

    code, body, _ = request(
        "PATCH",
        f"/api/v1/places/{place_id}",
        {"name": f"Updated {suffix}", "max_price": 90000},
        token=admin_token,
    )
    assert code == 200 and body["max_price"] == 90000, (code, body)
    print("PASS: Admin updates place")

    code, body, _ = request(
        "GET",
        "/api/v1/places?cursor=invalid-cursor",
    )
    assert code == 422, (code, body)
    print("PASS: invalid cursor rejected")

    code, body, _ = request(
        "DELETE",
        f"/api/v1/places/{place_id}",
        token=user_token,
    )
    assert code == 403, (code, body)
    print("PASS: regular user deletion rejected")

    code, body, _ = request(
        "DELETE",
        f"/api/v1/places/{place_id}",
        token=admin_token,
    )
    assert code == 204, (code, body)

    code, body, _ = request(
        "GET",
        f"/api/v1/places/{place_id}",
    )
    assert code == 404, (code, body)
    print("PASS: deactivated place hidden from public")

    code, body, _ = request(
        "PATCH",
        f"/api/v1/places/{place_id}",
        {"is_active": True},
        token=admin_token,
    )
    assert code == 200 and body["is_active"] is True, (code, body)

    code, body, _ = request(
        "GET",
        f"/api/v1/places/{place_id}",
    )
    assert code == 200, (code, body)
    print("PASS: Admin restores place")

    code, body, _ = request(
        "DELETE",
        f"/api/v1/places/{place_id}",
        token=admin_token,
    )
    assert code == 204, (code, body)

    print(f"Retained inactive test place ID: {place_id}")
    print(f"Retained local test user: {user_email}")


if __name__ == "__main__":
    main()