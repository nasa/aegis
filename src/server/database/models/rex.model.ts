import { defineEntity, p } from "@mikro-orm/postgresql";

export const Rex_dbSchema = defineEntity({
  name: "Rex_db",
  properties: {
    uuid: p.string().unique().primary(),
    missionId: p.integer(),
    name: p.text(),
    description: p.text().nullable(),
    petStartStopTimestamp: p.string().nullable(),
    petValueAtStartStop: p.string().nullable(),
    petRunning: p.boolean().nullable(),
    evaUuid: p.string(),
    isRunning: p.boolean().nullable(),
    posEntries: p.json<PosEntry[]>().nullable(),
    posTypes: p.json<PosType[]>().nullable(),
    posSources: p.json<PosSource[]>().nullable(),
    stationEntries: p.json<ActivityEntries>().nullable(),
    traverseEntries: p.json<ActivityEntries>().nullable(),
    actionEntries: p.json<ActionEntries>().nullable(),
    /**
     * Legacy column. Egress/ingress REX status now lives in `stationEntries`
     * keyed by the real xgress station uuid. Kept so the derelict table keeps
     * its original shape until it is dropped wholesale.
     */
    xgressEntries: p.json<Record<string, { rexStatus: RexStatus }>>().nullable(),
    ownerId: p.integer().nullable(),
    maestroControlled: p.boolean().default(false),
    maestroEventId: p.string().nullable(),
    maestroEventUrl: p.string().nullable(),
    maestroActivityPropertiesByRefUuid: p.json<MaestroActivityPropertiesByRefUuid>().nullable(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class Rex_db extends Rex_dbSchema.class implements Rex_db_type {}

Rex_dbSchema.setClass(Rex_db);
