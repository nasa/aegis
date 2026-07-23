/**
 * useMapDateTime — shared hook for determining the active map time.
 *
 * The logic is:
 * 1. If in preset editor and a preview time is set → use that
 * 2. If a REX is selected and has a running time → use REX time
 * 3. If a sequence item has a time → use that
 * 4. If an EVA is selected with a datetime → use that
 * 5. If any time-based sublayer exists → use first manifest entry
 * 6. Otherwise → null
 */

import { useMemo } from "react";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";

// Require a full ISO 8601 datetime (date + T + time). Date.parse alone is too
// lenient — strings like "2024", "Mar", or just a year parse to finite numbers
// in many engines and would silently set the map time to garbage.
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
function isISOString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!ISO_DATETIME_RE.test(value)) return false;
  return !isNaN(Date.parse(value));
}

/**
 * Returns the currently active map datetime string (ISO), or null.
 * Pure derivation from Redux state — no local state management needed.
 */
export function useMapDateTime(): string | null {
  const presetPreviewTime = useAppSelector((s) => s.preset.presetPreviewTime, refEqual);
  const sectionSelected = useAppSelector((s) => s.interface.sectionSelectedLabel, refEqual);
  const missionSublayers = useAppSelector((s) => s.mission.sublayers, deepEqual);

  const selectedEvaUuid = useAppSelector((s) => s.eva.selectedEvaUuid, refEqual);
  const selectedEvaDatetime = useMissionDocSelector((m) => {
    return selectedEvaUuid ? (m.evas?.[selectedEvaUuid]?.datetime ?? null) : null;
  }, refEqual);

  // The sequence time comes from the selected sequence item on the selected EVA
  // NOTE: In the Leaflet implementation, sequenceTime is derived from
  // getCalculatedTimeOfSequenceItem() which needs stations, actions, traverses,
  // and mission rates. That wiring will be added when behavior components
  // that consume time are implemented (Phase 1 TileLayers).
  // For now, this hook returns the simpler time sources.

  return useMemo(() => {
    if (presetPreviewTime && sectionSelected === "preset") {
      return presetPreviewTime;
    }
    if (selectedEvaDatetime && isISOString(selectedEvaDatetime)) {
      return selectedEvaDatetime;
    }
    if (missionSublayers) {
      const firstTimeBased = missionSublayers.find((sl) => sl.isTimeBased);
      if (firstTimeBased?.timeLayerManifest?.[0]?.datetime) {
        return firstTimeBased.timeLayerManifest[0].datetime;
      }
    }
    return null;
  }, [presetPreviewTime, sectionSelected, selectedEvaDatetime, missionSublayers]);
}
