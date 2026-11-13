import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  useLocation,
  useSearchParams,
} from "react-router-dom";

import {
  ApiContractError,
  ApiError,
} from "../lib/auth-client";
import {
  EMPTY_PLACE_FILTER_INPUT,
  mergePlacePages,
  parsePlaceFilters,
  readPlaceFilterInput,
  serializePlaceFilters,
  validatePlaceFilterInput,
  type PlaceFilterErrors,
  type PlaceFilterField,
  type PlaceFilterInput,
} from "./place-filters";
import {
  placesClient,
  type District,
  type Place,
  type PlaceFilters,
  type PlacePage,
  type Province,
} from "./places-api";

/* oxlint-disable react/set-state-in-effect -- Effects synchronize URL navigation and abortable request state. */

type RequestState = "idle" | "loading" | "success" | "error";

const FILTER_FIELD_ORDER: readonly PlaceFilterField[] = [
  "q",
  "provinceId",
  "districtId",
  "minPrice",
  "maxPrice",
  "minRating",
];

const currencyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const ratingFormatter = new Intl.NumberFormat("vi-VN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

function errorMessage(error: unknown, context: "places" | "locations"): string {
  if (error instanceof ApiError) {
    if (error.status === 422) {
      return "Bộ lọc không hợp lệ. Hãy kiểm tra lại các giá trị đã nhập.";
    }

    if (error.status >= 500) {
      return context === "places"
        ? "Dịch vụ địa điểm đang tạm gián đoạn. Vui lòng thử lại."
        : "Chưa thể tải dữ liệu khu vực. Vui lòng thử lại.";
    }

    return error.detail;
  }

  if (error instanceof ApiContractError) {
    return "Dữ liệu từ máy chủ không đúng định dạng mong đợi.";
  }

  return context === "places"
    ? "Không thể kết nối tới dịch vụ địa điểm. Hãy kiểm tra kết nối và thử lại."
    : "Không thể tải dữ liệu khu vực. Hãy kiểm tra kết nối và thử lại.";
}

function formatPriceRange(place: Place): string {
  if (place.min_price === place.max_price) {
    return currencyFormatter.format(place.min_price);
  }

  return `${currencyFormatter.format(place.min_price)} – ${currencyFormatter.format(place.max_price)}`;
}

function ratingText(place: Place): string {
  if (place.rating === null || place.review_count === 0) {
    return "Chưa có đánh giá";
  }

  return `${ratingFormatter.format(place.rating)} trên 5 từ ${place.review_count} đánh giá`;
}

function PlaceCard({
  place,
  returnTo,
}: {
  place: Place;
  returnTo: string;
}) {
  return (
    <article className="place-card">
      <div className="place-card-heading">
        <p className="place-card-price">{formatPriceRange(place)}</p>
        <h3>{place.name}</h3>
      </div>

      <p className="place-card-address">{place.address}</p>
      <p className="place-card-rating">
        <span aria-hidden="true">★</span>
        <span>{ratingText(place)}</span>
      </p>
      <p className="place-card-description">{place.description}</p>
      <Link
        className="place-card-detail-link"
        to={`/places/${place.id}`}
        state={{ returnTo }}
        aria-label={`Xem chi tiết ${place.name}`}
      >
        Xem chi tiết <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}

function fieldErrorId(field: PlaceFilterField): string {
  return `places-filter-${field}-error`;
}

function PlaceFilterError({
  field,
  errors,
}: {
  field: PlaceFilterField;
  errors: PlaceFilterErrors;
}) {
  const message = errors[field];

  return message ? (
    <span className="field-error" id={fieldErrorId(field)}>
      {message}
    </span>
  ) : null;
}

export function PlacesPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const parsedFilters = useMemo(
    () => parsePlaceFilters(searchParams),
    [searchParams],
  );
  const applied = useMemo(() => {
    const filters: PlaceFilters = parsedFilters.ok
      ? parsedFilters.filters
      : {};
    const params = serializePlaceFilters(filters);

    return {
      filters,
      params,
      key: params.toString(),
    };
  }, [parsedFilters]);
  const appliedFilters = applied.filters;
  const canonicalParams = applied.params;
  const appliedKey = applied.key;
  const currentKey = searchParams.toString();

  const [draft, setDraft] = useState<PlaceFilterInput>(() =>
    parsedFilters.ok
      ? readPlaceFilterInput(canonicalParams)
      : { ...EMPTY_PLACE_FILTER_INPUT },
  );
  const [filterErrors, setFilterErrors] =
    useState<PlaceFilterErrors>({});
  const [filterNotice, setFilterNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const draftRef = useRef(draft);
  const appliedFiltersRef = useRef(appliedFilters);

  const [provinces, setProvinces] = useState<Province[]>([]);
  const [provinceState, setProvinceState] =
    useState<RequestState>("idle");
  const [provinceError, setProvinceError] = useState<string | null>(null);
  const [provinceAttempt, setProvinceAttempt] = useState(0);

  const [districts, setDistricts] = useState<District[]>([]);
  const [districtState, setDistrictState] =
    useState<RequestState>("idle");
  const [districtError, setDistrictError] = useState<string | null>(null);
  const [districtAttempt, setDistrictAttempt] = useState(0);

  const [page, setPage] = useState<PlacePage | null>(null);
  const [placesState, setPlacesState] =
    useState<RequestState>("idle");
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [placesAttempt, setPlacesAttempt] = useState(0);
  const placesRequestKey = `${appliedKey}:${placesAttempt}`;
  const [settledPlacesRequestKey, setSettledPlacesRequestKey] =
    useState<string | null>(null);
  const [loadMoreState, setLoadMoreState] =
    useState<RequestState>("idle");
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const loadMoreController = useRef<AbortController | null>(null);
  const loadMoreInFlight = useRef(false);
  const activeFilterKey = useRef(appliedKey);

  useEffect(() => {
    draftRef.current = draft;
    appliedFiltersRef.current = appliedFilters;
  }, [appliedFilters, draft]);

  useEffect(() => {
    if (!parsedFilters.ok) {
      setFilterNotice("Bộ lọc trên đường dẫn không hợp lệ nên đã được xóa.");
      setSearchParams(new URLSearchParams(), { replace: true });
      return;
    }

    if (currentKey !== appliedKey) {
      setSearchParams(canonicalParams, { replace: true });
    }
  }, [
    appliedKey,
    canonicalParams,
    currentKey,
    parsedFilters.ok,
    setSearchParams,
  ]);

  useEffect(() => {
    if (!parsedFilters.ok) {
      return;
    }

    setDraft(readPlaceFilterInput(canonicalParams));
    setFilterErrors({});
  }, [appliedKey, canonicalParams, parsedFilters.ok]);

  useEffect(() => {
    const controller = new AbortController();
    setProvinceState("loading");
    setProvinceError(null);

    void placesClient
      .listProvinces(controller.signal)
      .then((items) => {
        setProvinces(items);
        setProvinceState("success");

        const currentDraft = draftRef.current;
        const selectedProvinceId = Number(currentDraft.provinceId);
        const selectionIsInvalid =
          currentDraft.provinceId.length > 0 &&
          Number.isSafeInteger(selectedProvinceId) &&
          !items.some((province) => province.id === selectedProvinceId);

        if (!selectionIsInvalid) {
          return;
        }

        setDraft((current) =>
          Number(current.provinceId) === selectedProvinceId
            ? { ...current, provinceId: "", districtId: "" }
            : current,
        );
        setFilterNotice(
          "Tỉnh/thành không còn tồn tại nên bộ lọc khu vực đã được xóa.",
        );

        const currentAppliedFilters = appliedFiltersRef.current;

        if (currentAppliedFilters.provinceId === selectedProvinceId) {
          const nextFilters = { ...currentAppliedFilters };
          delete nextFilters.provinceId;
          delete nextFilters.districtId;
          setSearchParams(serializePlaceFilters(nextFilters), {
            replace: true,
          });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setProvinceError(errorMessage(error, "locations"));
        setProvinceState("error");
      });

    return () => controller.abort();
  }, [provinceAttempt, setSearchParams]);

  useEffect(() => {
    const rawProvinceId = draft.provinceId.trim();
    const provinceId = Number(rawProvinceId);

    if (
      !/^\d+$/.test(rawProvinceId) ||
      !Number.isSafeInteger(provinceId) ||
      provinceId < 1
    ) {
      setDistricts([]);
      setDistrictState("idle");
      setDistrictError(null);
      return;
    }

    const controller = new AbortController();
    setDistricts([]);
    setDistrictState("loading");
    setDistrictError(null);

    void placesClient
      .listDistricts(provinceId, controller.signal)
      .then((items) => {
        setDistricts(items);
        setDistrictState("success");

        const currentDraft = draftRef.current;
        const selectedDistrictId = Number(currentDraft.districtId);
        const selectionIsInvalid =
          currentDraft.provinceId === rawProvinceId &&
          currentDraft.districtId.length > 0 &&
          Number.isSafeInteger(selectedDistrictId) &&
          !items.some((district) => district.id === selectedDistrictId);

        if (!selectionIsInvalid) {
          return;
        }

        setDraft((current) =>
          current.provinceId === rawProvinceId
            ? { ...current, districtId: "" }
            : current,
        );
        setFilterNotice(
          "Quận/huyện không thuộc tỉnh/thành đã chọn nên đã được xóa.",
        );

        const currentAppliedFilters = appliedFiltersRef.current;

        if (
          currentAppliedFilters.provinceId === provinceId &&
          currentAppliedFilters.districtId === selectedDistrictId
        ) {
          const nextFilters = { ...currentAppliedFilters };
          delete nextFilters.districtId;
          setSearchParams(serializePlaceFilters(nextFilters), {
            replace: true,
          });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setDistrictError(errorMessage(error, "locations"));
        setDistrictState("error");
      });

    return () => controller.abort();
  }, [districtAttempt, draft.provinceId, setSearchParams]);

  useEffect(() => {
    if (!parsedFilters.ok) {
      return;
    }

    const controller = new AbortController();
    activeFilterKey.current = appliedKey;
    loadMoreController.current?.abort();
    loadMoreInFlight.current = false;
    setPage(null);
    setPlacesState("loading");
    setPlacesError(null);
    setLoadMoreState("idle");
    setLoadMoreError(null);
    setAnnouncement("Đang tải danh sách địa điểm.");

    void placesClient
      .listPlaces(appliedFilters, {
        limit: 12,
        signal: controller.signal,
      })
      .then((incoming) => {
        if (activeFilterKey.current !== appliedKey) {
          return;
        }

        setPage(incoming);
        setPlacesState("success");
        setAnnouncement(
          incoming.items.length === 0
            ? "Không tìm thấy địa điểm phù hợp."
            : `Đang hiển thị ${incoming.items.length} địa điểm.`,
        );
        setSettledPlacesRequestKey(placesRequestKey);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setPlacesError(errorMessage(error, "places"));
        setPlacesState("error");
        setAnnouncement("Tải danh sách địa điểm thất bại.");
        setSettledPlacesRequestKey(placesRequestKey);
      });

    return () => {
      controller.abort();
      loadMoreController.current?.abort();
      loadMoreInFlight.current = false;
    };
  }, [appliedFilters, appliedKey, parsedFilters.ok, placesRequestKey]);

  function updateDraft(field: PlaceFilterField, value: string) {
    setDraft((current) => ({
      ...current,
      [field]: value,
      ...(field === "provinceId" ? { districtId: "" } : {}),
    }));
    setFilterErrors((current) => {
      const next = { ...current };
      delete next[field];

      if (field === "provinceId") {
        delete next.districtId;
      }

      return next;
    });
    setFilterNotice(null);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validatePlaceFilterInput(draft);

    if (!result.ok) {
      setFilterErrors(result.errors);
      const firstInvalidField = FILTER_FIELD_ORDER.find(
        (field) => result.errors[field] !== undefined,
      );

      if (firstInvalidField !== undefined) {
        formRef.current
          ?.querySelector<HTMLElement>(`[name="${firstInvalidField}"]`)
          ?.focus();
      }

      return;
    }

    setFilterErrors({});
    setFilterNotice(null);
    setSearchParams(serializePlaceFilters(result.filters));
  }

  function clearFilters() {
    setDraft({ ...EMPTY_PLACE_FILTER_INPUT });
    setFilterErrors({});
    setFilterNotice(null);
    setSearchParams(new URLSearchParams());
  }

  async function loadMore() {
    const cursor = page?.next_cursor;

    if (
      cursor === null ||
      cursor === undefined ||
      loadMoreInFlight.current
    ) {
      return;
    }

    const filterKey = appliedKey;
    const controller = new AbortController();
    loadMoreController.current?.abort();
    loadMoreController.current = controller;
    loadMoreInFlight.current = true;
    setLoadMoreState("loading");
    setLoadMoreError(null);
    setAnnouncement("Đang tải thêm địa điểm.");

    try {
      const incoming = await placesClient.listPlaces(appliedFilters, {
        cursor,
        limit: 12,
        signal: controller.signal,
      });

      if (
        controller.signal.aborted ||
        activeFilterKey.current !== filterKey
      ) {
        return;
      }

      setPage((current) => mergePlacePages(current, incoming, true));
      setLoadMoreState("success");
      setAnnouncement(
        incoming.items.length === 0
          ? "Không còn địa điểm mới để tải."
          : `Đã tải thêm ${incoming.items.length} địa điểm.`,
      );
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        return;
      }

      setLoadMoreError(errorMessage(error, "places"));
      setLoadMoreState("error");
      setAnnouncement("Tải thêm địa điểm thất bại.");
    } finally {
      if (loadMoreController.current === controller) {
        loadMoreController.current = null;
        loadMoreInFlight.current = false;
      }
    }
  }

  const hasAppliedFilters = appliedKey.length > 0;
  const districtDisabled =
    draft.provinceId.length === 0 || districtState !== "success";
  const placesResultIsCurrent =
    settledPlacesRequestKey === placesRequestKey;
  const visiblePlacesState = placesResultIsCurrent
    ? placesState
    : "loading";
  const visiblePage = placesResultIsCurrent ? page : null;
  const visibleAnnouncement = placesResultIsCurrent
    ? announcement
    : "Đang tải danh sách địa điểm.";
  const listReturnTo = `${location.pathname}${location.search}${location.hash}`;

  return (
    <main id="main-content" className="places-page">
      <header className="places-page-header">
        <p className="eyebrow">EXPLORE LOCALSPOT</p>
        <h1 data-route-heading tabIndex={-1}>
          Tìm địa điểm phù hợp với bạn.
        </h1>
        <p>
          Tìm theo tên quán, khu vực, khoảng giá và điểm đánh giá từ
          cộng đồng.
        </p>
      </header>

      <div className="places-layout">
        <aside className="places-filter-panel" aria-labelledby="places-filter-title">
          <form ref={formRef} role="search" noValidate onSubmit={applyFilters}>
            <fieldset>
              <legend id="places-filter-title">Bộ lọc địa điểm</legend>

              <p className="visually-hidden" role="status" aria-live="polite">
                {provinceState === "loading"
                  ? "Đang tải danh sách tỉnh thành."
                  : districtState === "loading"
                    ? "Đang tải danh sách quận huyện."
                    : ""}
              </p>

              {filterNotice ? (
                <p className="filter-notice" role="status">
                  {filterNotice}
                </p>
              ) : null}

              <div className="form-field">
                <label htmlFor="places-query">Tên địa điểm</label>
                <input
                  id="places-query"
                  name="q"
                  type="search"
                  value={draft.q}
                  maxLength={200}
                  placeholder="Ví dụ: cà phê sân vườn"
                  aria-invalid={filterErrors.q !== undefined}
                  aria-describedby={filterErrors.q ? fieldErrorId("q") : undefined}
                  onChange={(event) => updateDraft("q", event.target.value)}
                />
                <PlaceFilterError field="q" errors={filterErrors} />
              </div>

              <div className="form-field">
                <label htmlFor="places-province">Tỉnh/thành</label>
                <select
                  id="places-province"
                  name="provinceId"
                  value={draft.provinceId}
                  disabled={provinceState === "loading"}
                  aria-invalid={filterErrors.provinceId !== undefined}
                  aria-describedby={
                    filterErrors.provinceId
                      ? fieldErrorId("provinceId")
                      : undefined
                  }
                  onChange={(event) =>
                    updateDraft("provinceId", event.target.value)
                  }
                >
                  <option value="">
                    {provinceState === "loading"
                      ? "Đang tải tỉnh/thành…"
                      : "Tất cả tỉnh/thành"}
                  </option>
                  {provinces.map((province) => (
                    <option key={province.id} value={province.id}>
                      {province.name}
                    </option>
                  ))}
                </select>
                <PlaceFilterError field="provinceId" errors={filterErrors} />
              </div>

              {provinceState === "error" ? (
                <div className="lookup-error" role="alert">
                  <span>{provinceError}</span>
                  <button
                    type="button"
                    onClick={() => setProvinceAttempt((value) => value + 1)}
                  >
                    Thử tải lại
                  </button>
                </div>
              ) : null}

              <div className="form-field">
                <label htmlFor="places-district">Quận/huyện</label>
                <select
                  id="places-district"
                  name="districtId"
                  value={draft.districtId}
                  disabled={districtDisabled}
                  aria-invalid={filterErrors.districtId !== undefined}
                  aria-describedby={
                    filterErrors.districtId
                      ? fieldErrorId("districtId")
                      : "places-district-hint"
                  }
                  onChange={(event) =>
                    updateDraft("districtId", event.target.value)
                  }
                >
                  <option value="">
                    {districtState === "loading"
                      ? "Đang tải quận/huyện…"
                      : "Tất cả quận/huyện"}
                  </option>
                  {districts.map((district) => (
                    <option key={district.id} value={district.id}>
                      {district.name}
                    </option>
                  ))}
                </select>
                <span className="field-hint" id="places-district-hint">
                  Chọn tỉnh/thành trước để xem danh sách quận/huyện.
                </span>
                <PlaceFilterError field="districtId" errors={filterErrors} />
              </div>

              {districtState === "error" ? (
                <div className="lookup-error" role="alert">
                  <span>{districtError}</span>
                  <button
                    type="button"
                    onClick={() => setDistrictAttempt((value) => value + 1)}
                  >
                    Thử tải lại
                  </button>
                </div>
              ) : null}

              <div className="places-price-fields">
                <div className="form-field">
                  <label htmlFor="places-min-price">Giá từ</label>
                  <input
                    id="places-min-price"
                    name="minPrice"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="2147483647"
                    step="1"
                    value={draft.minPrice}
                    placeholder="0"
                    aria-invalid={filterErrors.minPrice !== undefined}
                    aria-describedby={
                      filterErrors.minPrice
                        ? fieldErrorId("minPrice")
                        : "places-price-hint"
                    }
                    onChange={(event) =>
                      updateDraft("minPrice", event.target.value)
                    }
                  />
                  <PlaceFilterError field="minPrice" errors={filterErrors} />
                </div>

                <div className="form-field">
                  <label htmlFor="places-max-price">Đến</label>
                  <input
                    id="places-max-price"
                    name="maxPrice"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="2147483647"
                    step="1"
                    value={draft.maxPrice}
                    placeholder="500000"
                    aria-invalid={filterErrors.maxPrice !== undefined}
                    aria-describedby={
                      filterErrors.maxPrice
                        ? fieldErrorId("maxPrice")
                        : "places-price-hint"
                    }
                    onChange={(event) =>
                      updateDraft("maxPrice", event.target.value)
                    }
                  />
                  <PlaceFilterError field="maxPrice" errors={filterErrors} />
                </div>
              </div>
              <span className="field-hint" id="places-price-hint">
                Khoảng giá bằng VND.
              </span>

              <div className="form-field">
                <label htmlFor="places-min-rating">Điểm tối thiểu (0–5)</label>
                <input
                  id="places-min-rating"
                  name="minRating"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="5"
                  step="0.1"
                  value={draft.minRating}
                  placeholder="Ví dụ: 4.2"
                  aria-invalid={filterErrors.minRating !== undefined}
                  aria-describedby={
                    filterErrors.minRating
                      ? fieldErrorId("minRating")
                      : "places-rating-hint"
                  }
                  onChange={(event) =>
                    updateDraft("minRating", event.target.value)
                  }
                />
                <span className="field-hint" id="places-rating-hint">
                  Nhập 0 để chỉ xem địa điểm đã có đánh giá; để trống để xem tất cả.
                </span>
                <PlaceFilterError field="minRating" errors={filterErrors} />
              </div>

              <div className="places-filter-actions">
                <button className="places-apply-button" type="submit">
                  Áp dụng bộ lọc
                </button>
                <button
                  className="places-clear-button"
                  type="button"
                  onClick={clearFilters}
                >
                  Xóa bộ lọc
                </button>
              </div>
            </fieldset>
          </form>
        </aside>

        <section className="places-results" aria-labelledby="places-results-title">
          <div className="places-results-heading">
            <div>
              <p className="eyebrow">COMMUNITY PICKS</p>
              <h2 id="places-results-title">Địa điểm mới nhất</h2>
            </div>
            {visiblePage && visiblePlacesState === "success" ? (
              <p>{`Đang hiển thị ${visiblePage.items.length} địa điểm`}</p>
            ) : null}
          </div>

          <p className="visually-hidden" role="status" aria-live="polite">
            {visibleAnnouncement}
          </p>

          {visiblePlacesState === "loading" ? (
            <div className="places-state-card">
              <span className="places-spinner" aria-hidden="true" />
              <div>
                <h3>Đang tìm địa điểm</h3>
                <p>LocalSpot đang áp dụng bộ lọc của bạn.</p>
              </div>
            </div>
          ) : null}

          {visiblePlacesState === "error" ? (
            <div className="places-state-card places-state-card--error" role="alert">
              <div>
                <h3>Chưa thể tải danh sách</h3>
                <p>{placesError}</p>
                <button
                  type="button"
                  onClick={() => setPlacesAttempt((value) => value + 1)}
                >
                  Thử lại
                </button>
              </div>
            </div>
          ) : null}

          {visiblePlacesState === "success" && visiblePage?.items.length === 0 ? (
            <div className="places-state-card">
              <div>
                <h3>Chưa tìm thấy địa điểm phù hợp</h3>
                <p>Hãy thử nới rộng khu vực, khoảng giá hoặc mức điểm.</p>
                {hasAppliedFilters ? (
                  <button type="button" onClick={clearFilters}>
                    Xóa bộ lọc
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {visiblePlacesState === "success" &&
          visiblePage &&
          visiblePage.items.length > 0 ? (
            <>
              <ul
                className="places-grid"
                id="places-results"
                aria-busy={loadMoreState === "loading"}
              >
                {visiblePage.items.map((place) => (
                  <li key={place.id}>
                    <PlaceCard place={place} returnTo={listReturnTo} />
                  </li>
                ))}
              </ul>

              <div className="places-pagination">
                {loadMoreError ? (
                  <p className="places-load-error" role="alert">
                    {loadMoreError}
                  </p>
                ) : null}
                <button
                  type="button"
                  aria-controls="places-results"
                  aria-disabled={
                    visiblePage.next_cursor === null ||
                    loadMoreState === "loading"
                  }
                  onClick={() => void loadMore()}
                >
                  {loadMoreState === "loading"
                    ? "Đang tải thêm…"
                    : visiblePage.next_cursor === null
                      ? "Đã hiển thị tất cả"
                      : loadMoreState === "error"
                        ? "Thử tải lại"
                        : "Xem thêm địa điểm"}
                </button>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
