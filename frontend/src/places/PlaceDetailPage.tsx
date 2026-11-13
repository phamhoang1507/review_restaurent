import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import {
  ApiContractError,
  ApiError,
} from "../lib/auth-client.ts";
import {
  mergeReviewPages,
  reviewsClient,
  type Review,
  type ReviewImage,
  type ReviewPage,
} from "../reviews/reviews-api.ts";
import {
  parsePlaceId,
  placeListReturnTo,
} from "./place-detail-route.ts";
import {
  placesClient,
  type Place,
} from "./places-api.ts";

type ResultStatus = "success" | "error" | "not-found";
type LoadMoreStatus = "idle" | "loading" | "success" | "error";

interface PlaceResult {
  key: string;
  status: ResultStatus;
  place: Place | null;
  error: string | null;
}

interface ReviewsResult {
  key: string;
  status: ResultStatus;
  page: ReviewPage | null;
  error: string | null;
}

interface LoadMoreResult {
  key: string;
  status: LoadMoreStatus;
  error: string | null;
  announcement: string;
}

const currencyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const ratingFormatter = new Intl.NumberFormat("vi-VN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "long",
});

function requestErrorMessage(error: unknown, resource: "place" | "reviews") {
  if (error instanceof ApiContractError) {
    return "Dữ liệu từ máy chủ không đúng định dạng mong đợi.";
  }

  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return resource === "place"
        ? "Dịch vụ địa điểm đang tạm gián đoạn. Vui lòng thử lại."
        : "Dịch vụ đánh giá đang tạm gián đoạn. Vui lòng thử lại.";
    }

    if (error.status === 422) {
      return "Yêu cầu phân trang không hợp lệ. Vui lòng tải lại danh sách.";
    }

    return error.detail;
  }

  return resource === "place"
    ? "Không thể kết nối tới dịch vụ địa điểm. Hãy kiểm tra kết nối và thử lại."
    : "Không thể kết nối tới dịch vụ đánh giá. Hãy kiểm tra kết nối và thử lại.";
}

function formatPriceRange(place: Place): string {
  if (place.min_price === place.max_price) {
    return currencyFormatter.format(place.min_price);
  }

  return `${currencyFormatter.format(place.min_price)} – ${currencyFormatter.format(place.max_price)}`;
}

function aggregateRatingText(place: Place): string {
  if (place.rating === null || place.review_count === 0) {
    return "Chưa có đánh giá";
  }

  return `${ratingFormatter.format(place.rating)} trên 5 từ ${place.review_count} đánh giá`;
}

function reviewRatingText(rating: number): string {
  return `${ratingFormatter.format(rating)} trên 5`;
}

function ReviewImageView({
  image,
  index,
  count,
  authorName,
  placeName,
}: {
  image: ReviewImage;
  index: number;
  count: number;
  authorName: string;
  placeName: string;
}) {
  const [failed, setFailed] = useState(false);
  const alt = `Ảnh ${index + 1} trong ${count} do ${authorName} đăng cho ${placeName}`;

  if (failed) {
    return (
      <div
        className="review-image-fallback"
        role="img"
        aria-label={`${alt}. Ảnh hiện không tải được.`}
      >
        <span aria-hidden="true">Ảnh không khả dụng</span>
      </div>
    );
  }

  return (
    <img
      src={image.url}
      alt={alt}
      width={image.width}
      height={image.height}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function ReviewCard({
  review,
  placeName,
}: {
  review: Review;
  placeName: string;
}) {
  const wasEdited =
    Date.parse(review.updated_at) > Date.parse(review.created_at) + 1_000;

  return (
    <article className="review-card">
      <header className="review-card-header">
        <div>
          <h3>{review.author_name}</h3>
          <p>
            <time dateTime={review.created_at}>
              {dateFormatter.format(new Date(review.created_at))}
            </time>
            {wasEdited ? <span> · Đã chỉnh sửa</span> : null}
          </p>
        </div>
        <p className="review-overall-rating">
          <span aria-hidden="true">★</span>
          <span>{reviewRatingText(review.overall_rating)}</span>
        </p>
      </header>

      <dl className="review-criteria">
        <div>
          <dt>Không gian</dt>
          <dd>{review.space_rating} trên 5</dd>
        </div>
        <div>
          <dt>Đồ ăn &amp; thức uống</dt>
          <dd>{review.food_drink_rating} trên 5</dd>
        </div>
        <div>
          <dt>Giá trị</dt>
          <dd>{review.value_rating} trên 5</dd>
        </div>
      </dl>

      <p className="review-content">{review.content}</p>

      {review.images.length > 0 ? (
        <ul
          className="review-images"
          aria-label={`Ảnh trong đánh giá của ${review.author_name}`}
        >
          {review.images.map((image, index) => (
            <li key={`${image.id}:${image.url}`}>
              <ReviewImageView
                image={image}
                index={index}
                count={review.images.length}
                authorName={review.author_name}
                placeName={placeName}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function PlaceDetailPage() {
  const { placeId: rawPlaceId } = useParams<{ placeId: string }>();
  const location = useLocation();
  const placeId = useMemo(() => parsePlaceId(rawPlaceId), [rawPlaceId]);
  const returnTo = placeListReturnTo(location.state);

  const [placeAttempt, setPlaceAttempt] = useState(0);
  const placeRequestKey = `${rawPlaceId ?? "missing"}:${placeAttempt}`;
  const [placeResult, setPlaceResult] = useState<PlaceResult | null>(null);

  const [reviewsAttempt, setReviewsAttempt] = useState(0);
  const reviewsRequestKey = `${rawPlaceId ?? "missing"}:${reviewsAttempt}`;
  const [reviewsResult, setReviewsResult] =
    useState<ReviewsResult | null>(null);
  const [loadMoreResult, setLoadMoreResult] = useState<LoadMoreResult>({
    key: "",
    status: "idle",
    error: null,
    announcement: "",
  });
  const loadMoreController = useRef<AbortController | null>(null);
  const loadMoreInFlight = useRef(false);
  const activeReviewsKey = useRef(reviewsRequestKey);

  const visiblePlaceResult =
    placeResult?.key === placeRequestKey ? placeResult : null;
  const placeStatus =
    placeId === null
      ? "not-found"
      : visiblePlaceResult?.status ?? "loading";
  const place =
    visiblePlaceResult?.status === "success"
      ? visiblePlaceResult.place
      : null;

  const visibleReviewsResult =
    reviewsResult?.key === reviewsRequestKey ? reviewsResult : null;
  const reviewsStatus =
    placeId === null
      ? "not-found"
      : visibleReviewsResult?.status ?? "loading";
  const reviewPage =
    visibleReviewsResult?.status === "success"
      ? visibleReviewsResult.page
      : null;
  const visibleLoadMoreResult =
    loadMoreResult.key === reviewsRequestKey
      ? loadMoreResult
      : {
          key: reviewsRequestKey,
          status: "idle" as const,
          error: null,
          announcement: "",
        };

  useEffect(() => {
    if (placeId === null) {
      return;
    }

    const controller = new AbortController();
    const requestKey = placeRequestKey;

    void placesClient.getPlace(placeId, controller.signal).then(
      (incoming) => {
        if (controller.signal.aborted) {
          return;
        }

        setPlaceResult({
          key: requestKey,
          status: "success",
          place: incoming,
          error: null,
        });
      },
      (error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setPlaceResult({
          key: requestKey,
          status:
            error instanceof ApiError && error.status === 404
              ? "not-found"
              : "error",
          place: null,
          error: requestErrorMessage(error, "place"),
        });
      },
    );

    return () => controller.abort();
  }, [placeId, placeRequestKey]);

  useEffect(() => {
    if (placeId === null) {
      return;
    }

    const controller = new AbortController();
    const requestKey = reviewsRequestKey;
    activeReviewsKey.current = requestKey;
    loadMoreController.current?.abort();
    loadMoreInFlight.current = false;

    void reviewsClient
      .listReviews(placeId, {
        limit: 8,
        signal: controller.signal,
      })
      .then(
        (incoming) => {
          if (controller.signal.aborted) {
            return;
          }

          setReviewsResult({
            key: requestKey,
            status: "success",
            page: incoming,
            error: null,
          });
        },
        (error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          setReviewsResult({
            key: requestKey,
            status:
              error instanceof ApiError && error.status === 404
                ? "not-found"
                : "error",
            page: null,
            error: requestErrorMessage(error, "reviews"),
          });
        },
      );

    return () => {
      controller.abort();
      loadMoreController.current?.abort();
      loadMoreInFlight.current = false;
    };
  }, [placeId, reviewsRequestKey]);

  useEffect(() => {
    if (place === null) {
      return;
    }

    const titleName = place.name.replace(/\s+/gu, " ").trim().slice(0, 80);
    document.title = `${titleName} · LocalSpot`;
  }, [place]);

  async function loadMoreReviews() {
    const cursor = reviewPage?.next_cursor;

    if (
      placeId === null ||
      cursor === null ||
      cursor === undefined ||
      loadMoreInFlight.current
    ) {
      return;
    }

    const requestKey = reviewsRequestKey;
    const controller = new AbortController();
    loadMoreController.current?.abort();
    loadMoreController.current = controller;
    loadMoreInFlight.current = true;
    setLoadMoreResult({
      key: requestKey,
      status: "loading",
      error: null,
      announcement: "Đang tải thêm đánh giá.",
    });

    try {
      const incoming = await reviewsClient.listReviews(placeId, {
        cursor,
        limit: 8,
        signal: controller.signal,
      });

      if (
        controller.signal.aborted ||
        activeReviewsKey.current !== requestKey
      ) {
        return;
      }

      setReviewsResult((current) =>
        current?.key === requestKey &&
        current.status === "success" &&
        current.page !== null
          ? {
              ...current,
              page: mergeReviewPages(current.page, incoming, true),
            }
          : current,
      );
      setLoadMoreResult({
        key: requestKey,
        status: "success",
        error: null,
        announcement:
          incoming.items.length === 0
            ? "Không còn đánh giá mới để tải."
            : `Đã tải thêm ${incoming.items.length} đánh giá.`,
      });
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        return;
      }

      setLoadMoreResult({
        key: requestKey,
        status: "error",
        error: requestErrorMessage(error, "reviews"),
        announcement: "Tải thêm đánh giá thất bại.",
      });
    } finally {
      if (loadMoreController.current === controller) {
        loadMoreController.current = null;
        loadMoreInFlight.current = false;
      }
    }
  }

  const pageHeading =
    placeStatus === "success" && place !== null
      ? place.name
      : placeStatus === "loading"
        ? "Đang tải địa điểm…"
        : placeStatus === "not-found"
          ? "Không tìm thấy địa điểm này."
          : "Chưa thể tải địa điểm.";

  const reviewsAnnouncement =
    visibleLoadMoreResult.announcement ||
    (reviewsStatus === "loading"
      ? "Đang tải đánh giá."
      : reviewsStatus === "success" && reviewPage !== null
        ? reviewPage.items.length === 0
          ? "Địa điểm chưa có đánh giá."
          : `Đang hiển thị ${reviewPage.items.length} đánh giá.`
        : reviewsStatus === "error" || reviewsStatus === "not-found"
          ? "Tải đánh giá thất bại."
          : "");

  return (
    <main id="main-content" className="place-detail-page">
      <nav className="place-detail-breadcrumb" aria-label="Đường dẫn">
        <Link to={returnTo}>← Quay lại danh sách địa điểm</Link>
      </nav>

      <header className="place-detail-header">
        <p className="eyebrow">LOCALSPOT DETAIL</p>
        <h1 data-route-heading tabIndex={-1}>
          {pageHeading}
        </h1>
        {place ? <p className="place-detail-address">{place.address}</p> : null}
      </header>

      {placeStatus === "loading" ? (
        <div className="place-detail-state">
          <span className="places-spinner" aria-hidden="true" />
          <p>LocalSpot đang tải thông tin và đánh giá của địa điểm.</p>
        </div>
      ) : null}

      {placeStatus === "not-found" ? (
        <div className="place-detail-state place-detail-state--error">
          <p>Địa điểm có thể không tồn tại hoặc đã ngừng hiển thị.</p>
          <Link to={returnTo}>Xem các địa điểm khác</Link>
        </div>
      ) : null}

      {placeStatus === "error" ? (
        <div className="place-detail-state place-detail-state--error" role="alert">
          <p>{visiblePlaceResult?.error}</p>
          <button
            type="button"
            onClick={() => setPlaceAttempt((attempt) => attempt + 1)}
          >
            Thử tải lại địa điểm
          </button>
        </div>
      ) : null}

      {placeStatus === "success" && place ? (
        <>
          <section className="place-summary" aria-labelledby="place-overview-title">
            <div className="place-description">
              <h2 id="place-overview-title">Về địa điểm</h2>
              <p>{place.description}</p>
            </div>

            <dl className="place-metadata">
              <div>
                <dt>Khoảng giá</dt>
                <dd>{formatPriceRange(place)}</dd>
              </div>
              <div>
                <dt>Đánh giá cộng đồng</dt>
                <dd>
                  <span aria-hidden="true">★ </span>
                  {aggregateRatingText(place)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="place-reviews-section" aria-labelledby="reviews-title">
            <div className="place-reviews-heading">
              <div>
                <p className="eyebrow">REAL EXPERIENCES</p>
                <h2 id="reviews-title">Đánh giá cộng đồng</h2>
              </div>
              {reviewsStatus === "success" && reviewPage ? (
                <p>{`Đang hiển thị ${reviewPage.items.length} đánh giá`}</p>
              ) : null}
            </div>

            <p className="visually-hidden" role="status" aria-live="polite">
              {reviewsAnnouncement}
            </p>

            {reviewsStatus === "loading" ? (
              <div className="reviews-state-card">
                <span className="places-spinner" aria-hidden="true" />
                <p>Đang tải đánh giá mới nhất.</p>
              </div>
            ) : null}

            {reviewsStatus === "error" || reviewsStatus === "not-found" ? (
              <div className="reviews-state-card reviews-state-card--error" role="alert">
                <div>
                  <h3>Chưa thể tải đánh giá</h3>
                  <p>
                    {reviewsStatus === "not-found"
                      ? "Địa điểm vừa không còn khả dụng."
                      : visibleReviewsResult?.error}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setReviewsAttempt((attempt) => attempt + 1)
                    }
                  >
                    Thử tải lại đánh giá
                  </button>
                </div>
              </div>
            ) : null}

            {reviewsStatus === "success" && reviewPage?.items.length === 0 ? (
              <div className="reviews-state-card">
                <p>Chưa có đánh giá nào cho địa điểm này.</p>
              </div>
            ) : null}

            {reviewsStatus === "success" &&
            reviewPage &&
            reviewPage.items.length > 0 ? (
              <>
                <ul
                  className="reviews-list"
                  id="place-reviews"
                  aria-busy={visibleLoadMoreResult.status === "loading"}
                >
                  {reviewPage.items.map((review) => (
                    <li key={review.id}>
                      <ReviewCard review={review} placeName={place.name} />
                    </li>
                  ))}
                </ul>

                <div className="reviews-pagination">
                  {visibleLoadMoreResult.error ? (
                    <p role="alert">{visibleLoadMoreResult.error}</p>
                  ) : null}
                  <button
                    type="button"
                    aria-controls="place-reviews"
                    aria-disabled={
                      reviewPage.next_cursor === null ||
                      visibleLoadMoreResult.status === "loading"
                    }
                    onClick={() => void loadMoreReviews()}
                  >
                    {visibleLoadMoreResult.status === "loading"
                      ? "Đang tải thêm…"
                      : reviewPage.next_cursor === null
                        ? "Đã hiển thị tất cả đánh giá"
                        : visibleLoadMoreResult.status === "error"
                          ? "Thử tải lại"
                          : "Xem thêm đánh giá"}
                  </button>
                </div>
              </>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  );
}
