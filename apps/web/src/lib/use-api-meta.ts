import type { ApiMeta } from "@xuyueji/contracts";
import { useEffect, useState } from "react";

import { fetchApiMeta } from "./api.js";

export type ApiMetaState =
  | { readonly status: "loading" }
  | { readonly status: "connected"; readonly meta: ApiMeta }
  | { readonly status: "offline"; readonly message: string };

export function useApiMeta(): ApiMetaState {
  const [state, setState] = useState<ApiMetaState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetchApiMeta(controller.signal)
      .then((meta) => setState({ status: "connected", meta }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setState({
          status: "offline",
          message: error instanceof Error ? error.message : "API 未连接",
        });
      });
    return () => controller.abort();
  }, []);

  return state;
}
