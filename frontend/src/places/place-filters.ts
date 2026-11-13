import {
  MAX_PLACE_PRICE,
  MAX_PLACE_QUERY_LENGTH,
  buildPlacesSearchParams,
  type Place,
  type PlaceFilters,
  type PlacePage,
} from "./places-api.ts";

export interface PlaceFilterInput {
  q: string;
  provinceId: string;
  districtId: string;
  minPrice: string;
  maxPrice: string;
  minRating: string;
}

export type PlaceFilterField = keyof PlaceFilterInput;
export type PlaceFilterErrors = Partial<
  Record<PlaceFilterField, string>
>;

export type PlaceFilterValidationResult =
  | {
      ok: true;
      filters: PlaceFilters;
      errors: PlaceFilterErrors;
    }
  | {
      ok: false;
      errors: PlaceFilterErrors;
    };

export const EMPTY_PLACE_FILTER_INPUT: Readonly<PlaceFilterInput> = {
  q: "",
  provinceId: "",
  districtId: "",
  minPrice: "",
  maxPrice: "",
  minRating: "",
};

const FILTER_PARAM_NAMES: Readonly<
  Record<PlaceFilterField, string>
> = {
  q: "q",
  provinceId: "province_id",
  districtId: "district_id",
  minPrice: "min_price",
  maxPrice: "max_price",
  minRating: "min_rating",
};

export function readPlaceFilterInput(
  params: URLSearchParams,
): PlaceFilterInput {
  return {
    q: params.get(FILTER_PARAM_NAMES.q) ?? "",
    provinceId:
      params.get(FILTER_PARAM_NAMES.provinceId) ?? "",
    districtId:
      params.get(FILTER_PARAM_NAMES.districtId) ?? "",
    minPrice:
      params.get(FILTER_PARAM_NAMES.minPrice) ?? "",
    maxPrice:
      params.get(FILTER_PARAM_NAMES.maxPrice) ?? "",
    minRating:
      params.get(FILTER_PARAM_NAMES.minRating) ?? "",
  };
}

function parsePositiveId(
  rawValue: string,
  field: "provinceId" | "districtId",
  label: string,
  filters: PlaceFilters,
  errors: PlaceFilterErrors,
): void {
  const value = rawValue.trim();

  if (!value) {
    return;
  }

  if (!/^\d+$/.test(value)) {
    errors[field] = `${label} không hợp lệ.`;
    return;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    errors[field] = `${label} không hợp lệ.`;
    return;
  }

  if (field === "provinceId") {
    filters.provinceId = parsed;
  } else {
    filters.districtId = parsed;
  }
}

function parsePrice(
  rawValue: string,
  field: "minPrice" | "maxPrice",
  label: string,
  filters: PlaceFilters,
  errors: PlaceFilterErrors,
): void {
  const value = rawValue.trim();

  if (!value) {
    return;
  }

  if (!/^\d+$/.test(value)) {
    errors[field] = `${label} phải là số nguyên không âm.`;
    return;
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > MAX_PLACE_PRICE
  ) {
    errors[field] =
      `${label} phải nằm trong khoảng 0–${MAX_PLACE_PRICE}.`;
    return;
  }

  if (field === "minPrice") {
    filters.minPrice = parsed;
  } else {
    filters.maxPrice = parsed;
  }
}

function parseRating(
  rawValue: string,
  filters: PlaceFilters,
  errors: PlaceFilterErrors,
): void {
  const value = rawValue.trim();

  if (!value) {
    return;
  }

  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) {
    errors.minRating = "Điểm tối thiểu phải là một số từ 0 đến 5.";
    return;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 5) {
    errors.minRating = "Điểm tối thiểu phải nằm trong khoảng 0–5.";
    return;
  }

  filters.minRating = parsed;
}

export function validatePlaceFilterInput(
  input: PlaceFilterInput,
): PlaceFilterValidationResult {
  const errors: PlaceFilterErrors = {};
  const filters: PlaceFilters = {};
  const query = input.q.trim();

  if (query.length > MAX_PLACE_QUERY_LENGTH) {
    errors.q =
      `Từ khóa không được vượt quá ${MAX_PLACE_QUERY_LENGTH} ký tự.`;
  } else if (query) {
    filters.q = query;
  }

  parsePositiveId(
    input.provinceId,
    "provinceId",
    "Tỉnh/thành",
    filters,
    errors,
  );
  parsePositiveId(
    input.districtId,
    "districtId",
    "Quận/huyện",
    filters,
    errors,
  );
  parsePrice(
    input.minPrice,
    "minPrice",
    "Giá thấp nhất",
    filters,
    errors,
  );
  parsePrice(
    input.maxPrice,
    "maxPrice",
    "Giá cao nhất",
    filters,
    errors,
  );
  parseRating(input.minRating, filters, errors);

  if (
    filters.districtId !== undefined &&
    filters.provinceId === undefined
  ) {
    errors.districtId = "Hãy chọn tỉnh/thành trước quận/huyện.";
  }

  if (
    filters.minPrice !== undefined &&
    filters.maxPrice !== undefined &&
    filters.minPrice > filters.maxPrice
  ) {
    const message =
      "Giá thấp nhất không được lớn hơn giá cao nhất.";
    errors.minPrice = message;
    errors.maxPrice = message;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, filters, errors };
}

export function parsePlaceFilters(
  params: URLSearchParams,
): PlaceFilterValidationResult {
  return validatePlaceFilterInput(readPlaceFilterInput(params));
}

export function serializePlaceFilters(
  filters: PlaceFilters,
): URLSearchParams {
  return buildPlacesSearchParams(filters);
}

function deduplicatePlaces(items: readonly Place[]): Place[] {
  const seen = new Set<number>();
  const unique: Place[] = [];

  for (const place of items) {
    if (!seen.has(place.id)) {
      seen.add(place.id);
      unique.push(place);
    }
  }

  return unique;
}

export function mergePlacePages(
  current: PlacePage | null,
  incoming: PlacePage,
  append: boolean,
): PlacePage {
  const items =
    append && current !== null
      ? [...current.items, ...incoming.items]
      : incoming.items;

  return {
    items: deduplicatePlaces(items),
    next_cursor: incoming.next_cursor,
  };
}
