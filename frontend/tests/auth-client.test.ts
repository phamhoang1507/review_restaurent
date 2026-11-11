import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ApiClient,
  ApiError,
  type ExclusiveRunner,
  type Fetcher,
  type User,
} from "../src/lib/auth-client.ts";

const BASE_URL = "http://localhost:8001";

const testUser: User = {
  id: 42,
  email: "user@example.com",
  display_name: "LocalSpot User",
  role: "user",
  is_active: true,
  created_at: "2026-11-11T00:00:00Z",
};

const runImmediately: ExclusiveRunner = (task) => task();

function jsonResponse(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function tokenResponse(accessToken: string): Response {
  return jsonResponse({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 900,
  });
}

function asRequest(input: RequestInfo | URL): Request {
  return input instanceof Request
    ? input
    : new Request(input);
}

describe("ApiClient", () => {
  it(
    "stores login token in memory and sends refresh cookie",
    async () => {
      const requests: Request[] = [];

      const fetcher: Fetcher = async (input) => {
        const request = asRequest(input);
        requests.push(request);

        if (
          request.url.endsWith("/api/v1/auth/login")
        ) {
          return tokenResponse("login-token");
        }

        if (
          request.url.endsWith("/api/v1/users/me")
        ) {
          return jsonResponse(testUser);
        }

        throw new Error(
          `Unexpected request: ${request.url}`,
        );
      };

      const client = new ApiClient({
        baseUrl: BASE_URL,
        fetcher,
        runExclusive: runImmediately,
      });

      const user = await client.login({
        email: "user@example.com",
        password: "correct-password",
      });

      assert.deepEqual(user, testUser);
      assert.equal(requests.length, 2);
      assert.equal(
        requests[0]?.credentials,
        "include",
      );
      assert.equal(
        requests[0]?.headers.get("Content-Type"),
        "application/json",
      );
      assert.equal(
        requests[1]?.headers.get("Authorization"),
        "Bearer login-token",
      );
    },
  );

  it(
    "coalesces concurrent refreshes and uses new token",
    async () => {
      let protectedAttempts = 0;
      let refreshCalls = 0;

      const protectedTokens: Array<
        string | null
      > = [];

      let releaseRefresh:
        | (() => void)
        | undefined;

      let markRefreshStarted:
        | (() => void)
        | undefined;

      const refreshGate = new Promise<void>(
        (resolve) => {
          releaseRefresh = resolve;
        },
      );

      const refreshStarted = new Promise<void>(
        (resolve) => {
          markRefreshStarted = resolve;
        },
      );

      const fetcher: Fetcher = async (input) => {
        const request = asRequest(input);

        if (
          request.url.endsWith("/api/v1/auth/login")
        ) {
          return tokenResponse("expired-token");
        }

        if (
          request.url.endsWith("/api/v1/users/me")
        ) {
          return jsonResponse(testUser);
        }

        if (
          request.url.endsWith("/api/v1/auth/refresh")
        ) {
          refreshCalls += 1;
          markRefreshStarted?.();

          await refreshGate;

          return tokenResponse("fresh-token");
        }

        if (
          request.url.endsWith("/api/v1/protected")
        ) {
          protectedAttempts += 1;

          protectedTokens.push(
            request.headers.get("Authorization"),
          );

          if (protectedAttempts <= 3) {
            return jsonResponse(
              {
                detail:
                  "Invalid or expired access token",
              },
              401,
            );
          }

          return jsonResponse({ ok: true });
        }

        throw new Error(
          `Unexpected request: ${request.url}`,
        );
      };

      const client = new ApiClient({
        baseUrl: BASE_URL,
        fetcher,
        runExclusive: runImmediately,
      });

      await client.login({
        email: "user@example.com",
        password: "correct-password",
      });

      const pending = [
        client.authenticatedFetch(
          "/api/v1/protected",
        ),
        client.authenticatedFetch(
          "/api/v1/protected",
        ),
        client.authenticatedFetch(
          "/api/v1/protected",
        ),
      ];

      await refreshStarted;

      assert.equal(refreshCalls, 1);

      releaseRefresh?.();

      const responses = await Promise.all(
        pending,
      );

      assert.equal(refreshCalls, 1);
      assert.equal(protectedAttempts, 6);

      assert.ok(
        responses.every(
          (response) => response.status === 200,
        ),
      );

      assert.deepEqual(
        protectedTokens.slice(0, 3),
        Array.from(
          { length: 3 },
          () => "Bearer expired-token",
        ),
      );

      assert.deepEqual(
        protectedTokens.slice(3),
        Array.from(
          { length: 3 },
          () => "Bearer fresh-token",
        ),
      );
    },
  );

  it(
    "retries a protected request only once",
    async () => {
      let currentUserCalls = 0;
      let refreshCalls = 0;
      let loginCompleted = false;

      const fetcher: Fetcher = async (input) => {
        const request = asRequest(input);

        if (
          request.url.endsWith("/api/v1/auth/login")
        ) {
          return tokenResponse("expired-token");
        }

        if (
          request.url.endsWith("/api/v1/users/me")
        ) {
          currentUserCalls += 1;

          if (!loginCompleted) {
            loginCompleted = true;
            return jsonResponse(testUser);
          }

          return jsonResponse(
            {
              detail:
                "Invalid or expired access token",
            },
            401,
          );
        }

        if (
          request.url.endsWith("/api/v1/auth/refresh")
        ) {
          refreshCalls += 1;
          return tokenResponse("fresh-token");
        }

        throw new Error(
          `Unexpected request: ${request.url}`,
        );
      };

      const client = new ApiClient({
        baseUrl: BASE_URL,
        fetcher,
        runExclusive: runImmediately,
      });

      await client.login({
        email: "user@example.com",
        password: "correct-password",
      });

      await assert.rejects(
        () => client.getCurrentUser(),
        (error: unknown) => {
          assert.ok(error instanceof ApiError);
          assert.equal(error.status, 401);

          return true;
        },
      );

      assert.equal(refreshCalls, 1);
      assert.equal(currentUserCalls, 3);
    },
  );

  it(
    "coalesces StrictMode-style bootstrap calls",
    async () => {
      let refreshCalls = 0;
      let currentUserCalls = 0;

      let releaseRefresh:
        | (() => void)
        | undefined;

      const refreshGate = new Promise<void>(
        (resolve) => {
          releaseRefresh = resolve;
        },
      );

      const fetcher: Fetcher = async (input) => {
        const request = asRequest(input);

        if (
          request.url.endsWith("/api/v1/auth/refresh")
        ) {
          refreshCalls += 1;

          await refreshGate;

          return tokenResponse("bootstrap-token");
        }

        if (
          request.url.endsWith("/api/v1/users/me")
        ) {
          currentUserCalls += 1;
          return jsonResponse(testUser);
        }

        throw new Error(
          `Unexpected request: ${request.url}`,
        );
      };

      const client = new ApiClient({
        baseUrl: BASE_URL,
        fetcher,
        runExclusive: runImmediately,
      });

      const first = client.bootstrapSession();
      const second = client.bootstrapSession();

      assert.equal(first, second);

      releaseRefresh?.();

      const [firstUser, secondUser] =
        await Promise.all([
          first,
          second,
        ]);

      assert.deepEqual(firstUser, testUser);
      assert.deepEqual(secondUser, testUser);
      assert.equal(refreshCalls, 1);
      assert.equal(currentUserCalls, 1);
    },
  );

  it(
    "clears memory token when logout request fails",
    async () => {
      let logoutAttempted = false;

      let protectedAuthorization:
        | string
        | null = "not-called";

      const fetcher: Fetcher = async (input) => {
        const request = asRequest(input);

        if (
          request.url.endsWith("/api/v1/auth/login")
        ) {
          return tokenResponse("login-token");
        }

        if (
          request.url.endsWith("/api/v1/users/me")
        ) {
          return jsonResponse(testUser);
        }

        if (
          request.url.endsWith("/api/v1/auth/logout")
        ) {
          logoutAttempted = true;

          throw new TypeError(
            "Network unavailable",
          );
        }

        if (
          request.url.endsWith("/api/v1/public-check")
        ) {
          protectedAuthorization =
            request.headers.get("Authorization");

          return jsonResponse({ ok: true });
        }

        throw new Error(
          `Unexpected request: ${request.url}`,
        );
      };

      const client = new ApiClient({
        baseUrl: BASE_URL,
        fetcher,
        runExclusive: runImmediately,
      });

      await client.login({
        email: "user@example.com",
        password: "correct-password",
      });

      await assert.rejects(
        () => client.logout(),
        /Network unavailable/,
      );

      await client.authenticatedFetch(
        "/api/v1/public-check",
      );

      assert.equal(logoutAttempted, true);
      assert.equal(
        protectedAuthorization,
        null,
      );
    },
  );
});
