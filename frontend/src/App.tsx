import { useEffect, useState } from "react";

import {
  API_BASE_URL,
  getReadiness,
  type DependencyName,
  type HealthStatus,
  type ReadinessResponse,
} from "./lib/api";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: ReadinessResponse }
  | { kind: "error"; message: string };

type ServiceKey = "api" | DependencyName;

const services: ReadonlyArray<{
  key: ServiceKey;
  label: string;
  description: string;
}> = [
  {
    key: "api",
    label: "FastAPI",
    description: "REST API",
  },
  {
    key: "postgres",
    label: "PostgreSQL",
    description: "Primary database",
  },
  {
    key: "redis",
    label: "Redis",
    description: "Rate limiting",
  },
  {
    key: "storage",
    label: "Object Storage",
    description: "Review images",
  },
];

function statusForService(
  state: LoadState,
  service: ServiceKey,
): HealthStatus | "checking" {
  if (state.kind === "loading") {
    return "checking";
  }

  if (state.kind === "error") {
    return "unavailable";
  }

  if (service === "api") {
    return state.data.status;
  }

  return state.data.checks[service];
}

function statusLabel(status: HealthStatus | "checking"): string {
  if (status === "ok") {
    return "Online";
  }

  if (status === "checking") {
    return "Checking";
  }

  return "Unavailable";
}

function App() {
  const [attempt, setAttempt] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({
    kind: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();

    void getReadiness(controller.signal)
      .then((data) => {
        setLoadState({ kind: "ready", data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Backend readiness check failed",
        });
      });

    return () => {
      controller.abort();
    };
  }, [attempt]);

  function retryReadinessCheck() {
    setLoadState({ kind: "loading" });
    setAttempt((value) => value + 1);
  }

  return (
    <div className="page-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="LocalSpot home">
          <span className="brand-mark" aria-hidden="true">
            LS
          </span>
          <span>LocalSpot</span>
        </a>

        <span className="environment-badge">Development</span>
      </header>

      <main className="main-content">
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">LOCAL REVIEWS · REAL PLACES</p>

          <h1 id="hero-title">
            Tìm đúng quán từ những trải nghiệm thật.
          </h1>

          <p className="hero-copy">
            Khám phá quán cà phê và địa điểm ăn uống địa phương qua đánh giá
            đa tiêu chí, hình ảnh thực tế và bộ lọc phù hợp nhu cầu.
          </p>

          <ul className="feature-list" aria-label="LocalSpot features">
            <li>Không gian</li>
            <li>Đồ ăn &amp; thức uống</li>
            <li>Giá trị</li>
          </ul>
        </section>

        <section className="status-card" aria-labelledby="status-title">
          <div className="status-card-header">
            <div>
              <p className="status-kicker">DEVELOPMENT ENVIRONMENT</p>
              <h2 id="status-title">Backend status</h2>
            </div>

            <button
              className="retry-button"
              type="button"
              onClick={retryReadinessCheck}
              disabled={loadState.kind === "loading"}
            >
              {loadState.kind === "loading"
                ? "Đang kiểm tra"
                : "Kiểm tra lại"}
            </button>
          </div>

          <div className="service-list" aria-live="polite">
            {services.map((service) => {
              const status = statusForService(
                loadState,
                service.key,
              );

              return (
                <div className="service-row" key={service.key}>
                  <span
                    className={`status-dot status-dot--${status}`}
                    aria-hidden="true"
                  />

                  <span className="service-name">
                    <strong>{service.label}</strong>
                    <small>{service.description}</small>
                  </span>

                  <span
                    className={`status-label status-label--${status}`}
                  >
                    {statusLabel(status)}
                  </span>
                </div>
              );
            })}
          </div>

          {loadState.kind === "error" ? (
            <p className="error-message" role="alert">
              {loadState.message}. Kiểm tra API tại {API_BASE_URL}.
            </p>
          ) : null}

          <p className="api-endpoint">
            API endpoint <code>{API_BASE_URL}</code>
          </p>
        </section>
      </main>

      <footer className="site-footer">
        <span>
          FastAPI · PostgreSQL · Redis · S3-compatible storage
        </span>
        <span>LocalSpot foundation</span>
      </footer>
    </div>
  );
}

export default App;
