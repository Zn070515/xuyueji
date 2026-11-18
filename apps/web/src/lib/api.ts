import type { ApiMeta } from "@xuyueji/contracts";

export interface DemoServerState {
  readonly demo: true;
  readonly reason: string;
  readonly character: {
    readonly id: string;
    readonly name: string;
    readonly activeVersionId: string;
    readonly versionCount: number;
  };
  readonly wallet: {
    readonly availablePoints: number;
    readonly reservedPoints: number;
    readonly paymentsEnabled: false;
  };
  readonly order: {
    readonly merchantTradeNo: string;
    readonly amountFen: number;
    readonly points: number;
    readonly status: string;
  };
  readonly ledgerEntries: number;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export function fetchApiMeta(signal?: AbortSignal): Promise<ApiMeta> {
  return getJson<ApiMeta>("/api/meta", signal);
}

export function fetchDemoState(signal?: AbortSignal): Promise<DemoServerState> {
  return getJson<DemoServerState>("/api/demo/state", signal);
}
