from getpass import getpass
from urllib.parse import urlencode
from uuid import uuid4

from check_auth import request


def require_response(expected, method, path, body=None, token=None):
    code, result, _ = request(
        method,
        path,
        body,
        token=token,
    )
    assert code == expected, (method, path, code, result)
    return result


def create_test_user(label):
    suffix = uuid4().hex
    email = f"reviews-{label}-{suffix}@example.com"
    password = f"Test-{suffix}"

    require_response(
        201,
        "POST",
        "/api/v1/auth/register",
        {
            "email": email,
            "password": password,
            "display_name": f"Review User {label}",
        },
    )

    login = require_response(
        200,
        "POST",
        "/api/v1/auth/login",
        {"email": email, "password": password},
    )

    return login["access_token"]


def check_rating(place_id, rating, count):
    place = require_response(
        200,
        "GET",
        f"/api/v1/places/{place_id}",
    )
    assert place["rating"] == rating, place
    assert place["review_count"] == count, place


def main():
    email = input("Admin email: ").strip()
    password = getpass("Admin password: ")
    district_id = int(input("Demo district ID: "))

    login = require_response(
        200,
        "POST",
        "/api/v1/auth/login",
        {"email": email, "password": password},
    )
    admin_token = login["access_token"]

    admin = require_response(
        200,
        "GET",
        "/api/v1/users/me",
        token=admin_token,
    )
    assert admin["role"] == "admin"

    place = require_response(
        201,
        "POST",
        "/api/v1/places",
        {
            "district_id": district_id,
            "name": f"Review Check {uuid4().hex}",
            "address": "Local test address",
            "description": "Temporary review verification place",
            "min_price": 20000,
            "max_price": 80000,
        },
        token=admin_token,
    )
    place_id = place["id"]

    check_rating(place_id, None, 0)
    print("PASS: unrated place returns null and zero")

    token_a = create_test_user("a")
    token_b = create_test_user("b")

    payload_a = {
        "content": "Good local place for testing reviews.",
        "space_rating": 4,
        "food_drink_rating": 5,
        "value_rating": 3,
    }

    review_path = f"/api/v1/places/{place_id}/reviews"

    require_response(401, "POST", review_path, payload_a)
    print("PASS: anonymous review creation rejected")

    review_a = require_response(
        201,
        "POST",
        review_path,
        payload_a,
        token=token_a,
    )
    assert review_a["overall_rating"] == 4.0

    require_response(
        409,
        "POST",
        review_path,
        payload_a,
        token=token_a,
    )
    print("PASS: creation and duplicate protection")

    require_response(
        422,
        "POST",
        review_path,
        {**payload_a, "space_rating": 6},
        token=token_b,
    )
    print("PASS: invalid rating rejected")

    review_b = require_response(
        201,
        "POST",
        review_path,
        {
            "content": "Another review for aggregate verification.",
            "space_rating": 1,
            "food_drink_rating": 2,
            "value_rating": 3,
        },
        token=token_b,
    )

    check_rating(place_id, 3.0, 2)
    print("PASS: two-review aggregate")

    page_one = require_response(
        200,
        "GET",
        f"{review_path}?limit=1",
    )
    assert len(page_one["items"]) == 1
    assert page_one["next_cursor"]

    page_two = require_response(
        200,
        "GET",
        f"{review_path}?{urlencode({'limit': 1, 'cursor': page_one['next_cursor']})}",
    )
    assert len(page_two["items"]) == 1
    assert page_one["items"][0]["id"] != page_two["items"][0]["id"]
    assert page_two["next_cursor"] is None
    print("PASS: review cursor pagination")

    review_a_path = f"/api/v1/reviews/{review_a['id']}"

    require_response(
        403,
        "PATCH",
        review_a_path,
        {"space_rating": 5},
        token=token_b,
    )
    require_response(
        403,
        "DELETE",
        review_a_path,
        token=token_b,
    )
    print("PASS: another user cannot edit or delete")

    require_response(
        200,
        "PATCH",
        review_a_path,
        {
            "space_rating": 5,
            "food_drink_rating": 5,
            "value_rating": 5,
        },
        token=token_a,
    )
    check_rating(place_id, 3.5, 2)
    print("PASS: owner update recalculates aggregate")

    require_response(
        204,
        "DELETE",
        f"/api/v1/reviews/{review_b['id']}",
        token=token_b,
    )
    check_rating(place_id, 5.0, 1)
    print("PASS: owner deletion recalculates aggregate")

    require_response(
        204,
        "DELETE",
        review_a_path,
        token=admin_token,
    )
    check_rating(place_id, None, 0)
    print("PASS: Admin moderation and empty aggregate")

    require_response(
        204,
        "DELETE",
        f"/api/v1/places/{place_id}",
        token=admin_token,
    )
    require_response(404, "GET", review_path)
    print("PASS: inactive place reviews hidden")

    print(f"Retained inactive test place ID: {place_id}")
    print("Two local test users were retained.")


if __name__ == "__main__":
    main()