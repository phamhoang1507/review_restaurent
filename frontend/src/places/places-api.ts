import {
  ApiContractError,
  ApiError,
  type Fetcher,
} from "../lib/auth-client.ts";

export const MAX_PLACE_PRICE = 2_147_483_647;
export const MAX_PLACE_QUERY_LENGTH = 200;
export const MAX_PLACE_CURSOR_LENGTH = 512;

export interface PlaceFilters {
  q?: string;
  provinceId?: number;
  districtId?: number;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
}

export interface Place {
  id: number;
  district_id: number;
  created_by: number;
  name: string;
  address: string;
  description: string;
  min_price: number;
  max_price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  rating: number | null;
  review_count: number;
}

export interface PlacePage {
  items: Place[];
  next_cursor: string | null;
}

export interface Province {
  id: number;
  name: string;
}

export interface District {
  id: number;
  province_id: number;
  name: string;
}

export interface PlacePageOptions {
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface PlacesClientOptions {
  baseUrl: string;
  fetcher?: Fetcher;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function isPrice(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_PLACE_PRICE
  );
}

function isRating(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 5
  );
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isPlace(value: unknown): value is Place {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isPositiveId(value.id) &&
    isPositiveId(value.district_id) &&
    isPositiveId(value.created_by) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    typeof value.address === "string" &&
    value.address.trim().length > 0 &&
    typeof value.description === "string" &&
    value.description.trim().length > 0 &&
    isPrice(value.min_price) &&
    isPrice(value.max_price) &&
    value.max_price >= value.min_price &&
    typeof value.is_active === "boolean" &&
    isTimestamp(value.created_at) &&
    isTimestamp(value.updated_at) &&
    (value.rating === null || isRating(value.rating)) &&
    typeof value.review_count === "number" &&
    Number.isSafeInteger(value.review_count) &&
    value.review_count >= 0
  );
}

function isCursor(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length > 0 &&
      value.length <= MAX_PLACE_CURSOR_LENGTH)
  );
}

function isPlacePage(value: unknown): value is PlacePage {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isPlace) &&
    isCursor(value.next_cursor)
  );
}

function isProvince(value: unknown): value is Province {
  return (
    isRecord(value) &&
    isPositiveId(value.id) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0
  );
}

function isProvinceList(value: unknown): value is Province[] {
  return Array.isArray(value) && value.every(isProvince);
}

function isDistrict(value: unknown): value is District {
  return (
    isRecord(value) &&
    isPositiveId(value.id) &&
    isPositiveId(value.province_id) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0
  );
}

function isDistrictListForProvince(
  value: unknown,
  provinceId: number,
): value is District[] {
  return (
    Array.isArray(value) &&
    value.every(
      (district) =>
        isDistrict(district) &&
        district.province_id === provinceId,
    )
  );
}

function requirePositiveId(value: number, name: string): void {
  if (!isPositiveId(value)) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function requirePrice(value: number, name: string): void {
  if (!isPrice(value)) {
    throw new RangeError(
      `${name} must be an integer between 0 and ${MAX_PLACE_PRICE}`,
    );
  }
}

export function buildPlacesSearchParams(
  filters: PlaceFilters,
  options: Omit<PlacePageOptions, "signal"> = {},
): URLSearchParams {
  const params = new URLSearchParams();
  const query = filters.q?.trim();

  if (query) {
    if (query.length > MAX_PLACE_QUERY_LENGTH) {
      throw new RangeError(
        `q must not exceed ${MAX_PLACE_QUERY_LENGTH} characters`,
      );
    }

    params.set("q", query);
  }

  const numericFilters: ReadonlyArray<
    readonly [number | undefined, string, (value: number, name: string) => void]
  > = [
    [filters.provinceId, "province_id", requirePositiveId],
    [filters.districtId, "district_id", requirePositiveId],
    [filters.minPrice, "min_price", requirePrice],
    [filters.maxPrice, "max_price", requirePrice],
  ];

  for (const [value, name, validate] of numericFilters) {
    if (value !== undefined) {
      validate(value, name);
      params.set(name, String(value));
    }
  }

  if (
    filters.minPrice !== undefined &&
    filters.maxPrice !== undefined &&
    filters.minPrice > filters.maxPrice
  ) {
    throw new RangeError("min_price must not exceed max_price");
  }

  if (filters.minRating !== undefined) {
    if (!isRating(filters.minRating)) {
      throw new RangeError("min_rating must be between 0 and 5");
    }

    params.set("min_rating", String(filters.minRating));
  }

  if (options.limit !== undefined) {
    if (
      !Number.isSafeInteger(options.limit) ||
      options.limit < 1 ||
      options.limit > 100
    ) {
      throw new RangeError("limit must be an integer between 1 and 100");
    }

    params.set("limit", String(options.limit));
  }

  if (options.cursor !== undefined) {
    if (
      options.cursor.length < 1 ||
      options.cursor.length > MAX_PLACE_CURSOR_LENGTH
    ) {
      throw new RangeError(
        `cursor must contain 1 to ${MAX_PLACE_CURSOR_LENGTH} characters`,
      );
    }

    params.set("cursor", options.cursor);
  }

  return params;
}

async function readPayload(response: Response): Promise<unknown> {
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

async function readValidated<T>(
  response: Response,
  validator: (value: unknown) => value is T,
  responseName: string,
): Promise<T> {
  if (!response.ok) {
    throw await ApiError.fromResponse(response);
  }

  const payload = await readPayload(response);

  if (!validator(payload)) {
    throw new ApiContractError(
      `Backend returned an invalid ${responseName} response`,
    );
  }

  return payload;
}

export class PlacesClient {
  private readonly baseUrl: string;
  private readonly fetcher: Fetcher;

  constructor(options: PlacesClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetcher =
      options.fetcher ??
      ((input, init) => globalThis.fetch(input, init));
  }

  async listPlaces(
    filters: PlaceFilters = {},
    options: PlacePageOptions = {},
  ): Promise<PlacePage> {
    const params = buildPlacesSearchParams(filters, options);
    const query = params.toString();
    const suffix = query ? `?${query}` : "";
    const response = await this.get(
      `/api/v1/places${suffix}`,
      options.signal,
    );

    return readValidated(response, isPlacePage, "places list");
  }

  async listProvinces(signal?: AbortSignal): Promise<Province[]> {
    const response = await this.get(
      "/api/v1/locations/provinces?limit=200&offset=0",
      signal,
    );

    return readValidated(
      response,
      isProvinceList,
      "provinces list",
    );
  }

  async listDistricts(
    provinceId: number,
    signal?: AbortSignal,
  ): Promise<District[]> {
    requirePositiveId(provinceId, "provinceId");

    const response = await this.get(
      `/api/v1/locations/provinces/${provinceId}/districts?limit=200&offset=0`,
      signal,
    );

    return readValidated(
      response,
      (value): value is District[] =>
        isDistrictListForProvince(value, provinceId),
      "districts list",
    );
  }

  private get(path: string, signal?: AbortSignal): Promise<Response> {
    const init: RequestInit = {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    };

    if (signal !== undefined) {
      init.signal = signal;
    }

    return this.fetcher(
      new Request(`${this.baseUrl}${path}`, init),
    );
  }
}

export const placesClient = new PlacesClient({
  baseUrl: (
    import.meta.env?.VITE_API_BASE_URL?.trim() ||
    "http://localhost:8001"
  ).replace(/\/+$/, ""),
});
