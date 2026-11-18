/**
 * Deterministic prompt compiler.
 *
 * The compiler is pure: callers inject the token estimator, clock/seed and
 * authoritative entity versions. The server must recompile from its own
 * versions before any model call; a client preview is never authoritative.
 */
export * from "./compiler.js";
