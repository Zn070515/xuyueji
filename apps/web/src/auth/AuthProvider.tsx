import type { AuthConfigResponse, AuthSessionResponse } from "@xuyueji/contracts";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { fetchAuthConfig, fetchMe, login, logout, logoutAll, register } from "./auth-api.js";

export type AuthState =
  | { readonly status: "loading" }
  | { readonly status: "unavailable"; readonly message: string }
  | { readonly status: "anonymous"; readonly config: AuthConfigResponse }
  | {
      readonly status: "authenticated";
      readonly config: AuthConfigResponse;
      readonly session: AuthSessionResponse;
    };

export interface AuthContextValue {
  readonly state: AuthState;
  readonly refresh: () => Promise<void>;
  readonly signIn: (email: string, password: string) => Promise<void>;
  readonly signUp: (input: {
    email: string;
    password: string;
    displayName: string;
    ageConfirmed: true;
  }) => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly signOutAll: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const [config, session] = await Promise.all([fetchAuthConfig(), fetchMe()]);
      setState(
        session ? { status: "authenticated", config, session } : { status: "anonymous", config },
      );
    } catch (error) {
      setState({
        status: "unavailable",
        message:
          error instanceof Error
            ? error.message
            : "云端账号服务未连接（可能未配置 DATABASE_URL）。",
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const [config, session] = await Promise.all([fetchAuthConfig(), login({ email, password })]);
    setState({ status: "authenticated", config, session });
  }, []);

  const signUp = useCallback(
    async (input: { email: string; password: string; displayName: string; ageConfirmed: true }) => {
      const [config, session] = await Promise.all([fetchAuthConfig(), register(input)]);
      setState({ status: "authenticated", config, session });
    },
    [],
  );

  const signOut = useCallback(async () => {
    await logout();
    await refresh();
  }, [refresh]);

  const signOutAll = useCallback(async () => {
    await logoutAll();
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ state, refresh, signIn, signUp, signOut, signOutAll }),
    [state, refresh, signIn, signUp, signOut, signOutAll],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return value;
}
