import { QueryOrder } from "@mikro-orm/postgresql";
import type { AutomergeMigration } from "server/automerge/migrations/types";
import {
  Action_db,
  Eva_db,
  Poi_db,
  Rex_db,
  Station_db,
  Traverse_db,
} from "server/database/models/_legacyModels";
import { migrateLegacyCircleControlHaloStyles } from "store/storeUtils/preset";
import { serverLogger } from "utils/logging/serverLogger";

type LegacyEva = Eva & {
  egressDuration?: number | null;
  ingressDuration?: number | null;
  egressLocationUuid?: string | null;
  ingressLocationUuid?: string | null;
};

type LegacyRex = Rex & {
  xgressEntries?: Record<string, { rexStatus: RexStatus }> | null;
};

export const Migration20260416000000: AutomergeMigration = {
  version: 20260416000000,
  name: "move-legacy-entities-into-mission-documents",
  migrate: async (docHandle, { docListing, orm }) => {
    const doc = docHandle.doc();
    const needsPois = !("pois" in doc);
    const needsActions = !("actions" in doc);
    const needsStations = !("stations" in doc);
    const needsTraverses = !("traverses" in doc);
    const needsEvas = !("evas" in doc);
    const needsRexes = !("rexes" in doc);

    if (
      !(needsPois || needsActions || needsStations || needsTraverses || needsEvas || needsRexes)
    ) {
      return;
    }

    const em = orm.em.fork();
    let poisRecord: Record<string, POI> | undefined;
    if (needsPois) {
      const dbPois = await em.find(
        Poi_db,
        { missionId: docListing.missionId },
        { orderBy: { name: QueryOrder.ASC } }
      );
      poisRecord = {};
      for (const dbPoi of dbPois) {
        poisRecord[dbPoi.uuid] = {
          uuid: dbPoi.uuid,
          missionId: dbPoi.missionId,
          ownerId: dbPoi.ownerId,
          actionOrderUuids: dbPoi.actionOrderUuids,
          name: dbPoi.name,
          description: dbPoi.description,
          priorityOverride: dbPoi.priorityOverride,
          radius: dbPoi.radius,
          location: dbPoi.location,
          elevation: dbPoi.elevation,
          icon: dbPoi.icon,
          tags: dbPoi.tags,
          status: dbPoi.status,
          createdAt: dbPoi.createdAt.getTime(),
          updatedAt: dbPoi.updatedAt.getTime(),
        };
      }
    }

    let actionsRecord: Record<string, Action> | undefined;
    if (needsActions) {
      const dbActions = await em.find(
        Action_db,
        { missionId: docListing.missionId },
        {
          populate: ["poi", "station", "traverse", "parentAction"],
          orderBy: { name: QueryOrder.ASC },
        }
      );
      actionsRecord = {};
      for (const dbAction of dbActions) {
        actionsRecord[dbAction.uuid] = {
          uuid: dbAction.uuid,
          refUuid: dbAction.refUuid,
          name: dbAction.name,
          missionId: dbAction.missionId,
          poiUuid: dbAction.poi?.uuid || null,
          stationUuid: dbAction.station?.uuid || null,
          traverseUuid: dbAction.traverse?.uuid || null,
          parentActionUuid: dbAction.parentAction?.uuid || null,
          parentCopyDate: dbAction.parentCopyDate,
          priority: dbAction.priority,
          stmPriorities: dbAction.stmPriorities,
          type: dbAction.type,
          description: dbAction.description,
          descriptionTask: dbAction.descriptionTask,
          stmAction: dbAction.stmAction,
          actionDefinition: dbAction.actionDefinition,
          icon: dbAction.icon,
          location: dbAction.location,
          elevation: dbAction.elevation,
          duration: dbAction.duration,
          equipmentItemsUsage: dbAction.equipmentItemsUsage,
          geographicUnitsUsage: dbAction.geographicUnitsUsage,
          mass: dbAction.mass,
          status: dbAction.status,
          enabled: dbAction.enabled,
          crewAssigned: dbAction.crewAssigned ?? [],
          createdAt: dbAction.createdAt,
          updatedAt: dbAction.updatedAt,
        };
      }
    }

    let stationsRecord: Record<string, Station> | undefined;
    if (needsStations) {
      const dbStations = await em.find(
        Station_db,
        { missionId: docListing.missionId },
        { populate: ["poi"], orderBy: { name: QueryOrder.ASC } }
      );
      stationsRecord = {};
      for (const dbStation of dbStations) {
        const mapCircleControls = structuredClone(dbStation.mapCircleControls);
        migrateLegacyCircleControlHaloStyles(mapCircleControls);
        stationsRecord[dbStation.uuid] = {
          uuid: dbStation.uuid,
          refUuid: dbStation.refUuid,
          ownerId: dbStation.ownerId,
          missionId: dbStation.missionId,
          actionOrderUuids: dbStation.actionOrderUuids,
          name: dbStation.name,
          status: dbStation.status,
          description: dbStation.description,
          radius: dbStation.radius,
          location: dbStation.location,
          elevation: dbStation.elevation,
          walkbackPath: dbStation.walkbackPath,
          walkbackPathSegmentDistances: dbStation.walkbackPathSegmentDistances,
          walkbackPathSegmentElevations: dbStation.walkbackPathSegmentElevations,
          walkbackTraverseRate: dbStation.walkbackTraverseRate,
          duration: dbStation.duration,
          icon: dbStation.icon,
          mapCircleControls,
          poiUuids: dbStation.poi.map((poi: Poi_db) => poi.uuid),
          createdAt: dbStation.createdAt.getTime(),
          updatedAt: dbStation.updatedAt.getTime(),
        };
      }
    }

    let traversesRecord: Record<string, Traverse> | undefined;
    if (needsTraverses) {
      const dbTraverses = await em.find(
        Traverse_db,
        { missionId: docListing.missionId },
        { orderBy: { name: QueryOrder.ASC } }
      );
      traversesRecord = {};
      for (const dbTraverse of dbTraverses) {
        traversesRecord[dbTraverse.uuid] = {
          uuid: dbTraverse.uuid,
          refUuid: dbTraverse.refUuid,
          missionId: dbTraverse.missionId,
          name: dbTraverse.name,
          path: dbTraverse.path,
          pathSegmentDistances: dbTraverse.pathSegmentDistances,
          pathSegmentElevations: dbTraverse.pathSegmentElevations,
          status: dbTraverse.status,
          duration: dbTraverse.duration,
          description: dbTraverse.description,
          traverseRate: dbTraverse.traverseRate,
          color: dbTraverse.color,
          actionOrderUuids: dbTraverse.actionOrderUuids,
          createdAt: dbTraverse.createdAt.getTime(),
          updatedAt: dbTraverse.updatedAt.getTime(),
        };
      }
    }

    let evasRecord: Record<string, LegacyEva> | undefined;
    if (needsEvas) {
      const dbEvas = await em.find(
        Eva_db,
        { missionId: docListing.missionId },
        { orderBy: { name: QueryOrder.ASC } }
      );
      evasRecord = {};
      for (const dbEva of dbEvas) {
        evasRecord[dbEva.uuid] = {
          uuid: dbEva.uuid,
          refUuid: dbEva.refUuid,
          missionId: dbEva.missionId,
          ownerId: dbEva.ownerId,
          name: dbEva.name,
          status: dbEva.status,
          sequence: dbEva.sequence,
          description: dbEva.description,
          duration: dbEva.duration,
          traverseRate: dbEva.traverseRate,
          egressDuration: dbEva.egressDuration,
          ingressDuration: dbEva.ingressDuration,
          egressLocationUuid: dbEva.egressLocationUuid,
          ingressLocationUuid: dbEva.ingressLocationUuid,
          traverseColor: dbEva.traverseColor,
          datetime: dbEva.datetime ? new Date(dbEva.datetime).getTime() : null,
          createdAt: dbEva.createdAt.getTime(),
          updatedAt: dbEva.updatedAt.getTime(),
        };
      }
    }

    let rexesRecord: Record<string, LegacyRex> | undefined;
    if (needsRexes) {
      const dbRexes = await em.find(Rex_db, { missionId: docListing.missionId });
      rexesRecord = {};
      for (const dbRex of dbRexes) {
        const rex: LegacyRex = {
          uuid: dbRex.uuid,
          ownerId: dbRex.ownerId,
          missionId: dbRex.missionId,
          name: dbRex.name,
          description: dbRex.description,
          petStartStopTimestamp: dbRex.petStartStopTimestamp,
          petValueAtStartStop: dbRex.petValueAtStartStop,
          petRunning: dbRex.petRunning,
          evaUuid: dbRex.evaUuid,
          isRunning: dbRex.isRunning,
          posEntries: structuredClone(dbRex.posEntries ?? []),
          posTypes: dbRex.posTypes,
          posSources: dbRex.posSources,
          stationEntries: dbRex.stationEntries,
          traverseEntries: dbRex.traverseEntries,
          actionEntries: dbRex.actionEntries,
          xgressEntries: dbRex.xgressEntries,
          maestroControlled: dbRex.maestroControlled,
          maestroEventId: dbRex.maestroEventId,
          maestroEventUrl: dbRex.maestroEventUrl,
          maestroActivityPropertiesByRefUuid: dbRex.maestroActivityPropertiesByRefUuid,
          createdAt: dbRex.createdAt.getTime(),
          updatedAt: dbRex.updatedAt.getTime(),
        };
        for (const posEntry of rex.posEntries) {
          if (posEntry.createdAt != null)
            posEntry.createdAt = new Date(posEntry.createdAt).getTime();
          if (posEntry.updatedAt != null)
            posEntry.updatedAt = new Date(posEntry.updatedAt).getTime();
        }
        rexesRecord[rex.uuid] = rex;
      }
    }

    docHandle.change((mission: Mission) => {
      if (poisRecord !== undefined) mission.pois = poisRecord;
      if (actionsRecord !== undefined) mission.actions = actionsRecord;
      if (stationsRecord !== undefined) mission.stations = stationsRecord;
      if (traversesRecord !== undefined) mission.traverses = traversesRecord;
      if (evasRecord !== undefined) mission.evas = evasRecord;
      if (rexesRecord !== undefined) mission.rexes = rexesRecord;
    });

    serverLogger.debug({
      logId: "automerge-migration",
      logValue: `Mission ${docListing.missionId} legacy entity migration applied`,
    });
  },
};
