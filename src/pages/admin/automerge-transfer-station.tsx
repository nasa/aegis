import { useMemo, useState } from "react";
import type { ChangeFn } from "@automerge/automerge-repo";
import { applyDuplicateActionsStage } from "operations/apply/apply-action";
import { applyUpdateStationByField } from "operations/apply/apply-station";
import { stageDuplicateActions } from "operations/stage/stage-actions";
import adminCommon from "./adminCommon.module.css";

/**
 * Station fields copied verbatim from the source onto the destination.
 *
 * Deliberately excluded:
 *  - identity: uuid, refUuid
 *  - written by the action copy: actionOrderUuids
 *  - lander-managed presentation and position: icon, name, location, elevation,
 *    mapCircleControls, walkbackPath, walkbackPathSegmentDistances,
 *    walkbackPathSegmentElevations, walkbackTraverseRate
 *  - identical on both stations, so copying is a no-op: missionId
 *  - never copied: isLanderXgress
 */
const COPIED_STATION_FIELDS = [
  "poiUuids",
  "status",
  "description",
  "radius",
  "duration",
  "ownerId",
  "createdAt",
  "updatedAt",
] as const satisfies readonly (keyof Station)[];

type StationResolution = {
  station: Station | undefined;
  /** Names of every EVA whose sequence contains this station. */
  evaNames: string[];
  /** Uuids of every EVA whose sequence contains this station. */
  evaUuids: string[];
  /** "As-planned", or the name of the owning REX. */
  scopeLabel: string;
  /** Null for as-planned, otherwise the owning REX uuid. */
  rexUuid: string | null;
};

/** Build the set of EVA uuids that belong to a REX, keyed to their REX. */
function buildRexEvaMap(mission: Mission | undefined): Map<string, Rex> {
  const map = new Map<string, Rex>();
  for (const rex of Object.values(mission?.rexes ?? {})) {
    map.set(rex.evaUuid, rex);
  }
  return map;
}

/** Resolve a station uuid to its record, EVA membership, and REX scope. */
function resolveStation(
  mission: Mission | undefined,
  uuid: string,
  rexEvaMap: Map<string, Rex>
): StationResolution {
  const station = mission?.stations?.[uuid];
  const evaNames: string[] = [];
  const evaUuids: string[] = [];
  let rexUuid: string | null = null;
  let rexName: string | null = null;

  if (station) {
    for (const eva of Object.values(mission?.evas ?? {})) {
      if (!eva.sequence.some((item) => item.type === "station" && item.uuid === uuid)) continue;
      evaNames.push(eva.name);
      evaUuids.push(eva.uuid);
      const rex = rexEvaMap.get(eva.uuid);
      if (rex) {
        rexUuid = rex.uuid;
        rexName = rex.name;
      }
    }
  }

  return {
    station,
    evaNames,
    evaUuids,
    scopeLabel: rexName ? `REX: ${rexName}` : "As-planned",
    rexUuid,
  };
}

/** Read-only summary of a resolved station uuid. */
const StationSummary: React.FunctionComponent<{
  uuid: string;
  resolution: StationResolution;
}> = ({ uuid, resolution }) => {
  if (!uuid.trim()) return null;

  const { station, evaNames, scopeLabel } = resolution;
  if (!station) {
    return <p className={adminCommon.formHint}>Not found in this mission.</p>;
  }

  return (
    <div className={adminCommon.definitionList}>
      <div className={adminCommon.definitionRow}>
        <dt>Name</dt>
        <dd>{station.name}</dd>
      </div>
      <div className={adminCommon.definitionRow}>
        <dt>Lander Xgress</dt>
        <dd>{station.isLanderXgress ? "Yes" : "No"}</dd>
      </div>
      <div className={adminCommon.definitionRow}>
        <dt>Scope</dt>
        <dd>{scopeLabel}</dd>
      </div>
      <div className={adminCommon.definitionRow}>
        <dt>EVA Sequences</dt>
        <dd>{evaNames.length > 0 ? evaNames.join(", ") : "Not in any EVA sequence"}</dd>
      </div>
      <div className={adminCommon.definitionRow}>
        <dt>Actions</dt>
        <dd>{station.actionOrderUuids?.length ?? 0}</dd>
      </div>
    </div>
  );
};

type Props = {
  mission: Mission | undefined;
  changeMissionDoc: (changeFn: ChangeFn<Mission>) => void;
};

const TransferStationData: React.FunctionComponent<Props> = ({ mission, changeMissionDoc }) => {
  const [fromUuid, setFromUuid] = useState("");
  const [toUuid, setToUuid] = useState("");
  const [status, setStatus] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const rexEvaMap = useMemo(() => buildRexEvaMap(mission), [mission]);
  const from = useMemo(
    () => resolveStation(mission, fromUuid.trim(), rexEvaMap),
    [mission, fromUuid, rexEvaMap]
  );
  const to = useMemo(
    () => resolveStation(mission, toUuid.trim(), rexEvaMap),
    [mission, toUuid, rexEvaMap]
  );

  // Blocking validation. The transfer only ever runs from a regular station to
  // a lander xgress station.
  const blockingErrors = useMemo(() => {
    const errors: string[] = [];
    if (!fromUuid.trim() || !toUuid.trim()) return errors;

    if (!from.station) errors.push("Source station not found.");
    if (!to.station) errors.push("Destination station not found.");
    if (fromUuid.trim() === toUuid.trim()) {
      errors.push("Source and destination must be different stations.");
    }
    if (from.station?.isLanderXgress) {
      errors.push("Source must not be a lander xgress station.");
    }
    if (to.station && !to.station.isLanderXgress) {
      errors.push("Destination must be a lander xgress station.");
    }
    return errors;
  }, [from, to, fromUuid, toUuid]);

  // Non-blocking warnings.
  const warnings = useMemo(() => {
    const list: string[] = [];
    if (!from.station || !to.station || blockingErrors.length > 0) return list;

    const sharesEva = from.evaUuids.some((uuid) => to.evaUuids.includes(uuid));
    if (!sharesEva) {
      list.push("The source and destination stations are not in the same EVA.");
    }
    if (from.rexUuid !== to.rexUuid) {
      list.push(
        `Scope mismatch: the source is ${from.scopeLabel} and the destination is ${to.scopeLabel}.`
      );
    } else {
      list.push("Both stations will hold copies of these actions.");
    }
    if (from.station.duration !== null) {
      list.push(
        "Duration is a manual override. A value that diverges from the destination's own action dwell time by more than 10% raises an audit warning."
      );
    }
    const orphanPois = (from.station.poiUuids ?? []).filter((uuid) => !mission?.pois?.[uuid]);
    if (orphanPois.length > 0) {
      list.push(`POI links reference uuids missing from this mission: ${orphanPois.join(", ")}`);
    }
    return list;
  }, [from, to, blockingErrors, mission]);

  const sourceActions = useMemo(() => {
    if (!mission || !from.station) return [];
    return (from.station.actionOrderUuids ?? [])
      .map((uuid) => mission.actions?.[uuid])
      .filter((action): action is Action => Boolean(action));
  }, [mission, from.station]);

  const canSubmit =
    Boolean(mission) &&
    Boolean(from.station) &&
    Boolean(to.station) &&
    blockingErrors.length === 0 &&
    fromUuid.trim().length > 0 &&
    toUuid.trim().length > 0;

  const runTransfer = () => {
    setShowConfirm(false);
    if (!mission || !from.station || !to.station) return;

    const sourceStation = from.station;
    const destinationUuid = to.station.uuid;

    // Stage the action copies against the current doc, then restore each
    // source action's name and timestamps. stageDuplicateActions mints a new
    // uuid and refUuid, and with preserveRefUuid=false it also stamps a fresh
    // name and createdAt/updatedAt, which we do not want here.
    const actionsStage = stageDuplicateActions(mission, {
      actions: sourceActions,
      preserveRefUuid: false,
      promotingFromPoi: false,
      parent: { kind: "station", stationUuid: destinationUuid },
    });
    for (const item of actionsStage.newActions) {
      const source = mission.actions?.[item.oldUuid];
      if (!source) continue;
      item.newAction.name = source.name;
      item.newAction.createdAt = source.createdAt;
      item.newAction.updatedAt = source.updatedAt;
    }

    // Single change so the whole transfer lands as one Automerge patch.
    changeMissionDoc((m) => {
      applyDuplicateActionsStage(m, actionsStage);

      for (const fieldName of COPIED_STATION_FIELDS) {
        applyUpdateStationByField(m, {
          stationUuid: destinationUuid,
          fieldName,
          value: sourceStation[fieldName],
          // The station's own updatedAt is part of the copied field set, so
          // never let the helper overwrite it with the current time.
          preserveUpdatedAt: true,
        });
      }
    });

    setStatus(
      `Copied ${actionsStage.newActions.length} action(s) and ${COPIED_STATION_FIELDS.length} field(s) from "${sourceStation.name}" to "${to.station.name}".`
    );
    setFromUuid("");
    setToUuid("");
  };

  return (
    <section className={adminCommon.section}>
      <h2>Transfer Station Data to Lander Xgress</h2>
      <div className={adminCommon.details}>
        <p className={adminCommon.descriptionText}>
          Copy a regular station&apos;s actions and data onto a lander xgress station. Actions are
          copied with new uuids but keep their original names and timestamps. The source station is
          left untouched.
        </p>
        <p className={adminCommon.descriptionText}>
          Copied fields: {COPIED_STATION_FIELDS.join(", ")}. Not copied: icon, name, location,
          elevation, mapCircleControls (proximity circles), and the walkback fields &mdash; these
          are managed by the lander.
        </p>

        <div className={adminCommon.form}>
          <div className={adminCommon.formGroup}>
            <label className={adminCommon.formLabel} htmlFor="transfer-from-uuid">
              From Station UUID
            </label>
            <input
              id="transfer-from-uuid"
              className={adminCommon.formInput}
              type="text"
              value={fromUuid}
              placeholder="Source station uuid"
              onChange={(e) => {
                setFromUuid(e.target.value);
              }}
            />
            <StationSummary uuid={fromUuid} resolution={from} />
          </div>

          <div className={adminCommon.formGroup}>
            <label className={adminCommon.formLabel} htmlFor="transfer-to-uuid">
              To Station UUID
            </label>
            <input
              id="transfer-to-uuid"
              className={adminCommon.formInput}
              type="text"
              value={toUuid}
              placeholder="Destination lander xgress station uuid"
              onChange={(e) => {
                setToUuid(e.target.value);
              }}
            />
            <StationSummary uuid={toUuid} resolution={to} />
          </div>

          {blockingErrors.length > 0 && (
            <ul className={adminCommon.statusDisconnected}>
              {blockingErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}

          {warnings.length > 0 && (
            <ul className={adminCommon.statusConnecting}>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}

          <div className={adminCommon.formActions}>
            <button
              className={adminCommon.buttonPrimary}
              type="button"
              disabled={!canSubmit}
              onClick={() => {
                setShowConfirm(true);
              }}
            >
              Transfer Station Data
            </button>
          </div>
        </div>

        {status && <p className={adminCommon.statusMessage}>{status}</p>}
      </div>

      {showConfirm && from.station && to.station && (
        <div className={adminCommon.confirmOverlay}>
          <div className={adminCommon.confirmDialog}>
            <h3>Confirm Transfer</h3>
            <p>
              Copy {sourceActions.length} action(s) from &quot;{from.station.name}&quot; to &quot;
              {to.station.name}&quot;, appended after its existing{" "}
              {to.station.actionOrderUuids?.length ?? 0} action(s).
            </p>
            <p>
              Overwrite these destination fields: {COPIED_STATION_FIELDS.join(", ")}. This cannot be
              undone.
            </p>
            <div className={adminCommon.confirmActions}>
              <button
                className={adminCommon.buttonCancel}
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                }}
              >
                Cancel
              </button>
              <button className={adminCommon.buttonDanger} type="button" onClick={runTransfer}>
                Transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default TransferStationData;
