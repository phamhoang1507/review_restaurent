import {
  ApiContractError,
  ApiError,
  type Fetcher,
} from "../lib/auth-client.ts";

export const MAX_REVIEW_CURSOR_LENGTH = 512;
export const MAX_REVIEW_CONTENT_LENGTH = 5_000;
export const MAX_REVIEW_IMAGES = 5;

export interface ReviewImage {
  id: number;
  review_id: number;
  url: string;
  url_expires_in: number;
  mime_type: string;
  size_bytes: number;
  width: number;
  height: number;
  position: number;
  created_at: string;
}

export interface Review {
  id: number;
  user_id: number;
  place_id: number;
  author_name: string;
  content: string;
  space_rating: number;
  food_drink_rating: number;
  value_rating: number;
  created_at: string;
  updated_at: string;
  images: ReviewImage[];
  overall_rating: number;
}

export interface ReviewPage {
  items: Review[];
  next_cursor: string | null;
}

export interface ReviewPageOptions {
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface ReviewsClientOptions {
  baseUrl: string;
  fetcher?: Fetcher;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function isAwareTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isCriterionRating(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

function isOverallRating(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 5
  );
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}

function isReviewImage(
  value: unknown,
  reviewId: number,
): value is ReviewImage {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isPositiveSafeInteger(value.id) &&
    value.review_id === reviewId &&
    isHttpUrl(value.url) &&
    isPositiveSafeInteger(value.url_expires_in) &&
    typeof value.mime_type === "string" &&
    value.mime_type.startsWith("image/") &&
    isPositiveSafeInteger(value.size_bytes) &&
    isPositiveSafeInteger(value.width) &&
    isPositiveSafeInteger(value.height) &&
    typeof value.position === "number" &&
    Number.isInteger(value.position) &&
    value.position >= 0 &&
    value.position < MAX_REVIEW_IMAGES &&
    isAwareTimestamp(value.created_at)
  );
}

function areReviewImages(
  value: unknown,
  reviewId: number,
): value is ReviewImage[] {
  if (!Array.isArray(value) || value.length > MAX_REVIEW_IMAGES) {
    return false;
  }

  let previousPosition = -1;
  const imageIds = new Set<number>();

  for (const image of value) {
    if (
      !isReviewImage(image, reviewId) ||
      imageIds.has(image.id) ||
      image.position <= previousPosition
    ) {
      return false;
    }

    imageIds.add(image.id);
    previousPosition = image.position;
  }

  return true;
}

function roundedOverallRating(
  spaceRating: number,
  foodDrinkRating: number,
  valueRating: number,
): number {
  return Math.round(
    ((spaceRating + foodDrinkRating + valueRating) / 3) * 100,
  ) / 100;
}

function hasCodePointLengthBetween(
  value: string,
  minimum: number,
  maximum: number,
): boolean {
  let length = 0;

  for (const _character of value) {
    length += 1;

    if (length > maximum) {
      return false;
    }
  }

  return length >= minimum;
}

function isReview(
  value: unknown,
  placeId: number,
): value is Review {
  if (!isRecord(value)) {
    return false;
  }

  const authorName = value.author_name;
  const content = value.content;

  if (
    !isPositiveSafeInteger(value.id) ||
    !isPositiveSafeInteger(value.user_id) ||
    value.place_id !== placeId ||
    typeof authorName !== "string" ||
    authorName.trim().length === 0 ||
    !hasCodePointLengthBetween(authorName, 1, 100) ||
    typeof content !== "string" ||
    !hasCodePointLengthBetween(
      content.trim(),
      10,
      MAX_REVIEW_CONTENT_LENGTH,
    ) ||
    !isCriterionRating(value.space_rating) ||
    !isCriterionRating(value.food_drink_rating) ||
    !isCriterionRating(value.value_rating) ||
    !isOverallRating(value.overall_rating) ||
    !isAwareTimestamp(value.created_at) ||
    !isAwareTimestamp(value.updated_at) ||
    !areReviewImages(value.images, value.id)
  ) {
    return false;
  }

  const expectedOverall = roundedOverallRating(
    value.space_rating,
    value.food_drink_rating,
    value.value_rating,
  );

  return Math.abs(value.overall_rating - expectedOverall) < 0.000_001;
}

function isCursor(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length > 0 &&
      value.length <= MAX_REVIEW_CURSOR_LENGTH)
  );
}

function isReviewPageForPlace(
  value: unknown,
  placeId: number,
): value is ReviewPage {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    !isCursor(value.next_cursor)
  ) {
    return false;
  }

  const reviewIds = new Set<number>();

  for (const review of value.items) {
    if (
      !isReview(review, placeId) ||
      reviewIds.has(review.id)
    ) {
      return false;
    }

    reviewIds.add(review.id);
  }

  return true;
}

function requirePositiveId(value: number, name: string): void {
  if (!isPositiveSafeInteger(value)) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function buildReviewPageSearchParams(
  options: Omit<ReviewPageOptions, "signal">,
): URLSearchParams {
  const params = new URLSearchParams();

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
      typeof options.cursor !== "string" ||
      options.cursor.length < 1 ||
      options.cursor.length > MAX_REVIEW_CURSOR_LENGTH
    ) {
      throw new RangeError(
        `cursor must contain 1 to ${MAX_REVIEW_CURSOR_LENGTH} characters`,
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

export class ReviewsClient {
  private readonly baseUrl: string;
  private readonly fetcher: Fetcher;

  constructor(options: ReviewsClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/u, "");
    this.fetcher =
      options.fetcher ??
      ((input, init) => globalThis.fetch(input, init));
  }

  async listReviews(
    placeId: number,
    options: ReviewPageOptions = {},
  ): Promise<ReviewPage> {
    requirePositiveId(placeId, "placeId");

    const params = buildReviewPageSearchParams(options);
    const query = params.toString();
    const suffix = query.length > 0 ? `?${query}` : "";
    const response = await this.get(
      `/api/v1/places/${placeId}/reviews${suffix}`,
      options.signal,
    );

    return readValidated(
      response,
      (value): value is ReviewPage =>
        isReviewPageForPlace(value, placeId),
      "reviews list",
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

export function mergeReviewPages(
  current: ReviewPage | null,
  incoming: ReviewPage,
  append: boolean,
): ReviewPage {
  const candidates =
    append && current !== null
      ? [...current.items, ...incoming.items]
      : incoming.items;
  const reviewIds = new Set<number>();
  const items: Review[] = [];

  for (const review of candidates) {
    if (!reviewIds.has(review.id)) {
      reviewIds.add(review.id);
      items.push(review);
    }
  }

  return {
    items,
    next_cursor: incoming.next_cursor,
  };
}

export const reviewsClient = new ReviewsClient({
  baseUrl: (
    import.meta.env?.VITE_API_BASE_URL?.trim() ||
    "http://localhost:8001"
  ).replace(/\/+$/u, ""),
});
