import { AuthPanel } from "./auth/AuthPanel";

function App() {
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

        <AuthPanel />
      </main>

      <footer className="site-footer">
        <span>
          FastAPI · PostgreSQL · Redis · S3-compatible storage
        </span>
        <span>LocalSpot authentication</span>
      </footer>
    </div>
  );
}

export default App;
