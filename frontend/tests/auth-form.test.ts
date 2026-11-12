import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  authErrorMessage,
  type AuthFormValues,
  validateAuthForm,
} from "../src/auth/auth-form.ts";
import {
  ApiError,
  type User,
} from "../src/lib/auth-client.ts";

const validValues: AuthFormValues = {
  displayName: "LocalSpot User",
  email: "user@example.com",
  password: "correct-password",
  confirmPassword: "correct-password",
};

const registeredUser: User = {
  id: 42,
  email: "user@example.com",
  display_name: "LocalSpot User",
  role: "user",
  is_active: true,
  created_at: "2026-11-12T00:00:00Z",
};

describe("validateAuthForm", () => {
  it("normalizes valid registration values", () => {
    const result = validateAuthForm("register", {
      ...validValues,
      displayName: "  LocalSpot User  ",
      email: "  USER@EXAMPLE.COM  ",
    });

    assert.equal(result.isValid, true);
    assert.deepEqual(result.errors, {});
    assert.equal(
      result.values.displayName,
      "LocalSpot User",
    );
    assert.equal(result.values.email, "user@example.com");
  });

  it("validates every required registration field", () => {
    const result = validateAuthForm("register", {
      displayName: "   ",
      email: "invalid-email",
      password: "short",
      confirmPassword: "different",
    });

    assert.equal(result.isValid, false);
    assert.equal(
      result.errors.displayName,
      "Vui lòng nhập tên hiển thị.",
    );
    assert.equal(
      result.errors.email,
      "Email chưa đúng định dạng.",
    );
    assert.equal(
      result.errors.password,
      "Mật khẩu phải có ít nhất 12 ký tự.",
    );
    assert.equal(
      result.errors.confirmPassword,
      "Mật khẩu xác nhận không khớp.",
    );
  });

  it("accepts a short non-empty login password", () => {
    const result = validateAuthForm("login", {
      displayName: "",
      email: "user@example.com",
      password: "x",
      confirmPassword: "",
    });

    assert.equal(result.isValid, true);
    assert.deepEqual(result.errors, {});
  });

  it("enforces backend maximum lengths", () => {
    const result = validateAuthForm("register", {
      displayName: "x".repeat(101),
      email: `${"x".repeat(243)}@example.com`,
      password: "x".repeat(129),
      confirmPassword: "x".repeat(129),
    });

    assert.equal(result.isValid, false);
    assert.equal(
      result.errors.displayName,
      "Tên hiển thị không được vượt quá 100 ký tự.",
    );
    assert.equal(
      result.errors.email,
      "Email không được vượt quá 254 ký tự.",
    );
    assert.equal(
      result.errors.password,
      "Mật khẩu không được vượt quá 128 ký tự.",
    );
  });
});

describe("authErrorMessage", () => {
  it("maps invalid credentials and duplicate email", () => {
    assert.equal(
      authErrorMessage(
        "login",
        new ApiError(
          401,
          "Invalid email or password",
          null,
          null,
        ),
      ),
      "Email hoặc mật khẩu không chính xác.",
    );

    assert.equal(
      authErrorMessage(
        "register",
        new ApiError(
          409,
          "Email is already registered",
          null,
          null,
        ),
      ),
      "Email này đã được đăng ký. Vui lòng đăng nhập.",
    );
  });

  it("includes a numeric Retry-After value", () => {
    assert.equal(
      authErrorMessage(
        "login",
        new ApiError(429, "Too many requests", "37", null),
      ),
      "Bạn thao tác quá nhanh. Vui lòng thử lại sau 37 giây.",
    );
  });

  it("maps validation and unavailable responses", () => {
    assert.equal(
      authErrorMessage(
        "register",
        new ApiError(422, "Validation error", null, null),
      ),
      "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường.",
    );

    assert.equal(
      authErrorMessage(
        "login",
        new ApiError(503, "Unavailable", "5", null),
      ),
      "Dịch vụ xác thực tạm thời không khả dụng. Vui lòng thử lại sau.",
    );
  });

  it("reports completed registration when auto-login fails", () => {
    const error = Object.assign(
      new Error(
        "Account created, but automatic login failed",
        { cause: new TypeError("Failed to fetch") },
      ),
      {
        name: "RegistrationLoginError",
        registeredUser,
      },
    );

    assert.equal(
      authErrorMessage("register", error),
      "Tài khoản user@example.com đã được tạo, nhưng chưa thể đăng nhập tự động. Vui lòng đăng nhập lại.",
    );
  });
});
