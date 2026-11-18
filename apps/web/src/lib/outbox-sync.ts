import type { SyncMutationEnvelope, SyncMutationResponse } from "@xuyueji/contracts";

import { requestJson } from "./http.js";
import {
  incrementOutboxAttempts,
  listPendingOutbox,
  markOutbox,
  pendingOutboxCount,
} from "./outbox.js";

export interface FlushOutboxResult {
  readonly accepted: number;
  readonly conflicts: number;
  readonly failed: number;
  readonly pending: number;
  readonly error: string | null;
}

/**
 * Manually deliver the local outbox to the server. The server keys on `opId`,
 * so a retry after a network error cannot apply the same mutation twice.
 * This function is deliberately explicit: callers decide when to sync and can
 * surface conflicts instead of pretending the local write reached the cloud.
 */
export async function flushOutbox(): Promise<FlushOutboxResult> {
  const items = await listPendingOutbox(50);
  if (items.length === 0) {
    return { accepted: 0, conflicts: 0, failed: 0, pending: 0, error: null };
  }

  const envelope: SyncMutationEnvelope = {
    mutations: items.map((item) => ({
      opId: item.opId,
      entityType: item.entityType as SyncMutationEnvelope["mutations"][number]["entityType"],
      entityId: item.entityId,
      expectedRevision: item.expectedRevision,
      action: item.action,
      payload: item.payload,
    })),
  };

  try {
    const response = await requestJson<SyncMutationResponse>("/api/mutations", {
      method: "POST",
      body: JSON.stringify(envelope),
    });

    let accepted = 0;
    let conflicts = 0;
    let failed = 0;
    for (const result of response.results) {
      const item = items.find((candidate) => candidate.opId === result.opId);
      if (!item) {
        continue;
      }
      if (result.status === "accepted") {
        await markOutbox(item.id, "accepted");
        accepted += 1;
      } else if (result.status === "conflict") {
        await markOutbox(item.id, "conflict", result.message ?? "version conflict");
        conflicts += 1;
      } else {
        await markOutbox(item.id, "failed", result.message ?? result.code ?? "rejected");
        failed += 1;
      }
    }

    return {
      accepted,
      conflicts,
      failed,
      pending: await pendingOutboxCount(),
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "outbox delivery failed";
    for (const item of items) {
      await incrementOutboxAttempts(item.id, message);
    }
    return {
      accepted: 0,
      conflicts: 0,
      failed: 0,
      pending: await pendingOutboxCount(),
      error: message,
    };
  }
}
