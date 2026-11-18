import { useLocation } from "react-router-dom";

/**
 * Presentation mode is for customer-facing screenshots and demos. It hides
 * internal engineering labels (milestones, demo banners, gate badges, API
 * build strings), but it must never change the truthful payment state.
 */
export function usePresentationMode(): boolean {
  const location = useLocation();
  return new URLSearchParams(location.search).get("presentation") === "1";
}
