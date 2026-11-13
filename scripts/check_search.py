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


def find_places(**parameters):
    return require_response(
        200,
        "GET",
        f"/api/v1/places?{urlencode(parameters)}",
    )


def item_ids(page):
    return {item["id"] for item in page["items"]}


def find_province_id(district_id):
    provinces = require_response(
        200,
        "GET",
        "/api/v1/locations/provinces?limit=200",
    )

    for province in provinces:
        districts = require_response(
            200,
            "GET",
            f"/api/v1/locations/provinces/{province['id']}/districts?limit=200",
        )

        if any(district["id"] == district_id for district in districts):
            return province["id"]

    raise AssertionError(
        f"District {district_id} was not found in any province"
    )


def main():
    email = input("Admin email: ").strip()
    password = getpass("Admin password: ")
    district_id = int(input("Demo district ID: "))
    province_id = find_province_id(district_id)

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

    marker = f"SearchCheck-{uuid4().hex}"
    definitions = [
        (f"{marker} 100X Cafe", 20000, 50000),
        (f"{marker} Bistro", 60000, 100000),
        (f"{marker} 100% Local", 10000, 30000),
    ]

    places = []

    for name, min_price, max_price in definitions:
        place = require_response(
            201,
            "POST",
            "/api/v1/places",
            {
                "district_id": district_id,
                "name": name,
                "address": "Local search test",
                "description": "Search integration fixture",
                "min_price": min_price,
                "max_price": max_price,
            },
            token=admin_token,
        )
        places.append(place)

    place_a, place_b, place_c = places

    suffix = uuid4().hex
    user_email = f"search-check-{suffix}@example.com"
    user_password = f"Test-{suffix}"

    require_response(
        201,
        "POST",
        "/api/v1/auth/register",
        {
            "email": user_email,
            "password": user_password,
            "display_name": "Search Check",
        },
    )

    login = require_response(
        200,
        "POST",
        "/api/v1/auth/login",
        {"email": user_email, "password": user_password},
    )
    user_token = login["access_token"]

    for place, score in ((place_a, 5), (place_b, 3)):
        require_response(
            201,
            "POST",
            f"/api/v1/places/{place['id']}/reviews",
            {
                "content": "Review for search filter verification.",
                "space_rating": score,
                "food_drink_rating": score,
                "value_rating": score,
            },
            token=user_token,
        )

    expected_ids = {place["id"] for place in places}

    result = find_places(
        q=marker,
        province_id=province_id,
        district_id=district_id,
    )
    assert item_ids(result) == expected_ids, result
    print("PASS: name, province and district filters")

    result = find_places(q=marker, province_id=province_id)
    assert item_ids(result) == expected_ids, result
    print("PASS: province filter")

    result = find_places(q=f"{marker.upper()} 100X CAFE")
    assert item_ids(result) == {place_a["id"]}, result
    print("PASS: case-insensitive search")

    result = find_places(q=f"{marker} 100%")
    assert item_ids(result) == {place_c["id"]}, result
    print("PASS: percent is treated as a literal character")

    result = find_places(q=marker, min_price=55000, max_price=70000)
    assert item_ids(result) == {place_b["id"]}, result
    print("PASS: price overlap filter")

    result = find_places(q=marker, min_rating=4)
    assert item_ids(result) == {place_a["id"]}, result
    print("PASS: minimum rating filter")

    result = find_places(q=marker, min_rating=0)
    assert item_ids(result) == {place_a["id"], place_b["id"]}, result
    print("PASS: unrated places excluded by rating filter")

    seen = []
    cursor = None

    for _ in range(4):
        parameters = {"q": marker, "limit": 1}

        if cursor:
            parameters["cursor"] = cursor

        page = find_places(**parameters)
        seen.extend(item["id"] for item in page["items"])
        cursor = page["next_cursor"]

        if cursor is None:
            break

    assert len(seen) == 3 and set(seen) == expected_ids, seen
    assert cursor is None
    print("PASS: cursor pagination preserves filters without duplicates")

    result = find_places(
        q=marker,
        min_price=55000,
        max_price=70000,
        min_rating=4,
    )
    assert result["items"] == [], result
    print("PASS: combined filters")

    for parameters in (
        {"province_id": 0},
        {"min_rating": 6},
        {"q": "   "},
        {"min_price": 80000, "max_price": 10000},
    ):
        require_response(
            422,
            "GET",
            f"/api/v1/places?{urlencode(parameters)}",
        )
    print("PASS: invalid filters rejected")

    for place in places:
        require_response(
            204,
            "DELETE",
            f"/api/v1/places/{place['id']}",
            token=admin_token,
        )

    result = find_places(q=marker)
    assert result["items"] == [], result
    print("PASS: inactive places excluded")

    print("Retained three inactive places, two reviews and one test user.")


if __name__ == "__main__":
    main()
