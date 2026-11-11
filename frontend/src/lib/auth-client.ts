export type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ExclusiveRunner = <T>(
  task: () => Promise<T>,
) => Promise<T>;

export interface ApiClientOptions {
  baseUrl: string;
  fetcher?: Fetcher;
  runExclusive?: ExclusiveRunner;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  display_name: string;
}

export interface User {
  id: number;
  email: string;
  display_name: string;
  role: "user" | "admin";
  is_active: boolean;
  created_at: string;
}

interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly retryAfter: string | null;
  readonly payload: unknown;

  constructor(
    status: number,
    detail: string,
    retryAfter: string | null,
    payload: unknown,
  ) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.retryAfter = retryAfter;
    this.payload = payload;
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const payload = await readResponseBody(response);

    return new ApiError(
      response.status,
      errorDetail(payload, response.status),
      response.headers.get("Retry-After"),
      payload,
    );
  }
}

export class ApiContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiContractError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTokenResponse(value: unknown): value is TokenResponse {
  return (
    isRecord(value) &&
    typeof value.access_token === "string" &&
    value.access_token.length > 0 &&
    value.token_type === "bearer" &&
    typeof value.expires_in === "number" &&
    Number.isFinite(value.expires_in) &&
    value.expires_in > 0
  );
}

function isUser(value: unknown): value is User {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    Number.isInteger(value.id) &&
    value.id > 0 &&
    typeof value.email === "string" &&
    typeof value.display_name === "string" &&
    (value.role === "user" || value.role === "admin") &&
    typeof value.is_active === "boolean" &&
    typeof value.created_at === "string"
  );
}

async function readResponseBody(
  response: Response,
): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function validationDetail(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const messages = value
    .map((item) => {
      if (!isRecord(item) || typeof item.msg !== "string") {
        return null;
      }

      return item.msg;
    })
    .filter((item): item is string => item !== null);

  return messages.length > 0
    ? messages.join("; ")
    : null;
}

function errorDetail(
  payload: unknown,
  status: number,
): string {
  if (isRecord(payload)) {
    if (typeof payload.detail === "string") {
      return payload.detail;
    }

    const detail = validationDetail(payload.detail);

    if (detail !== null) {
      return detail;
    }
  }

  if (typeof payload === "string" && payload.trim()) {
    return payload.trim().slice(0, 500);
  }

  return `Request failed with status ${status}`;
}

async function readValidated<T>(
  response: Response,
  validator: (value: unknown) => value is T,
  responseName: string,
): Promise<T> {
  if (!response.ok) {
    throw await ApiError.fromResponse(response);
  }

  const payload = await readResponseBody(response);

  if (!validator(payload)) {
    throw new ApiContractError(
      `Backend returned an invalid ${responseName} response`,
    );
  }

  return payload;
}

const runWithBrowserLock: ExclusiveRunner = async <T>(
  task: () => Promise<T>,
): Promise<T> => {
  if (
    typeof navigator === "undefined" ||
    navigator.locks === undefined
  ) {
    return task();
  }

  return navigator.locks.request(
    "localspot-auth-session",
    { mode: "exclusive" },
    task,
  );
};

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: Fetcher;
  private readonly runExclusive: ExclusiveRunner;

  private accessToken: string | null = null;
  private sessionGeneration = 0;
  private refreshPromise: Promise<string | null> | null = null;
  private bootstrapPromise: Promise<User | null> | null = null;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetcher =
      options.fetcher ??
      ((input, init) => globalThis.fetch(input, init));
    this.runExclusive =
      options.runExclusive ?? runWithBrowserLock;
  }

  async register(input: RegisterInput): Promise<User> {
    const response = await this.fetcher(
      new Request(this.url("/api/v1/auth/register"), {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: this.jsonHeaders(),
        body: JSON.stringify(input),
      }),
    );

    return readValidated(
      response,
      isUser,
      "register",
    );
  }

  async login(input: LoginInput): Promise<User> {
    this.sessionGeneration += 1;
    this.accessToken = null;

    const generation = this.sessionGeneration;

    await this.waitForRefresh();

    const token = await this.runExclusive(async () => {
      const response = await this.fetcher(
        new Request(this.url("/api/v1/auth/login"), {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: this.jsonHeaders(),
          body: JSON.stringify(input),
        }),
      );

      return readValidated(
        response,
        isTokenResponse,
        "login",
      );
    });

    if (generation !== this.sessionGeneration) {
      throw new ApiContractError(
        "Login request was superseded",
      );
    }

    this.accessToken = token.access_token;

    try {
      return await this.fetchCurrentUser(false);
    } catch (error: unknown) {
      if (
        error instanceof ApiError &&
        error.status === 401 &&
        generation === this.sessionGeneration
      ) {
        this.accessToken = null;
      }

      throw error;
    }
  }

  bootstrapSession(): Promise<User | null> {
    if (this.bootstrapPromise !== null) {
      return this.bootstrapPromise;
    }

    const generation = this.sessionGeneration;
    const operation = this.performBootstrap(
      generation,
    );

    this.bootstrapPromise = operation;

    void operation.then(
      () => this.clearBootstrapPromise(operation),
      () => this.clearBootstrapPromise(operation),
    );

    return operation;
  }

  async getCurrentUser(): Promise<User> {
    return this.fetchCurrentUser(true);
  }

  async logout(): Promise<void> {
    this.sessionGeneration += 1;
    this.accessToken = null;

    await this.waitForRefresh();

    const response = await this.runExclusive(() =>
      this.fetcher(
        new Request(this.url("/api/v1/auth/logout"), {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        }),
      ),
    );

    if (!response.ok) {
      throw await ApiError.fromResponse(response);
    }
  }

  async authenticatedFetch(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return this.fetchWithAuth(
      path,
      init,
      true,
    );
  }

  private async performBootstrap(
    generation: number,
  ): Promise<User | null> {
    const token = await this.refreshAccessToken();

    if (
      token === null ||
      generation !== this.sessionGeneration
    ) {
      return null;
    }

    try {
      return await this.fetchCurrentUser(false);
    } catch (error: unknown) {
      if (
        error instanceof ApiError &&
        error.status === 401
      ) {
        if (generation === this.sessionGeneration) {
          this.accessToken = null;
        }

        return null;
      }

      throw error;
    }
  }

  private async fetchCurrentUser(
    retryOn401: boolean,
  ): Promise<User> {
    const response = await this.fetchWithAuth(
      "/api/v1/users/me",
      {
        method: "GET",
        cache: "no-store",
      },
      retryOn401,
    );

    return readValidated(
      response,
      isUser,
      "current user",
    );
  }

  private async fetchWithAuth(
    path: string,
    init: RequestInit,
    retryOn401: boolean,
  ): Promise<Response> {
    const request = new Request(
      this.url(path),
      {
        ...init,
        credentials: "omit",
      },
    );

    const tokenUsed = this.accessToken;

    let response = await this.fetcher(
      this.withAuthorization(
        request.clone(),
        tokenUsed,
      ),
    );

    if (
      response.status !== 401 ||
      !retryOn401
    ) {
      return response;
    }

    let retryToken = this.accessToken;

    if (retryToken === tokenUsed) {
      retryToken = await this.refreshAccessToken();
    }

    if (retryToken === null) {
      return response;
    }

    try {
      await response.body?.cancel();
    } catch {
      // Response body may already be closed.
    }

    response = await this.fetcher(
      this.withAuthorization(
        request.clone(),
        retryToken,
      ),
    );

    if (
      response.status === 401 &&
      this.accessToken === retryToken
    ) {
      this.accessToken = null;
    }

    return response;
  }

  private refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise !== null) {
      return this.refreshPromise;
    }

    const generation = this.sessionGeneration;

    const operation = this.runExclusive(() =>
      this.performRefresh(generation),
    );

    this.refreshPromise = operation;

    void operation.then(
      () => this.clearRefreshPromise(operation),
      () => this.clearRefreshPromise(operation),
    );

    return operation;
  }

  private async performRefresh(
    generation: number,
  ): Promise<string | null> {
    const response = await this.fetcher(
      new Request(this.url("/api/v1/auth/refresh"), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      }),
    );

    if (response.status === 401) {
      if (generation === this.sessionGeneration) {
        this.accessToken = null;
      }

      return null;
    }

    const token = await readValidated(
      response,
      isTokenResponse,
      "refresh",
    );

    if (generation !== this.sessionGeneration) {
      return null;
    }

    this.accessToken = token.access_token;

    return token.access_token;
  }

  private async waitForRefresh(): Promise<void> {
    const operation = this.refreshPromise;

    if (operation === null) {
      return;
    }

    try {
      await operation;
    } catch {
      // Login and logout still continue after failed refresh.
    }
  }

  private clearRefreshPromise(
    operation: Promise<string | null>,
  ): void {
    if (this.refreshPromise === operation) {
      this.refreshPromise = null;
    }
  }

  private clearBootstrapPromise(
    operation: Promise<User | null>,
  ): void {
    if (this.bootstrapPromise === operation) {
      this.bootstrapPromise = null;
    }
  }

  private withAuthorization(
    request: Request,
    token: string | null,
  ): Request {
    const headers = new Headers(request.headers);

    headers.set("Accept", "application/json");

    if (token === null) {
      headers.delete("Authorization");
    } else {
      headers.set(
        "Authorization",
        `Bearer ${token}`,
      );
    }

    return new Request(
      request,
      { headers },
    );
  }

  private jsonHeaders(): Headers {
    return new Headers({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
  }

  private url(path: string): string {
    if (
      !path.startsWith("/") ||
      path.startsWith("//")
    ) {
      throw new TypeError(
        "API path must start with one slash",
      );
    }

    return `${this.baseUrl}${path}`;
  }
}
