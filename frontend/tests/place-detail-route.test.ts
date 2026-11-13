import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parsePlaceId,
  placeListReturnTo,
} from "../src/places/place-detail-route.ts";

describe("parsePlaceId", () => {
  it("accepts a positive safe integer route parameter", () => {
    assert.equal(parsePlaceId("42"), 42);
    assert.equal(parsePlaceId(String(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
  });

  it("rejects malformed and unsafe route parameters", () => {
    for (const value of [
      undefined,
      "",
      "0",
      "-1",
      "1.5",
      "01",
      "+1",
      "abc",
      String(Number.MAX_SAFE_INTEGER + 1),
    ]) {
      assert.equal(parsePlaceId(value), null);
    }
  });
});

describe("placeListReturnTo", () => {
  it("preserves only a Places list path", () => {
    assert.equal(
      placeListReturnTo({
        returnTo: "/places?q=cafe&province_id=1",
      }),
      "/places?q=cafe&province_id=1",
    );
  });

  it("falls back for direct loads and unrelated internal paths", () => {
    assert.equal(placeListReturnTo(null), "/places");
    assert.equal(
      placeListReturnTo({ returnTo: "/account" }),
      "/places",
    );
    assert.equal(
      placeListReturnTo({ returnTo: "/places/42" }),
      "/places",
    );
  });
});
