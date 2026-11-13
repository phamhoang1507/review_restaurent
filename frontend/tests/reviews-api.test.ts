import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ReviewsClient,
  mergeReviewPages,
  type Review,
  type ReviewImage,
  type ReviewPageOptions,
} from "../src/reviews/reviews-api.ts";
import {
  ApiContractError,
  ApiError,
  type Fetcher,
} from "../src/lib/auth-client.ts";

const BASE_URL = "http://localhost:8001";
const PLACE_ID = 42;

const testImage: ReviewImage = {
  id: 91,
  review_id: 12,
  url: "https://storage.example.test/reviews/photo.webp?signature=safe",
  url_expires_in: 300,
  mime_type: "image/webp",
  size_bytes: 48_000,
  width: 1_280,
  height: 960,
  position: 0,
  created_at: "2026-11-12T08:00:00Z",
};

const testReview: Review = {
  id: 12,
  user_id: 7,
  place_id: PLACE_ID,
  author_name: "Nguyễn An",
  content: "Không gian yên tĩnh và đồ uống được chuẩn bị chỉn chu.",
  space_rating: 4,
  food_drink_rating: 5,
  value_rating: 3,
  created_at: "2026-11-12T08:00:00Z",
  updated_at: "2026-11-12T09:00:00+00:00",
  images: [testImage],
  overall_rating: 4,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function reviewPage(
  items: unknown[] = [testReview],
  nextCursor: unknown = null,
): unknown {
  return {
    items,
    next_cursor: nextCursor,
  };
}

function asRequest(input: RequestInfo | URL): Request {
  return input instanceof Request
    ? input
    : new Request(input);
}

describe("ReviewsClient", () => {
  it("requests one place page and preserves an opaque cursor", async () => {
    let capturedRequest: Request | undefined;

    const fetcher: Fetcher = async (input) => {
      capturedRequest = asRequest(input);
      return jsonResponse(reviewPage([], null));
    };

    const client = new ReviewsClient({
      baseUrl: `${BASE_URL}/`,
      fetcher,
    });
    const cursor = "eyJpZCI6MTI+/=_-";

    await client.listReviews(PLACE_ID, {
      limit: 12,
      cursor,
    });

    assert.ok(capturedRequest);
    const url = new URL(capturedRequest.url);

    assert.equal(
      url.pathname,
      `/api/v1/places/${PLACE_ID}/reviews`,
    );
    assert.equal(url.searchParams.get("limit"), "12");
    assert.equal(url.searchParams.get("cursor"), cursor);
    assert.equal(capturedRequest.method, "GET");
    assert.equal(capturedRequest.credentials, "omit");
    assert.equal(capturedRequest.cache, "no-store");
    assert.equal(
      capturedRequest.headers.get("Accept"),
      "application/json",
    );
  });

  it("accepts a review with ordered embedded images", async () => {
    const secondImage: ReviewImage = {
      ...testImage,
      id: 92,
      position: 2,
    };
    const review: Review = {
      ...testReview,
      author_name: "😀".repeat(51),
      content: "😀".repeat(2_501),
      images: [testImage, secondImage],
    };
    const client = new ReviewsClient({
      baseUrl: BASE_URL,
      fetcher: async () =>
        jsonResponse(reviewPage([review], "next-cursor")),
    });

    assert.deepEqual(
      await client.listReviews(PLACE_ID),
      {
        items: [review],
        next_cursor: "next-cursor",
      },
    );
  });

  it("rejects invalid review response contracts", async (context) => {
    const invalidReviews: Array<readonly [string, unknown]> = [
      ["unsafe id", { ...testReview, id: Number.MAX_SAFE_INTEGER + 1 }],
      ["wrong place", { ...testReview, place_id: PLACE_ID + 1 }],
      ["blank author", { ...testReview, author_name: "   " }],
      ["short content", { ...testReview, content: "Too short" }],
      ["decimal rating", { ...testReview, space_rating: 4.5 }],
      ["rating above five", { ...testReview, value_rating: 6 }],
      ["wrong overall", { ...testReview, overall_rating: 4.5 }],
      [
        "timestamp without timezone",
        { ...testReview, created_at: "2026-11-12T08:00:00" },
      ],
    ];

    for (const [name, review] of invalidReviews) {
      await context.test(name, async () => {
        const client = new ReviewsClient({
          baseUrl: BASE_URL,
          fetcher: async () =>
            jsonResponse(reviewPage([review])),
        });

        await assert.rejects(
          client.listReviews(PLACE_ID),
          ApiContractError,
        );
      });
    }
  });

  it("rejects invalid image response contracts", async (context) => {
    const invalidImages: Array<readonly [string, unknown]> = [
      ["wrong review", { ...testImage, review_id: 99 }],
      ["unsafe URL", { ...testImage, url: "javascript:alert(1)" }],
      [
        "credential URL",
        { ...testImage, url: "https://user:pass@example.test/image.webp" },
      ],
      ["invalid MIME", { ...testImage, mime_type: "text/html" }],
      ["zero width", { ...testImage, width: 0 }],
      ["invalid position", { ...testImage, position: 5 }],
      ["zero TTL", { ...testImage, url_expires_in: 0 }],
    ];

    for (const [name, image] of invalidImages) {
      await context.test(name, async () => {
        const client = new ReviewsClient({
          baseUrl: BASE_URL,
          fetcher: async () =>
            jsonResponse(
              reviewPage([
                { ...testReview, images: [image] },
              ]),
            ),
        });

        await assert.rejects(
          client.listReviews(PLACE_ID),
          ApiContractError,
        );
      });
    }
  });

  it("rejects duplicate and unordered embedded images", async () => {
    const duplicate = {
      ...testImage,
      id: 92,
    };
    const client = new ReviewsClient({
      baseUrl: BASE_URL,
      fetcher: async () =>
        jsonResponse(
          reviewPage([
            {
              ...testReview,
              images: [testImage, duplicate],
            },
          ]),
        ),
    });

    await assert.rejects(
      client.listReviews(PLACE_ID),
      ApiContractError,
    );

    const unorderedClient = new ReviewsClient({
      baseUrl: BASE_URL,
      fetcher: async () =>
        jsonResponse(
          reviewPage([
            {
              ...testReview,
              images: [
                { ...testImage, id: 93, position: 2 },
                testImage,
              ],
            },
          ]),
        ),
    });

    await assert.rejects(
      unorderedClient.listReviews(PLACE_ID),
      ApiContractError,
    );
  });

  it("rejects duplicate reviews and invalid cursors", async () => {
    const duplicateClient = new ReviewsClient({
      baseUrl: BASE_URL,
      fetcher: async () =>
        jsonResponse(reviewPage([testReview, testReview])),
    });

    await assert.rejects(
      duplicateClient.listReviews(PLACE_ID),
      ApiContractError,
    );

    for (const cursor of ["", "x".repeat(513), 42]) {
      const client = new ReviewsClient({
        baseUrl: BASE_URL,
        fetcher: async () =>
          jsonResponse(reviewPage([], cursor)),
      });

      await assert.rejects(
        client.listReviews(PLACE_ID),
        ApiContractError,
      );
    }
  });

  it("maps HTTP errors and keeps backend details", async () => {
    const client = new ReviewsClient({
      baseUrl: BASE_URL,
      fetcher: async () =>
        jsonResponse({ detail: "Place not found" }, 404),
    });

    await assert.rejects(
      client.listReviews(PLACE_ID),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 404);
        assert.equal(error.detail, "Place not found");
        return true;
      },
    );
  });

  it("rejects a malformed success body", async () => {
    const client = new ReviewsClient({
      baseUrl: BASE_URL,
      fetcher: async () =>
        new Response("not-json", { status: 200 }),
    });

    await assert.rejects(
      client.listReviews(PLACE_ID),
      ApiContractError,
    );
  });

  it("propagates abort reasons unchanged", async () => {
    const reason = new DOMException("superseded", "AbortError");
    const client = new ReviewsClient({
      baseUrl: BASE_URL,
      fetcher: async () => {
        throw reason;
      },
    });

    await assert.rejects(
      client.listReviews(PLACE_ID),
      (error: unknown) => error === reason,
    );
  });

  it("rejects invalid request bounds before fetching", async () => {
    let fetchCalls = 0;
    const client = new ReviewsClient({
      baseUrl: BASE_URL,
      fetcher: async () => {
        fetchCalls += 1;
        return jsonResponse(reviewPage([]));
      },
    });

    for (const placeId of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(
        client.listReviews(placeId),
        RangeError,
      );
    }

    const invalidOptions: unknown[] = [
      { limit: 0 },
      { limit: 101 },
      { limit: 1.5 },
      { cursor: "" },
      { cursor: "x".repeat(513) },
      { cursor: null },
      { cursor: 42 },
    ];

    for (const options of invalidOptions) {
      await assert.rejects(
        client.listReviews(
          PLACE_ID,
          options as ReviewPageOptions,
        ),
        RangeError,
      );
    }

    assert.equal(fetchCalls, 0);
  });
});

describe("mergeReviewPages", () => {
  it("appends in backend order and deduplicates review ids", () => {
    const secondReview: Review = {
      ...testReview,
      id: 13,
      images: [],
    };

    const result = mergeReviewPages(
      {
        items: [testReview],
        next_cursor: "old-cursor",
      },
      {
        items: [testReview, secondReview],
        next_cursor: null,
      },
      true,
    );

    assert.deepEqual(
      result.items.map((review) => review.id),
      [12, 13],
    );
    assert.equal(result.next_cursor, null);
  });

  it("replaces old results for a different place", () => {
    const replacement: Review = {
      ...testReview,
      id: 14,
      place_id: 99,
      images: [],
    };

    const result = mergeReviewPages(
      {
        items: [testReview],
        next_cursor: "old-cursor",
      },
      {
        items: [replacement],
        next_cursor: "new-cursor",
      },
      false,
    );

    assert.deepEqual(result.items, [replacement]);
    assert.equal(result.next_cursor, "new-cursor");
  });
});
