import {
  Link,
  NavLink,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";

import { useAuth } from "./auth/auth-context";
import {
  AccountPage,
  AuthPage,
  HomePage,
  NotFoundPage,
  RequireAuth,
  RouteEffects,
} from "./routes";

function navigationClass({
  isActive,
}: {
  isActive: boolean;
}): string {
  return isActive
    ? "navigation-link navigation-link--active"
    : "navigation-link";
}

function AppLayout() {
  const auth = useAuth();

  return (
    <div className="page-shell">
      <a className="skip-link" href="#main-content">
        Bỏ qua tới nội dung chính
      </a>

      <header className="site-header">
        <Link className="brand" to="/" aria-label="LocalSpot home">
          <span className="brand-mark" aria-hidden="true">
            LS
          </span>
          <span>LocalSpot</span>
        </Link>

        <nav className="site-navigation" aria-label="Điều hướng chính">
          <NavLink className={navigationClass} end to="/">
            Trang chủ
          </NavLink>

          {auth.status === "authenticated" ? (
            <NavLink className={navigationClass} to="/account">
              Tài khoản
            </NavLink>
          ) : null}

          {auth.status === "anonymous" || auth.status === "error" ? (
            <>
              <NavLink className={navigationClass} to="/login">
                Đăng nhập
              </NavLink>
              <NavLink className={navigationClass} to="/register">
                Đăng ký
              </NavLink>
            </>
          ) : null}

          {auth.status === "loading" ? (
            <span className="navigation-status" role="status">
              Đang kiểm tra phiên
            </span>
          ) : null}
        </nav>
      </header>

      <RouteEffects />
      <Outlet />

      <footer className="site-footer">
        <span>
          FastAPI · PostgreSQL · Redis · S3-compatible storage
        </span>
        <span>LocalSpot web</span>
      </footer>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="register" element={<AuthPage mode="register" />} />

        <Route element={<RequireAuth />}>
          <Route path="account" element={<AccountPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
