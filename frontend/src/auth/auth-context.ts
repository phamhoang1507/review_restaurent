import { createContext, useContext } from "react";

import type {
  LoginInput,
  RegisterInput,
  User,
} from "../lib/auth-client";

export type AuthState =
  | {
      status: "loading";
      user: null;
      bootstrapError: null;
    }
  | {
      status: "anonymous";
      user: null;
      bootstrapError: null;
    }
  | {
      status: "authenticated";
      user: User;
      bootstrapError: null;
    }
  | {
      status: "error";
      user: null;
      bootstrapError: string;
    };

interface AuthActions {
  login: (input: LoginInput) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
  retryBootstrap: () => void;
}

export type AuthContextValue = AuthState & AuthActions;

export class RegistrationLoginError extends Error {
  readonly registeredUser: User;

  constructor(registeredUser: User, cause: unknown) {
    super(
      "Account created, but automatic login failed",
      { cause },
    );
    this.name = "RegistrationLoginError";
    this.registeredUser = registeredUser;
  }
}

export const AuthContext =
  createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error(
      "useAuth must be used within an AuthProvider",
    );
  }

  return context;
}