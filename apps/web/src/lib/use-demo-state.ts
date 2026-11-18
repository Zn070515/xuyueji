import { useEffect, useState } from "react";

import { type DemoServerState, fetchDemoState } from "./api.js";

export type DemoStateResult =
  | { readonly status: "loading" }
  | { readonly status: "connected"; readonly state: DemoServerState }
  | { readonly status: "offline"; readonly message: string };

export function useDemoState(): DemoStateResult {
  const [result, setResult] = useState<DemoStateResult>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetchDemoState(controller.signal)
      .then((state) => setResult({ status: "connected", state }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setResult({
          status: "offline",
          message: error instanceof Error ? error.message : "API 未连接",
        });
      });
    return () => controller.abort();
  }, []);

  return result;
}
