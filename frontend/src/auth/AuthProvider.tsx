import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AuthContext,
  type AuthContextValue,
  type AuthState,
  RegistrationLoginError,
} from "./auth-context";
import {
  type ApiClient,
  ApiContractError,
  ApiError,
  type LoginInput,
  type RegisterInput,
  type User,
} from "../lib/auth-client";
import { authClient } from "../lib/auth";

type AuthClient = Pick<
  ApiClient,
  "bootstrapSession" | "login" | "logout" | "register"
>;

type AuthProviderProps = PropsWithChildren<{
  client?: AuthClient;
}>;

const initialState: AuthState = {
  status: "loading",
  user: null,
  bootstrapError: null,
};

function bootstrapErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail;
  }

  if (
    error instanceof Error &&
    error.message.trim().length > 0
  ) {
    return error.message;
  }

  return "Unable to restore the authentication session";
}

export function AuthProvider({
  children,
  client = authClient,
}: AuthProviderProps) {
  const [state, setState] =
    useState<AuthState>(initialState);
  const [bootstrapAttempt, setBootstrapAttempt] =
    useState(0);
  const mountedRef = useRef(false);
  const operationIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      operationIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const operationId = operationIdRef.current + 1;
    operationIdRef.current = operationId;
    let ignoreResult = false;

    void client.bootstrapSession().then(
      (user) => {
        if (
          ignoreResult ||
          !mountedRef.current ||
          operationId !== operationIdRef.current
        ) {
          return;
        }

        if (user === null) {
          setState({
            status: "anonymous",
            user: null,
            bootstrapError: null,
          });
          return;
        }

        setState({
          status: "authenticated",
          user,
          bootstrapError: null,
        });
      },
      (error: unknown) => {
        if (
          ignoreResult ||
          !mountedRef.current ||
          operationId !== operationIdRef.current
        ) {
          return;
        }

        setState({
          status: "error",
          user: null,
          bootstrapError: bootstrapErrorMessage(error),
        });
      },
    );

    return () => {
      ignoreResult = true;
    };
  }, [bootstrapAttempt, client]);

  const login = useCallback(
    async (input: LoginInput): Promise<User> => {
      const operationId = operationIdRef.current + 1;
      operationIdRef.current = operationId;

      const user = await client.login(input);

      if (
        mountedRef.current &&
        operationId === operationIdRef.current
      ) {
        setState({
          status: "authenticated",
          user,
          bootstrapError: null,
        });
      }

      return user;
    },
    [client],
  );

  const register = useCallback(
    async (input: RegisterInput): Promise<User> => {
      const operationId = operationIdRef.current + 1;
      operationIdRef.current = operationId;

      const registeredUser = await client.register(input);

      if (operationId !== operationIdRef.current) {
        throw new ApiContractError(
          "Registration request was superseded",
        );
      }

      let user: User;

      try {
        user = await client.login({
          email: input.email,
          password: input.password,
        });
      } catch (error: unknown) {
        throw new RegistrationLoginError(
          registeredUser,
          error,
        );
      }

      if (
        mountedRef.current &&
        operationId === operationIdRef.current
      ) {
        setState({
          status: "authenticated",
          user,
          bootstrapError: null,
        });
      }

      return user;
    },
    [client],
  );

  const logout = useCallback(async (): Promise<void> => {
    const operationId = operationIdRef.current + 1;
    operationIdRef.current = operationId;

    try {
      await client.logout();
    } finally {
      if (
        mountedRef.current &&
        operationId === operationIdRef.current
      ) {
        setState({
          status: "anonymous",
          user: null,
          bootstrapError: null,
        });
      }
    }
  }, [client]);

  const retryBootstrap = useCallback(() => {
    operationIdRef.current += 1;
    setState(initialState);
    setBootstrapAttempt((attempt) => attempt + 1);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      register,
      logout,
      retryBootstrap,
    }),
    [login, logout, register, retryBootstrap, state],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}