import { ApiError } from "../lib/auth-client.ts";

export type AuthMode = "login" | "register";

export interface AuthFormValues {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export type AuthFieldErrors = Partial<
  Record<keyof AuthFormValues, string>
>;

export interface AuthFormValidation {
  values: AuthFormValues;
  errors: AuthFieldErrors;
  isValid: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function validateAuthForm(
  mode: AuthMode,
  values: AuthFormValues,
): AuthFormValidation {
  const normalizedValues: AuthFormValues = {
    displayName: values.displayName.trim(),
    email: values.email.trim().toLowerCase(),
    password: values.password,
    confirmPassword: values.confirmPassword,
  };

  const errors: AuthFieldErrors = {};

  if (mode === "register") {
    if (normalizedValues.displayName.length === 0) {
      errors.displayName = "Vui lòng nhập tên hiển thị.";
    } else if (normalizedValues.displayName.length > 100) {
      errors.displayName =
        "Tên hiển thị không được vượt quá 100 ký tự.";
    }
  }

  if (normalizedValues.email.length === 0) {
    errors.email = "Vui lòng nhập email.";
  } else if (normalizedValues.email.length > 254) {
    errors.email = "Email không được vượt quá 254 ký tự.";
  } else if (!EMAIL_PATTERN.test(normalizedValues.email)) {
    errors.email = "Email chưa đúng định dạng.";
  }

  if (normalizedValues.password.length === 0) {
    errors.password = "Vui lòng nhập mật khẩu.";
  } else if (normalizedValues.password.length > 128) {
    errors.password =
      "Mật khẩu không được vượt quá 128 ký tự.";
  } else if (
    mode === "register" &&
    normalizedValues.password.length < 12
  ) {
    errors.password = "Mật khẩu phải có ít nhất 12 ký tự.";
  }

  if (mode === "register") {
    if (normalizedValues.confirmPassword.length === 0) {
      errors.confirmPassword = "Vui lòng xác nhận mật khẩu.";
    } else if (
      normalizedValues.confirmPassword !==
      normalizedValues.password
    ) {
      errors.confirmPassword = "Mật khẩu xác nhận không khớp.";
    }
  }

  return {
    values: normalizedValues,
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

function retryAfterSeconds(value: string | null): number | null {
  if (value === null || !/^\d+$/u.test(value)) {
    return null;
  }

  const seconds = Number.parseInt(value, 10);

  return Number.isSafeInteger(seconds) && seconds > 0
    ? seconds
    : null;
}

function isRegistrationLoginError(
  error: unknown,
): error is Error & {
  registeredUser: { email: string };
} {
  if (!(error instanceof Error)) {
    return false;
  }

  const registeredUser = Reflect.get(
    error,
    "registeredUser",
  );

  return (
    error.name === "RegistrationLoginError" &&
    typeof registeredUser === "object" &&
    registeredUser !== null &&
    typeof Reflect.get(registeredUser, "email") === "string"
  );
}

export function authErrorMessage(
  mode: AuthMode,
  error: unknown,
): string {
  if (isRegistrationLoginError(error)) {
    return `Tài khoản ${error.registeredUser.email} đã được tạo, nhưng chưa thể đăng nhập tự động. Vui lòng đăng nhập lại.`;
  }

  if (error instanceof ApiError) {
    if (error.status === 401 && mode === "login") {
      return "Email hoặc mật khẩu không chính xác.";
    }

    if (error.status === 409 && mode === "register") {
      return "Email này đã được đăng ký. Vui lòng đăng nhập.";
    }

    if (error.status === 422) {
      return "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường.";
    }

    if (error.status === 429) {
      const seconds = retryAfterSeconds(error.retryAfter);

      return seconds === null
        ? "Bạn thao tác quá nhanh. Vui lòng thử lại sau."
        : `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${seconds} giây.`;
    }

    if (error.status === 503 || error.status >= 500) {
      return "Dịch vụ xác thực tạm thời không khả dụng. Vui lòng thử lại sau.";
    }

    return "Không thể hoàn tất yêu cầu xác thực. Vui lòng thử lại.";
  }

  return "Không thể kết nối tới dịch vụ xác thực. Vui lòng kiểm tra kết nối và thử lại.";
}
