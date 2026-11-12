import { useEffect, useState } from "react";
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
} from "react-router-dom";

import { AuthPanel } from "./auth/AuthPanel";
import type { AuthMode } from "./auth/auth-form";
import { useAuth } from "./auth/auth-context";
import {
  locationToReturnTo,
  noticeFromState,
  returnToFromState,
} from "./routing/return-location";

interface PageHeroProps {
  eyebrow: string;
  title: string;
  description: string;
}

interface AuthPageProps {
  mode: AuthMode;
}

interface ProtectedOutletContext {
  beginLogout: () => void;
}

function PageHero({
  eyebrow,
  title,
  description,
}: PageHeroProps) {
  return (
    <section className="hero" aria-labelledby="route-title">
      <p className="eyebrow">{eyebrow}</p>
      <h1 id="route-title" data-route-heading tabIndex={-1}>
        {title}
      </h1>
      <p className="hero-copy">{description}</p>
      <ul className="feature-list" aria-label="LocalSpot features">
        <li>Không gian</li>
        <li>Đồ ăn &amp; thức uống</li>
        <li>Giá trị</li>
      </ul>
    </section>
  );
}

function emailFromState(state: unknown): string {
  if (typeof state !== "object" || state === null) {
    return "";
  }

  const email = Reflect.get(state, "email");

  return typeof email === "string" && email.length <= 254
    ? email
    : "";
}

function modePath(mode: AuthMode): string {
  return mode === "login" ? "/login" : "/register";
}

function pageTitle(pathname: string): string {
  if (pathname === "/") {
    return "LocalSpot · Review địa điểm local";
  }

  if (pathname === "/login") {
    return "Đăng nhập · LocalSpot";
  }

  if (pathname === "/register") {
    return "Đăng ký · LocalSpot";
  }

  if (pathname === "/account") {
    return "Tài khoản · LocalSpot";
  }

  return "Không tìm thấy trang · LocalSpot";
}

export function RouteEffects() {
  const location = useLocation();
  const auth = useAuth();

  useEffect(() => {
    document.title = pageTitle(location.pathname);
    window.scrollTo(0, 0);

    const frame = requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>("[data-route-heading]")
        ?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [auth.status, location.pathname]);

  return null;
}

export function HomePage() {
  const navigate = useNavigate();

  return (
    <main id="main-content" className="main-content">
      <PageHero
        eyebrow="LOCAL REVIEWS · REAL PLACES"
        title="Tìm đúng quán từ những trải nghiệm thật."
        description="Khám phá quán cà phê và địa điểm ăn uống địa phương qua đánh giá đa tiêu chí, hình ảnh thực tế và bộ lọc phù hợp nhu cầu."
      />

      <AuthPanel
        onModeChange={(mode) => navigate(modePath(mode))}
        onAuthenticated={() => navigate("/account")}
      />
    </main>
  );
}

export function AuthPage({ mode }: AuthPageProps) {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = returnToFromState(location.state);
  const notice = noticeFromState(location.state);
  const initialEmail = emailFromState(location.state);

  useEffect(() => {
    if (
      notice === null ||
      auth.status === "authenticated"
    ) {
      return;
    }

    navigate(location.pathname, {
      replace: true,
      state:
        initialEmail.length > 0
          ? { returnTo, email: initialEmail }
          : { returnTo },
    });
  }, [
    auth.status,
    initialEmail,
    location.pathname,
    navigate,
    notice,
    returnTo,
  ]);

  if (auth.status === "authenticated") {
    return <Navigate replace to={returnTo} />;
  }

  function changeMode(nextMode: AuthMode) {
    navigate(modePath(nextMode), {
      state: { returnTo },
    });
  }

  return (
    <main id="main-content" className="main-content">
      <PageHero
        eyebrow={mode === "login" ? "WELCOME BACK" : "JOIN LOCALSPOT"}
        title={
          mode === "login"
            ? "Quay lại những địa điểm bạn yêu thích."
            : "Bắt đầu chia sẻ trải nghiệm local."
        }
        description={
          mode === "login"
            ? "Đăng nhập để tiếp tục viết review, quản lý hình ảnh và lưu lại những địa điểm đáng nhớ."
            : "Tạo tài khoản để chấm điểm đa tiêu chí và giúp cộng đồng tìm được những quán phù hợp."
        }
      />

      <AuthPanel
        key={mode}
        initialMode={mode}
        initialEmail={initialEmail}
        initialNotice={notice}
        onModeChange={changeMode}
        onAuthenticated={() => navigate(returnTo, { replace: true })}
        onRegistrationLoginFailure={({ email, message }) =>
          navigate("/login", {
            replace: true,
            state: {
              returnTo,
              email,
              notice: message,
            },
          })
        }
      />
    </main>
  );
}

export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();
  const [allowAnonymousTransition, setAllowAnonymousTransition] =
    useState(false);

  if (auth.status === "loading" || auth.status === "error") {
    return (
      <main id="main-content" className="route-state-page">
        <h1 className="visually-hidden" data-route-heading tabIndex={-1}>
          Kiểm tra phiên đăng nhập
        </h1>
        <AuthPanel />
      </main>
    );
  }

  if (
    auth.status === "anonymous" &&
    !allowAnonymousTransition
  ) {
    return (
      <Navigate
        replace
        to="/login"
        state={{ returnTo: locationToReturnTo(location) }}
      />
    );
  }

  return (
    <Outlet
      context={{
        beginLogout: () => setAllowAnonymousTransition(true),
      } satisfies ProtectedOutletContext}
    />
  );
}

export function AccountPage() {
  const navigate = useNavigate();
  const { beginLogout } =
    useOutletContext<ProtectedOutletContext>();

  return (
    <main id="main-content" className="main-content main-content--account">
      <PageHero
        eyebrow="YOUR LOCALSPOT ACCOUNT"
        title="Quản lý phiên đăng nhập của bạn."
        description="Kiểm tra tài khoản hiện tại và kết thúc phiên an toàn trên thiết bị này."
      />

      <AuthPanel
        onLogoutStart={beginLogout}
        onLogoutSettled={({ notice }) => {
          navigate("/login", {
            replace: true,
            state: { notice },
          });
        }}
      />
    </main>
  );
}

export function NotFoundPage() {
  return (
    <main id="main-content" className="not-found-page">
      <p className="eyebrow">404 · LOST SPOT</p>
      <h1 data-route-heading tabIndex={-1}>
        Không tìm thấy trang này.
      </h1>
      <p>
        Đường dẫn có thể đã thay đổi hoặc không tồn tại trong LocalSpot.
      </p>
      <Link className="primary-link" to="/">
        Về trang chủ
      </Link>
    </main>
  );
}
