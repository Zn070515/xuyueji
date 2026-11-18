import { describe, expect, it } from "vitest";

import {
  assertGenerationTransition,
  canTransitionGeneration,
  TERMINAL_GENERATION_STATES,
} from "./index.js";

describe("generation run lifecycle", () => {
  it("accepts the documented happy path", () => {
    expect(() => assertGenerationTransition("created", "reserved")).not.toThrow();
    expect(() => assertGenerationTransition("reserved", "queued")).not.toThrow();
    expect(() => assertGenerationTransition("queued", "streaming")).not.toThrow();
    expect(() => assertGenerationTransition("streaming", "finalizing")).not.toThrow();
    expect(() => assertGenerationTransition("finalizing", "completed")).not.toThrow();
  });

  it("rejects transitions out of terminal states", () => {
    for (const state of TERMINAL_GENERATION_STATES) {
      expect(canTransitionGeneration(state, "reserved")).toBe(false);
    }
  });

  it("rejects skipping the reservation transaction", () => {
    expect(() => assertGenerationTransition("created", "streaming")).toThrow(/cannot transition/i);
  });
});
