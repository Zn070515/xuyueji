import type {
  AuthConfigResponse,
  AuthSessionResponse,
  LoginRequest,
  RegisterRequest,
} from "@xuyueji/contracts";

import { ApiError, request, requestJson } from "../lib/http.js";

export function fetchAuthConfig(): Promise<AuthConfigResponse> {
  return requestJson<AuthConfigResponse>("/api/auth/config");
}

export async function fetchMe(): Promise<AuthSessionResponse | null> {
  try {
    return await requestJson<AuthSessionResponse>("/api/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function login(input: LoginRequest): Promise<AuthSessionResponse> {
  return requestJson<AuthSessionResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function register(input: RegisterRequest): Promise<AuthSessionResponse> {
  return requestJson<AuthSessionResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function logout(): Promise<void> {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) {
      throw error;
    }
  }
}

export async function logoutAll(): Promise<void> {
  await request("/api/auth/logout-all", { method: "POST" });
}
