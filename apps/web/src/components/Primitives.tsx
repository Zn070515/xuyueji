import type { ReactNode } from "react";

import { usePresentationMode } from "../lib/use-presentation.js";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-moon-400">
      {children}
    </p>
  );
}

export function GateBadge({
  gate,
  tone = "planned",
}: {
  gate: string;
  tone?: "planned" | "ready";
}) {
  const presentation = usePresentationMode();
  if (presentation) {
    return null;
  }
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide",
        tone === "ready"
          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
          : "border-mist-300/30 bg-paper-50/5 text-mist-200",
      ].join(" ")}
    >
      {gate}
    </span>
  );
}

export function StatusPill({
  status,
  label,
}: {
  status: "connected" | "offline" | "loading";
  label: string;
}) {
  const tone =
    status === "connected"
      ? "bg-emerald-400"
      : status === "offline"
        ? "bg-rose-400"
        : "bg-moon-400";
  return (
    <span className="inline-flex items-center gap-2 rounded-full border hairline bg-night-900/60 px-3 py-1.5 text-xs text-mist-200">
      <span className={`h-2 w-2 rounded-full ${tone}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b hairline px-4 pb-8 pt-10 sm:px-6 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-3 font-display text-3xl leading-tight text-paper-50 sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-7 text-mist-300 sm:text-base">{description}</p>
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

export function DemoDataNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-moon-400/25 bg-moon-400/5 px-3 py-2 text-xs leading-6 text-moon-200">
      {children}
    </p>
  );
}

export function DisabledPrimaryButton({
  children,
  describedBy,
}: {
  children: ReactNode;
  describedBy: string;
}) {
  return (
    <button
      type="button"
      disabled
      aria-describedby={describedBy}
      className="inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-full border border-mist-300/20 bg-paper-50/5 px-5 py-2.5 text-sm font-medium text-mist-400"
    >
      {children}
    </button>
  );
}
