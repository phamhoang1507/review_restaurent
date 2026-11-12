import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  locationToReturnTo,
  noticeFromState,
  returnToFromState,
  safeReturnTo,
} from "../src/routing/return-location.ts";

describe("return location", () => {
  it("preserves an internal path, query and hash", () => {
    const returnTo = locationToReturnTo({
      pathname: "/account/settings",
      search: "?tab=security",
      hash: "#sessions",
    });

    assert.equal(
      returnTo,
      "/account/settings?tab=security#sessions",
    );
    assert.equal(safeReturnTo(returnTo), returnTo);
  });

  it("rejects external and protocol-relative URLs", () => {
    const invalidValues: unknown[] = [
      "https://evil.example/account",
      "http://evil.example/account",
      "//evil.example/account",
      "\\evil.example\\account",
      "/account\\redirect",
    ];

    for (const value of invalidValues) {
      assert.equal(safeReturnTo(value), "/account");
    }
  });

  it("rejects malformed values and control characters", () => {
    const invalidValues: unknown[] = [
      null,
      undefined,
      42,
      {},
      "",
      " /account",
      "/account ",
      "/account\n/profile",
      "/account\u0000/profile",
    ];

    for (const value of invalidValues) {
      assert.equal(safeReturnTo(value), "/account");
    }
  });

  it("prevents login and registration redirect loops", () => {
    const loopValues = [
      "/login",
      "/login/",
      "/LOGIN?again=true",
      "/register",
      "/register/#form",
    ];

    for (const value of loopValues) {
      assert.equal(safeReturnTo(value), "/account");
    }
  });

  it("reads returnTo only from a valid state object", () => {
    assert.equal(
      returnToFromState({
        returnTo: "/account?tab=profile#email",
      }),
      "/account?tab=profile#email",
    );
    assert.equal(
      returnToFromState({
        returnTo: "https://evil.example",
      }),
      "/account",
    );
    assert.equal(returnToFromState(null), "/account");
    assert.equal(returnToFromState([]), "/account");
  });

  it("uses only a safe fallback", () => {
    assert.equal(
      safeReturnTo(null, "/places?sort=rating"),
      "/places?sort=rating",
    );
    assert.equal(
      safeReturnTo(null, "https://evil.example"),
      "/account",
    );
    assert.equal(
      safeReturnTo(null, "/login"),
      "/account",
    );
  });
});

describe("route notice", () => {
  it("normalizes and bounds a notice from route state", () => {
    assert.equal(
      noticeFromState({
        notice: "  Phiên đăng xuất\nđã được xác nhận.  ",
      }),
      "Phiên đăng xuất đã được xác nhận.",
    );

    assert.equal(
      noticeFromState({ notice: "x".repeat(500) })?.length,
      300,
    );
  });

  it("rejects empty and non-string notices", () => {
    assert.equal(noticeFromState(null), null);
    assert.equal(noticeFromState({}), null);
    assert.equal(noticeFromState({ notice: "   " }), null);
    assert.equal(noticeFromState({ notice: 42 }), null);
  });
});
