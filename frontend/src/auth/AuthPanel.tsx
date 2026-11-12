import {
  type FormEvent,
  useRef,
  useState,
} from "react";

import {
  authErrorMessage,
  type AuthFieldErrors,
  type AuthFormValues,
  type AuthMode,
  validateAuthForm,
} from "./auth-form";
import {
  RegistrationLoginError,
  useAuth,
} from "./auth-context";

type Feedback = {
  tone: "error" | "notice";
  message: string;
};

const emptyValues: AuthFormValues = {
  displayName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

function userInitials(displayName: string): string {
  const initials = displayName
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "LS";
}

export function AuthPanel() {
  const auth = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [values, setValues] =
    useState<AuthFormValues>(emptyValues);
  const [fieldErrors, setFieldErrors] =
    useState<AuthFieldErrors>({});
  const [feedback, setFeedback] =
    useState<Feedback | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requestInFlightRef = useRef(false);
  const displayNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const accountTitleRef = useRef<HTMLHeadingElement>(null);

  function focusFeedback() {
    requestAnimationFrame(() => {
      feedbackRef.current?.focus();
    });
  }

  function focusFirstInvalid(errors: AuthFieldErrors) {
    const fields =
      mode === "register"
        ? [
            ["displayName", displayNameRef],
            ["email", emailRef],
            ["password", passwordRef],
            ["confirmPassword", confirmPasswordRef],
          ] as const
        : [
            ["email", emailRef],
            ["password", passwordRef],
          ] as const;

    for (const [field, reference] of fields) {
      if (errors[field] !== undefined) {
        reference.current?.focus();
        return;
      }
    }
  }

  function changeMode(nextMode: AuthMode) {
    if (isSubmitting || nextMode === mode) {
      return;
    }

    setMode(nextMode);
    setFieldErrors({});
    setFeedback(null);
    setValues((current) => ({
      ...current,
      password: "",
      confirmPassword: "",
    }));

    requestAnimationFrame(() => {
      if (nextMode === "register") {
        displayNameRef.current?.focus();
        return;
      }

      emailRef.current?.focus();
    });
  }

  function updateField(
    field: keyof AuthFormValues,
    value: string,
  ) {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));

    if (fieldErrors[field] !== undefined) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }

    if (feedback !== null) {
      setFeedback(null);
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (requestInFlightRef.current) {
      return;
    }

    const validation = validateAuthForm(mode, values);

    setValues(validation.values);
    setFieldErrors(validation.errors);
    setFeedback(null);

    if (!validation.isValid) {
      focusFirstInvalid(validation.errors);
      return;
    }

    requestInFlightRef.current = true;
    setIsSubmitting(true);

    try {
      if (mode === "login") {
        await auth.login({
          email: validation.values.email,
          password: validation.values.password,
        });
      } else {
        await auth.register({
          display_name: validation.values.displayName,
          email: validation.values.email,
          password: validation.values.password,
        });
      }

      setValues(emptyValues);
      requestAnimationFrame(() => {
        accountTitleRef.current?.focus();
      });
    } catch (error: unknown) {
      if (error instanceof RegistrationLoginError) {
        setMode("login");
        setValues({
          ...emptyValues,
          email: error.registeredUser.email,
        });
        setFieldErrors({});
        setFeedback({
          tone: "notice",
          message: authErrorMessage("register", error),
        });

        requestAnimationFrame(() => {
          passwordRef.current?.focus();
        });
      } else {
        setFeedback({
          tone: "error",
          message: authErrorMessage(mode, error),
        });
        focusFeedback();
      }
    } finally {
      requestInFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    if (requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;
    setIsSubmitting(true);
    setFeedback(null);

    try {
      await auth.logout();
      setValues(emptyValues);
      requestAnimationFrame(() => {
        emailRef.current?.focus();
      });
    } catch {
      setFeedback({
        tone: "notice",
        message:
          "Phiên trên thiết bị đã được xóa, nhưng máy chủ chưa xác nhận đăng xuất. Vui lòng thử lại khi kết nối ổn định.",
      });
      focusFeedback();
    } finally {
      requestInFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  if (auth.status === "loading") {
    return (
      <section
        className="auth-card auth-state-card"
        aria-labelledby="auth-loading-title"
      >
        <span className="auth-spinner" aria-hidden="true" />
        <div role="status" aria-live="polite">
          <p className="auth-kicker">TÀI KHOẢN LOCALSPOT</p>
          <h2 id="auth-loading-title">Đang kiểm tra phiên đăng nhập</h2>
          <p className="auth-subtitle">
            LocalSpot đang khôi phục phiên an toàn của bạn.
          </p>
        </div>
      </section>
    );
  }

  if (auth.status === "error") {
    return (
      <section
        className="auth-card auth-state-card"
        aria-labelledby="auth-error-title"
      >
        <div className="auth-state-icon auth-state-icon--error" aria-hidden="true">
          !
        </div>
        <div>
          <p className="auth-kicker">TÀI KHOẢN LOCALSPOT</p>
          <h2 id="auth-error-title">Không thể kiểm tra phiên đăng nhập</h2>
          <p className="auth-subtitle" role="alert">
            {auth.bootstrapError}
          </p>
          <button
            className="auth-secondary-button"
            type="button"
            onClick={auth.retryBootstrap}
          >
            Thử lại
          </button>
        </div>
      </section>
    );
  }

  if (auth.status === "authenticated") {
    return (
      <section
        className="auth-card"
        aria-labelledby="account-title"
        aria-busy={isSubmitting}
      >
        <div className="auth-card-header">
          <div>
            <p className="auth-kicker">PHIÊN ĐĂNG NHẬP</p>
            <h2 ref={accountTitleRef} id="account-title" tabIndex={-1}>
              Xin chào, {auth.user.display_name}
            </h2>
            <p className="auth-subtitle">
              Tài khoản của bạn đã sẵn sàng để review các địa điểm local.
            </p>
          </div>
        </div>

        <div className="account-summary">
          <span className="account-avatar" aria-hidden="true">
            {userInitials(auth.user.display_name)}
          </span>
          <span className="account-details">
            <strong>{auth.user.display_name}</strong>
            <span>{auth.user.email}</span>
          </span>
          <span className="account-role">
            {auth.user.role === "admin" ? "Quản trị viên" : "Thành viên"}
          </span>
        </div>

        <div className="auth-card-footer">
          <p>
            Access token chỉ được giữ trong bộ nhớ của trình duyệt.
          </p>
          <button
            className="auth-secondary-button"
            type="button"
            onClick={() => void handleLogout()}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Đang đăng xuất…" : "Đăng xuất"}
          </button>
        </div>
      </section>
    );
  }

  const passwordDescription = [
    mode === "register" ? "auth-password-hint" : null,
    fieldErrors.password !== undefined
      ? "auth-password-error"
      : null,
  ]
    .filter((value): value is string => value !== null)
    .join(" ");

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-card-header">
        <div>
          <p className="auth-kicker">BẮT ĐẦU VỚI LOCALSPOT</p>
          <h2 id="auth-title">
            {mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
          </h2>
          <p className="auth-subtitle">
            {mode === "login"
              ? "Tiếp tục chia sẻ những trải nghiệm local đáng tin cậy."
              : "Tạo hồ sơ để chấm điểm và đăng ảnh review thực tế."}
          </p>
        </div>

        <div
          className="auth-mode-switch"
          role="group"
          aria-label="Chọn hình thức xác thực"
        >
          <button
            className="auth-mode-button"
            type="button"
            aria-pressed={mode === "login"}
            onClick={() => changeMode("login")}
            disabled={isSubmitting}
          >
            Đăng nhập
          </button>
          <button
            className="auth-mode-button"
            type="button"
            aria-pressed={mode === "register"}
            onClick={() => changeMode("register")}
            disabled={isSubmitting}
          >
            Đăng ký
          </button>
        </div>
      </div>

      <form
        className="auth-form"
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        aria-busy={isSubmitting}
      >
        {feedback !== null ? (
          <div
            ref={feedbackRef}
            className={`auth-feedback auth-feedback--${feedback.tone}`}
            role={feedback.tone === "error" ? "alert" : "status"}
            tabIndex={-1}
          >
            {feedback.message}
          </div>
        ) : null}

        {mode === "register" ? (
          <div className="form-field">
            <label htmlFor="auth-display-name">Tên hiển thị</label>
            <input
              ref={displayNameRef}
              id="auth-display-name"
              name="displayName"
              type="text"
              autoComplete="name"
              minLength={1}
              maxLength={100}
              required
              disabled={isSubmitting}
              value={values.displayName}
              aria-invalid={fieldErrors.displayName !== undefined}
              aria-describedby={
                fieldErrors.displayName !== undefined
                  ? "auth-display-name-error"
                  : undefined
              }
              onChange={(event) =>
                updateField("displayName", event.currentTarget.value)
              }
            />
            {fieldErrors.displayName !== undefined ? (
              <span className="field-error" id="auth-display-name-error">
                {fieldErrors.displayName}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="form-field">
          <label htmlFor="auth-email">Email</label>
          <input
            ref={emailRef}
            id="auth-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            required
            disabled={isSubmitting}
            value={values.email}
            aria-invalid={fieldErrors.email !== undefined}
            aria-describedby={
              fieldErrors.email !== undefined
                ? "auth-email-error"
                : undefined
            }
            onChange={(event) =>
              updateField("email", event.currentTarget.value)
            }
          />
          {fieldErrors.email !== undefined ? (
            <span className="field-error" id="auth-email-error">
              {fieldErrors.email}
            </span>
          ) : null}
        </div>

        <div className="form-field">
          <label htmlFor="auth-password">Mật khẩu</label>
          <input
            ref={passwordRef}
            id="auth-password"
            name="password"
            type="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            minLength={mode === "register" ? 12 : 1}
            maxLength={128}
            required
            disabled={isSubmitting}
            value={values.password}
            aria-invalid={fieldErrors.password !== undefined}
            aria-describedby={passwordDescription || undefined}
            onChange={(event) =>
              updateField("password", event.currentTarget.value)
            }
          />
          {mode === "register" ? (
            <span className="field-hint" id="auth-password-hint">
              Sử dụng từ 12 đến 128 ký tự.
            </span>
          ) : null}
          {fieldErrors.password !== undefined ? (
            <span className="field-error" id="auth-password-error">
              {fieldErrors.password}
            </span>
          ) : null}
        </div>

        {mode === "register" ? (
          <div className="form-field">
            <label htmlFor="auth-confirm-password">Nhập lại mật khẩu</label>
            <input
              ref={confirmPasswordRef}
              id="auth-confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              disabled={isSubmitting}
              value={values.confirmPassword}
              aria-invalid={fieldErrors.confirmPassword !== undefined}
              aria-describedby={
                fieldErrors.confirmPassword !== undefined
                  ? "auth-confirm-password-error"
                  : undefined
              }
              onChange={(event) =>
                updateField("confirmPassword", event.currentTarget.value)
              }
            />
            {fieldErrors.confirmPassword !== undefined ? (
              <span className="field-error" id="auth-confirm-password-error">
                {fieldErrors.confirmPassword}
              </span>
            ) : null}
          </div>
        ) : null}

        <button
          className="auth-submit-button"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? mode === "login"
              ? "Đang đăng nhập…"
              : "Đang tạo tài khoản…"
            : mode === "login"
              ? "Đăng nhập"
              : "Tạo tài khoản"}
        </button>
      </form>

      <p className="auth-security-note">
        Refresh token được bảo vệ bằng HttpOnly cookie; mật khẩu không được lưu ở
        frontend.
      </p>
    </section>
  );
}
