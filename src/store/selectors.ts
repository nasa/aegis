import sortBy from "lodash/sortBy";
import concat from "lodash/concat";
import type { RootState } from "store";

/**
 * Gets all Stations for an EVA. If no EVA uuid is provided, use the selectedEvaUuid
 * Also includes ingress and egress stations if they are not "lander"
 */
export const selectEvaStations =
  (evaUuid?: string) =>
  (state: RootState): Station[] => {
    const evaStations: Station[] = [];
    const eva = state.eva.evas.find((e) => e.uuid === (evaUuid || state.eva.selectedEvaUuid));
    if (!eva) return [];
    if (eva.sequence) {
      const sequenceStations = eva.sequence
        .filter((seqItem) => seqItem.type === "station" && seqItem.uuid) // if a station hasn't be selected yet, uuid will be blank
        .map((stationSeqItem) =>
          state.station.stations.find((s) => s.uuid === stationSeqItem.uuid)
        );
      evaStations.push(...sequenceStations);
    }
    if (eva.ingressLocationUuid !== "lander") {
      const ingressStation = state.station.stations.find((s) => s.uuid === eva.ingressLocationUuid);
      if (ingressStation) evaStations.push(ingressStation);
    }
    if (eva.egressLocationUuid !== "lander") {
      const egressStation = state.station.stations.find((s) => s.uuid === eva.egressLocationUuid);
      if (egressStation) evaStations.push(egressStation);
    }
    return evaStations;
  };

/**
 * Gets all Traverses for an EVA. If no EVA uuid is provided, use the selectedEvaUuid
 */
export const selectEvaTraverses =
  (evaUuid?: string) =>
  (state: RootState): Traverse[] => {
    const eva = state.eva.evas.find((e) => e.uuid === (evaUuid || state.eva.selectedEvaUuid));
    if (!eva?.sequence) return [];

    const traverseSeqItems = eva.sequence.filter((seqItem) => seqItem.type === "traverse");
    const traverses = traverseSeqItems.map((traverseSeqItem) =>
      state.traverse.traverses.find((t) => t.uuid === traverseSeqItem.uuid)
    );

    return traverses;
  };

/**
 * Gets all Actions for an EVA. If no EVA uuid is provided, use the selectedEvaUuid
 */
export const selectEvaActions =
  (evaUuid?: string) =>
  (state: RootState): Action[] => {
    const eva = state.eva.evas.find((e) => e.uuid === (evaUuid || state.eva.selectedEvaUuid));
    if (!eva?.sequence) return [];

    const stationSeqItems = eva.sequence.filter((seqItem) => seqItem.type === "station");
    const actionArrays = stationSeqItems.map((stationSeqItem) =>
      state.action.actions.filter((a) => a.stationUuid === stationSeqItem.uuid)
    );
    const allActions = actionArrays.flat();

    return allActions;
  };

/**
 * Gets all stations that are not in a REX EVA or ingress/egress locations and returns them sorted by name.
 * This includes stations that are not in any EVA, and any unsaved draft stations.
 * Since sequence stations and ingress/egress stations are not duplicated until the EVA is saved,
 *     only filter out using the fromDB copies in the store.
 */
export const selectAsPlannedStations = (state: RootState): Station[] => {
  // First get all the stations we want to filter out
  const allRexEvasUuids = state.rex.rexesFromDb.map((rex) => rex.evaUuid);
  // Get all stations that are in a REX's EVA.
  const allRexEvaStationUuids = state.eva.evasFromDb
    .filter((e) => allRexEvasUuids.includes(e.uuid))
    .flatMap((eva) => eva.sequence?.filter((seq) => seq.type === "station").map((seq) => seq.uuid));
  // Get all stations that are ingress/egress in REX's EVAs
  const allIngressEgressStationUuids = state.eva.evasFromDb
    .filter((e) => allRexEvasUuids.includes(e.uuid))
    .flatMap((eva) => {
      const xgressStationUuids = [];
      if (eva.ingressLocationUuid !== "lander") xgressStationUuids.push(eva.ingressLocationUuid);
      if (eva.egressLocationUuid !== "lander") xgressStationUuids.push(eva.egressLocationUuid);
      return xgressStationUuids;
    });
  // combine all uuids get stations that we need to filter out
  // use the regular store (not the fromDB copy) to include unsaved stations
  const allStationUuids = concat(allRexEvaStationUuids, allIngressEgressStationUuids);
  const stationList = state.station.stations.filter(
    (station) => !allStationUuids.includes(station.uuid)
  );
  return sortBy(stationList, (station) => station.name.toLowerCase());
};

/**
 * This selector takes maestroActivityPropertiesByRefUuid and returns a new object where the keys are
 * converted from station/traverse refUuids to their corresponding regular UUIDs.
 */
export const selectConvertMaestroActivityPropertiesByRefUuidToUuid = (
  state: RootState,
  {
    maestroActivityPropertiesByRefUuid,
    rexUuid,
  }: { maestroActivityPropertiesByRefUuid: MaestroActivityPropertiesByRefUuid; rexUuid: string }
): MaestroActivityProperties => {
  if (!maestroActivityPropertiesByRefUuid) return {};
  // loop through the maestroActivityProperty keys which are refUuids for stations and traverses,
  // and create an object that keys to the non-ref uuids
  const activityProperties: MaestroActivityProperties = {};
  for (const [key, value] of Object.entries(maestroActivityPropertiesByRefUuid)) {
    const uuid = getSequenceUuidByRefUuidAndRexUuid(state, {
      refUuid: key,
      rexUuid,
    });
    if (uuid) {
      activityProperties[uuid] = { ...value };
    }
  }

  // handle xgress entries
  for (const [key, value] of Object.entries(maestroActivityPropertiesByRefUuid)) {
    if (key.endsWith("gress")) {
      activityProperties[key] = { ...value };
    }
  }

  // return the new object with non-ref keys
  return activityProperties;
};

/**
 * Get non-ref sequence item (station or traverse) by refUuid and rexUuid
 * Returns the UUID of the non-ref sequence item or undefined if not found
 * If refUuid is null, returns the as-planned sequence uuid
 */
export const getSequenceUuidByRefUuidAndRexUuid = (
  state: RootState,
  { refUuid, rexUuid }: { refUuid: string | null; rexUuid: string }
): string | undefined => {
  // Find all the station or traverse records that have this refUuid
  const allStationUuidsWithRefUuid = state.station?.stations
    .filter((station) => station.refUuid === refUuid)
    .map((station) => station.uuid);
  const allTraverseUuidsWithRefUuid = state.traverse?.traverses
    .filter((traverse) => traverse.refUuid === refUuid)
    .map((traverse) => traverse.uuid);
  const combinedUuids = [...allStationUuidsWithRefUuid, ...allTraverseUuidsWithRefUuid];

  let arrayOfUuidsFromSequence = [];
  // If refUuid is null, find EVAs that are not referenced by any REX records
  if (refUuid === null) {
    // Get all REX EVA UUIDs to filter out
    const allRexEvasUuids = state.rex.rexesFromDb.map((rex) => rex.evaUuid);

    // Find EVAs that are not referenced by any REX
    const nonRexEvas = state.eva.evasFromDb.filter((eva) => !allRexEvasUuids.includes(eva.uuid));

    // Check if we have any non-REX EVAs. This should never happen since a rex eva can't exist without and as-planned eva existing
    if (!nonRexEvas || nonRexEvas.length === 0) {
      return undefined;
    }

    // Find the as-planned EVA (should be the first non-REX EVA)
    const targetEva = nonRexEvas[0];
    arrayOfUuidsFromSequence = targetEva?.sequence?.map((seq) => seq.uuid);
  } else {
    // rexUuids isn't null, so we need to find using the eva from the provided rexUuid

    // Find the EVA sequence from the rexUuid
    const evaUuidFromRex = state.rex.rexesFromDb.find((rex) => rex.uuid === rexUuid)?.evaUuid;
    const evaSequenceFromRexEva = state.eva.evasFromDb.find(
      (eva) => eva.uuid === evaUuidFromRex
    )?.sequence;
    arrayOfUuidsFromSequence = evaSequenceFromRexEva?.map((seq) => seq.uuid);
  }

  // Return the uuid in the eva sequence that is in combinedUuids
  return arrayOfUuidsFromSequence?.find((uuid) => combinedUuids.includes(uuid));
};

/** Returns the as planned eva given an eva refUuid */
export const getAsPlannedEvaFromRefUuid = (state: RootState, refUuid: string): Eva | undefined => {
  if (!refUuid || !state) return undefined;
  // get all rex eva uuids
  const allRexEvasUuids = state.rex.rexesFromDb.map((rex) => rex.evaUuid);
  // the as-planned eva is the one with a matching refUuid, but is not in any rex
  const asPlannedEva = state.eva.evas.find(
    (eva) => !allRexEvasUuids.includes(eva.uuid) && eva.refUuid === refUuid
  );
  if (!asPlannedEva) return undefined;
  return asPlannedEva;
};
