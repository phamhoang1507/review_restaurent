import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mergePlacePages,
  parsePlaceFilters,
  readPlaceFilterInput,
  serializePlaceFilters,
  validatePlaceFilterInput,
  type PlaceFilterInput,
} from "../src/places/place-filters.ts";
import type { Place } from "../src/places/places-api.ts";

const emptyInput: PlaceFilterInput = {
  q: "",
  provinceId: "",
  districtId: "",
  minPrice: "",
  maxPrice: "",
  minRating: "",
};

const firstPlace: Place = {
  id: 1,
  district_id: 11,
  created_by: 2,
  name: "Local One",
  address: "1 Main Street",
  description: "First place",
  min_price: 10_000,
  max_price: 40_000,
  is_active: true,
  created_at: "2026-11-12T10:00:00Z",
  updated_at: "2026-11-12T10:00:00Z",
  rating: 4,
  review_count: 2,
};

describe("place filter URL state", () => {
  it("reads, normalizes, serializes, and parses filters", () => {
    const rawParams = new URLSearchParams({
      q: "  cà phê %_ ngon  ",
      province_id: "5",
      district_id: "11",
      min_price: "0",
      max_price: "150000",
      min_rating: "4.5",
    });

    const input = readPlaceFilterInput(rawParams);
    assert.equal(input.q, "  cà phê %_ ngon  ");

    const validated = validatePlaceFilterInput(input);
    assert.equal(validated.ok, true);

    if (!validated.ok) {
      return;
    }

    assert.deepEqual(validated.filters, {
      q: "cà phê %_ ngon",
      provinceId: 5,
      districtId: 11,
      minPrice: 0,
      maxPrice: 150_000,
      minRating: 4.5,
    });

    const serialized = serializePlaceFilters(validated.filters);
    assert.equal(serialized.get("q"), "cà phê %_ ngon");
    assert.equal(serialized.get("min_price"), "0");

    const parsedAgain = parsePlaceFilters(serialized);
    assert.deepEqual(parsedAgain, validated);
  });

  it("omits blank optional values", () => {
    const result = validatePlaceFilterInput({
      ...emptyInput,
      q: "   ",
    });

    assert.deepEqual(result, {
      ok: true,
      filters: {},
      errors: {},
    });
  });

  it("rejects invalid identifiers, prices, and ratings", () => {
    const result = validatePlaceFilterInput({
      ...emptyInput,
      provinceId: "1.5",
      districtId: "-2",
      minPrice: "3.14",
      maxPrice: "2147483648",
      minRating: "5.1",
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.provinceId);
    assert.ok(result.errors.districtId);
    assert.ok(result.errors.minPrice);
    assert.ok(result.errors.maxPrice);
    assert.ok(result.errors.minRating);
  });

  it("requires a province for a district", () => {
    const result = validatePlaceFilterInput({
      ...emptyInput,
      districtId: "11",
    });

    assert.equal(result.ok, false);
    assert.equal(
      result.errors.districtId,
      "Hãy chọn tỉnh/thành trước quận/huyện.",
    );
  });

  it("rejects a reversed price interval", () => {
    const result = validatePlaceFilterInput({
      ...emptyInput,
      minPrice: "200000",
      maxPrice: "50000",
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.minPrice);
    assert.equal(result.errors.minPrice, result.errors.maxPrice);
  });

  it("rejects an overlong query", () => {
    const result = validatePlaceFilterInput({
      ...emptyInput,
      q: "a".repeat(201),
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.q);
  });
});

describe("mergePlacePages", () => {
  it("appends in backend order and deduplicates place ids", () => {
    const secondPlace: Place = {
      ...firstPlace,
      id: 2,
      name: "Local Two",
    };

    const result = mergePlacePages(
      {
        items: [firstPlace],
        next_cursor: "old-cursor",
      },
      {
        items: [firstPlace, secondPlace],
        next_cursor: null,
      },
      true,
    );

    assert.deepEqual(
      result.items.map((place) => place.id),
      [1, 2],
    );
    assert.equal(result.next_cursor, null);
  });

  it("replaces old results when filters change", () => {
    const replacement = {
      ...firstPlace,
      id: 3,
      name: "Filtered Place",
    };

    const result = mergePlacePages(
      {
        items: [firstPlace],
        next_cursor: "old-cursor",
      },
      {
        items: [replacement, replacement],
        next_cursor: "new-cursor",
      },
      false,
    );

    assert.deepEqual(
      result.items.map((place) => place.id),
      [3],
    );
    assert.equal(result.next_cursor, "new-cursor");
  });
});
