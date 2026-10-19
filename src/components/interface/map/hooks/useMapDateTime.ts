/**
 * useMapDateTime — shared hook for determining the active map time.
 *
 * The logic is:
 * 1. If in preset editor and a preview time is set → use that
 * 2. If an EVA is selected with a datetime → add the timeline hover offset, if present
 * 3. If any time-based sublayer exists → use first manifest entry
 * 4. Otherwise → null
 */

import { useMemo } from "react";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { selectSublayers } from "store/selectors";
import { numericDatetimeToISO } from "utils/formatting";

/**
 * Returns the currently active map datetime string (ISO), or null.
 * Pure derivation from Redux state — no local state management needed.
 */
export function useMapDateTime(): string | null {
  return useMapDateTimeWithSource()?.datetime ?? null;
}

/** Resolve the date and its source together so displayed attribution stays in sync. */
export function useMapDateTimeWithSource(): MapDateTimeWithSource {
  const presetPreviewTime = useAppSelector((s) => s.preset.presetPreviewTime, refEqual);
  const sectionSelected = useAppSelector((s) => s.interface.sectionSelectedLabel, refEqual);
  const missionSublayers = useMissionDocSelector(selectSublayers, deepEqual);

  const selectedEvaUuid = useAppSelector((s) => s.eva.selectedEvaUuid, refEqual);
  const timelineTime = useAppSelector((s) => s.hover.timelineTime, refEqual);
  const selectedEvaDatetime = useMissionDocSelector((m) => {
    return selectedEvaUuid ? (m.evas?.[selectedEvaUuid]?.datetime ?? null) : null;
  }, refEqual);
  const selectedEvaName = useMissionDocSelector(
    (m) => (selectedEvaUuid ? m.evas?.[selectedEvaUuid]?.name : null),
    refEqual
  );

  return useMemo<MapDateTimeWithSource>(() => {
    const evaHasDate =
      selectedEvaDatetime != null && Number.isFinite(new Date(selectedEvaDatetime).getTime());
    const evaWarning =
      selectedEvaUuid && !evaHasDate
        ? `Selected EVA ${selectedEvaName || selectedEvaUuid} has no valid date.`
        : null;
    if (presetPreviewTime && sectionSelected === "preset") {
      return {
        datetime: presetPreviewTime,
        sourceLabel: "Preset preview",
        source: "preset-preview",
        warning: evaWarning,
        evaWarning,
      };
    }
    if (evaHasDate) {
      const hoverDatetime =
        timelineTime?.evaUuid === selectedEvaUuid &&
        Number.isFinite(timelineTime.elapsedSeconds) &&
        timelineTime.elapsedSeconds >= 0
          ? selectedEvaDatetime + timelineTime.elapsedSeconds * 1000
          : NaN;
      const isTimelineHover = Number.isFinite(new Date(hoverDatetime).getTime());
      return {
        datetime: numericDatetimeToISO(isTimelineHover ? hoverDatetime : selectedEvaDatetime),
        sourceLabel: isTimelineHover
          ? `Timeline hover: ${selectedEvaName || selectedEvaUuid} (+${Math.round(timelineTime.elapsedSeconds)} s)`
          : `Selected EVA: ${selectedEvaName || selectedEvaUuid}`,
        source: isTimelineHover ? "timeline-hover" : "eva",
        warning: null,
        evaWarning,
      };
    }
    if (missionSublayers) {
      const firstTimeBased = missionSublayers.find((sl) => sl.isTimeBased);
      if (firstTimeBased?.timeLayerManifest?.[0]?.datetime) {
        return {
          datetime: firstTimeBased.timeLayerManifest[0].datetime,
          sourceLabel: `Time-based layer: ${firstTimeBased.name || firstTimeBased.uuid} (fallback)`,
          source: "layer",
          warning: [evaWarning, "Using time-based layer initial date, not a dated EVA."]
            .filter(Boolean)
            .join(" "),
          evaWarning,
        };
      }
    }
    return {
      datetime: null,
      sourceLabel: null,
      source: null,
      warning: evaWarning || "No map date is available.",
      evaWarning,
    };
  }, [
    presetPreviewTime,
    sectionSelected,
    selectedEvaDatetime,
    selectedEvaName,
    selectedEvaUuid,
    timelineTime,
    missionSublayers,
  ]);
}
