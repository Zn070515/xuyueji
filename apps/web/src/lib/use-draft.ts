import { useCallback, useEffect, useState } from "react";

import { loadDraft, saveDraft } from "./local-db.js";

export function useDraft(conversationId: string) {
  const [draft, setDraftValue] = useState("");
  const [localState, setLocalState] = useState<"loading" | "saved" | "unavailable">("loading");

  useEffect(() => {
    let active = true;
    loadDraft(conversationId)
      .then((stored) => {
        if (active && stored) {
          setDraftValue(stored.content);
          setLocalState("saved");
        } else if (active) {
          setLocalState("saved");
        }
      })
      .catch(() => {
        if (active) {
          setLocalState("unavailable");
        }
      });
    return () => {
      active = false;
    };
  }, [conversationId]);

  const setDraft = useCallback(
    (value: string) => {
      setDraftValue(value);
      saveDraft(conversationId, value)
        .then(() => setLocalState("saved"))
        .catch(() => setLocalState("unavailable"));
    },
    [conversationId],
  );

  return { draft, setDraft, localState };
}
