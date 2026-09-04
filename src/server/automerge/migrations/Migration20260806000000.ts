import type { AutomergeMigration } from "server/automerge/migrations/types";
import { v4 as uuidv4 } from "uuid";
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

export const Migration20260806000000: AutomergeMigration = {
  version: 20260806000000,
  name: "move-xgress-into-eva-sequences",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      for (const evaValue of Object.values(mission.evas ?? {})) {
        const eva = evaValue as LegacyEva;
        const alreadyMigrated = eva.sequence?.[0]?.type === "station";
        if (alreadyMigrated || !eva.sequence || eva.sequence.length === 0) {
          delete eva.egressLocationUuid;
          delete eva.ingressLocationUuid;
          delete eva.egressDuration;
          delete eva.ingressDuration;
          continue;
        }

        const buildLanderStation = (
          xgressType: "egress" | "ingress",
          duration: number | null
        ): Station => {
          const landerLocation: AEGISPoint = {
            lat: mission.landerLocation?.lat ?? null,
            lng: mission.landerLocation?.lng ?? null,
          };
          if (mission.landerLocation?.alt !== undefined) {
            landerLocation.alt = mission.landerLocation.alt;
          }
          const now = Date.now();
          return {
            uuid: uuidv4(),
            refUuid: uuidv4(),
            ownerId: eva.ownerId ?? 0,
            missionId: mission.id ?? 0,
            poiUuids: [],
            actionOrderUuids: [],
            name: xgressType === "egress" ? "Lander Egress" : "Lander Ingress",
            status: "Candidate",
            description: "",
            radius: 5,
            location: landerLocation,
            elevation: mission.landerElevationMeters ?? null,
            walkbackPath: null,
            walkbackPathSegmentDistances: null,
            walkbackPathSegmentElevations: null,
            walkbackTraverseRate: null,
            icon: "landerIcon",
            mapCircleControls: {},
            isLanderXgress: true,
            duration: duration ?? 10,
            createdAt: now,
            updatedAt: now,
          };
        };

        const resolveXgress = (
          xgressType: "egress" | "ingress",
          locationUuid: string,
          duration: number | null
        ): string | null => {
          if (locationUuid === "lander") {
            const landerStation = buildLanderStation(xgressType, duration);
            mission.stations[landerStation.uuid] = landerStation;
            return landerStation.uuid;
          }
          if (mission.stations?.[locationUuid]) return locationUuid;

          serverLogger.warning({
            logId: "automerge-migration",
            logValue: `Mission ${mission.id} EVA ${eva.uuid} xgress station ${locationUuid} not found; skipping xgress station insertion`,
          });
          return null;
        };

        const egressUuid = resolveXgress(
          "egress",
          eva.egressLocationUuid ?? "lander",
          eva.egressDuration ?? null
        );
        const ingressUuid = resolveXgress(
          "ingress",
          eva.ingressLocationUuid ?? "lander",
          eva.ingressDuration ?? null
        );

        if (egressUuid) eva.sequence.unshift({ type: "station", uuid: egressUuid });
        if (ingressUuid) eva.sequence.push({ type: "station", uuid: ingressUuid });

        delete eva.egressLocationUuid;
        delete eva.ingressLocationUuid;
        delete eva.egressDuration;
        delete eva.ingressDuration;
      }

      for (const rexValue of Object.values(mission.rexes ?? {})) {
        const rex = rexValue as LegacyRex;
        if (!("xgressEntries" in rex)) continue;

        const eva = mission.evas?.[rex.evaUuid];
        if (rex.xgressEntries && eva) {
          const uuidByRole: Record<string, string | undefined> = {
            egress: eva.sequence?.[0]?.uuid,
            ingress: eva.sequence?.[eva.sequence.length - 1]?.uuid,
          };
          for (const [role, entry] of Object.entries(rex.xgressEntries)) {
            const stationUuid = uuidByRole[role];
            if (!stationUuid) {
              serverLogger.warning({
                logId: "automerge-migration",
                logValue: `Mission ${mission.id} REX ${rex.uuid} could not resolve xgress entry "${role}" to a station; dropping it`,
              });
              continue;
            }
            if (!rex.stationEntries) rex.stationEntries = {};
            if (!rex.stationEntries[stationUuid]) {
              rex.stationEntries[stationUuid] = { rexStatus: entry.rexStatus };
            }
          }
        }

        delete rex.xgressEntries;
      }
    });
  },
};
