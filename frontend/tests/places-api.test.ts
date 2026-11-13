import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PlacesClient,
  buildPlacesSearchParams,
  type Place,
} from "../src/places/places-api.ts";
import {
  ApiContractError,
  ApiError,
  type Fetcher,
} from "../src/lib/auth-client.ts";

const BASE_URL = "http://localhost:8001";

const testPlace: Place = {
  id: 12,
  district_id: 7,
  created_by: 2,
  name: "Cà phê Local",
  address: "12 Đường Bình Minh",
  description: "Không gian yên tĩnh.",
  min_price: 0,
  max_price: 85_000,
  is_active: true,
  created_at: "2026-11-12T08:00:00Z",
  updated_at: "2026-11-12T09:00:00+00:00",
  rating: null,
  review_count: 0,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function asRequest(input: RequestInfo | URL): Request {
  return input instanceof Request
    ? input
    : new Request(input);
}

describe("PlacesClient", () => {
  it("serializes filters and an opaque cursor without losing zeroes", async () => {
    let capturedRequest: Request | undefined;

    const fetcher: Fetcher = async (input) => {
      capturedRequest = asRequest(input);

      return jsonResponse({
        items: [testPlace],
        next_cursor: "next+/=_cursor",
      });
    };

    const client = new PlacesClient({
      baseUrl: `${BASE_URL}/`,
      fetcher,
    });

    const result = await client.listPlaces(
      {
        q: "  Cà phê 100%_ ngon \\  ",
        provinceId: 3,
        districtId: 7,
        minPrice: 0,
        maxPrice: 0,
        minRating: 0,
      },
      {
        cursor: "eyJpZCI6MTI+/=_-",
        limit: 24,
      },
    );

    assert.deepEqual(result.items, [testPlace]);
    assert.ok(capturedRequest);

    const url = new URL(capturedRequest.url);
    assert.equal(url.pathname, "/api/v1/places");
    assert.equal(url.searchParams.get("q"), "Cà phê 100%_ ngon \\");
    assert.equal(url.searchParams.get("province_id"), "3");
    assert.equal(url.searchParams.get("district_id"), "7");
    assert.equal(url.searchParams.get("min_price"), "0");
    assert.equal(url.searchParams.get("max_price"), "0");
    assert.equal(url.searchParams.get("min_rating"), "0");
    assert.equal(url.searchParams.get("limit"), "24");
    assert.equal(url.searchParams.get("cursor"), "eyJpZCI6MTI+/=_-");
    assert.equal(capturedRequest.method, "GET");
    assert.equal(capturedRequest.credentials, "omit");
    assert.equal(capturedRequest.cache, "no-store");
    assert.equal(capturedRequest.headers.get("Accept"), "application/json");
  });

  it("accepts a rated place and a final null cursor", async () => {
    const ratedPlace = {
      ...testPlace,
      rating: 4.25,
      review_count: 18,
    };

    const client = new PlacesClient({
      baseUrl: BASE_URL,
      fetcher: async () =>
        jsonResponse({
          items: [ratedPlace],
          next_cursor: null,
        }),
    });

    assert.deepEqual(await client.listPlaces(), {
      items: [ratedPlace],
      next_cursor: null,
    });
  });

  it("rejects invalid place response contracts", async (context) => {
    const invalidValues: Array<readonly [string, unknown]> = [
      ["unsafe id", { ...testPlace, id: Number.MAX_SAFE_INTEGER + 1 }],
      ["negative price", { ...testPlace, min_price: -1 }],
      ["reversed price", { ...testPlace, min_price: 90_000 }],
      ["rating above five", { ...testPlace, rating: 5.1 }],
      ["negative review count", { ...testPlace, review_count: -1 }],
      ["timestamp without timezone", { ...testPlace, created_at: "2026-11-12" }],
    ];

    for (const [name, place] of invalidValues) {
      await context.test(name, async () => {
        const client = new PlacesClient({
          baseUrl: BASE_URL,
          fetcher: async () =>
            jsonResponse({ items: [place], next_cursor: null }),
        });

        await assert.rejects(
          client.listPlaces(),
          ApiContractError,
        );
      });
    }

    const invalidCursors = ["", "x".repeat(513), 42];

    for (const cursor of invalidCursors) {
      await context.test(`invalid cursor ${String(cursor).slice(0, 8)}`, async () => {
        const client = new PlacesClient({
          baseUrl: BASE_URL,
          fetcher: async () =>
            jsonResponse({ items: [], next_cursor: cursor }),
        });

        await assert.rejects(
          client.listPlaces(),
          ApiContractError,
        );
      });
    }
  });

  it("validates district ownership against the requested province", async () => {
    const client = new PlacesClient({
      baseUrl: BASE_URL,
      fetcher: async () =>
        jsonResponse([
          { id: 8, province_id: 99, name: "Sai tỉnh" },
        ]),
    });

    await assert.rejects(
      client.listDistricts(3),
      ApiContractError,
    );
  });

  it("maps HTTP errors and keeps the backend detail", async () => {
    const client = new PlacesClient({
      baseUrl: BASE_URL,
      fetcher: async () =>
        jsonResponse(
          { detail: "min_price must not exceed max_price" },
          422,
        ),
    });

    await assert.rejects(
      client.listPlaces(),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 422);
        assert.equal(
          error.detail,
          "min_price must not exceed max_price",
        );

        return true;
      },
    );
  });

  it("propagates abort reasons unchanged", async () => {
    const reason = new DOMException("superseded", "AbortError");
    const client = new PlacesClient({
      baseUrl: BASE_URL,
      fetcher: async () => {
        throw reason;
      },
    });

    await assert.rejects(
      client.listPlaces(),
      (error: unknown) => error === reason,
    );
  });
});

describe("buildPlacesSearchParams", () => {
  it("omits blank queries", () => {
    assert.equal(
      buildPlacesSearchParams({ q: "   " }).toString(),
      "",
    );
  });

  it("rejects invalid numeric bounds before a request", () => {
    assert.throws(
      () => buildPlacesSearchParams({ districtId: -1 }),
      RangeError,
    );
    assert.throws(
      () => buildPlacesSearchParams({ minPrice: 2, maxPrice: 1 }),
      RangeError,
    );
    assert.throws(
      () => buildPlacesSearchParams({ minRating: 5.1 }),
      RangeError,
    );
    assert.throws(
      () => buildPlacesSearchParams({}, { cursor: "" }),
      RangeError,
    );
  });
});
