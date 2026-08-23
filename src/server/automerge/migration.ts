import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });
import * as fs from "node:fs";
import { isValidAutomergeUrl, Repo } from "@automerge/automerge-repo/slim";
import type { DocHandle, StorageAdapterInterface } from "@automerge/automerge-repo/slim";
import { PostgresStorageAdapter } from "server/automerge/automerge-repo-storage-postgres";
import pg from "pg";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";

import { getAutomergeDocListing } from "server/express/routes/docListing";
import {
  DEFAULT_ACTION_DEFINITION_LABELS,
  DEFAULT_ACTION_DEFINITION_CONJUNCTIONS,
} from "store/storeUtils/mission";
import { migrateLegacyCircleControlHaloStyles } from "store/storeUtils/preset";
import { missionValidator } from "utils/validateSchemaServer";
import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";
import { initializeBase64Wasm } from "@automerge/automerge/slim";
import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";
import { QueryOrder } from "@mikro-orm/postgresql";
import {
  Poi_db,
  Action_db,
  Station_db,
  Traverse_db,
  Eva_db,
  Rex_db,
} from "server/database/models/_allModels";

// This is only required on the server since we are using esbuild. On the client, vite handles the wasm loading
initializeBase64Wasm(automergeWasmBase64);

// Connect to automerge database that stores all the docs
const dbPool: pg.Pool = new pg.Pool({
  user: "postgres",
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: 5432,
});
const storageAdapter: StorageAdapterInterface = new PostgresStorageAdapter(
  "automerge_native_db",
  dbPool
);
const automergeRepo = new Repo({ storage: storageAdapter });

const getORM = async () => {
  globalValues.orm = await MikroORM.init(config);
};

// DB must be ready first
getORM()
  .then(async () => {
    serverLogger.info({
      logId: "automerge-migration",
      logValue: "Starting automerge migration script...",
    });
    const allDocListings: AutomergeDocListing[] = await getAutomergeDocListing();

    // Validate doc-listing URLs up front so we can fail fast before doing any expensive
    // Automerge loads. Invalid URLs are a hard error.
    for (const docListing of allDocListings) {
      if (!isValidAutomergeUrl(docListing.automergeUrl)) {
        const errorMessage = `Invalid automerge URL in doc listing. MissionId: ${docListing.missionId} AutomergeUrl: ${docListing.automergeUrl}`;
        serverLogger.error(
          { logId: "automerge-migration", logValue: errorMessage },
          new Error(errorMessage)
        );
        process.exitCode = 1; // error
        process.exit();
      }
    }

    // Load every Automerge doc handle in parallel up front.
    //
    // (Note: the `(node:NNNN) TimeoutNegativeWarning: -NNN is a negative number.` warning
    // sometimes printed around this point comes from `@automerge/automerge-repo`'s
    // `DocSynchronizer` (and `Repo`) `throttle` helper. The throttle records
    // `lastCall = Date.now()` at *construction* time but only updates it after the timer
    // fires; if the gap between construction and the first invocation exceeds the throttle
    // delay (100 ms for the save throttle, 30 ms for the sync throttle), `wait` becomes
    // negative on the first call. Node clamps the delay to 1 ms and the save/sync still
    // happens — it is harmless and is NOT the cause of any perceived hang. The magnitude
    // of the negative number simply reflects how long it took to get from "Repo registered
    // the handle" to "the first change event fired on it" (≈ doc load time).)
    serverLogger.debug({
      logId: "automerge-migration",
      logValue: `Loading ${allDocListings.length} automerge document(s) in parallel...`,
    });
    const loadStartMs = Date.now();
    let loadedCount = 0;
    const allDocHandles: DocHandle<Mission>[] = await Promise.all(
      allDocListings.map(async (docListing) => {
        // Type guard inline so TS narrows automergeUrl to AnyDocumentId for find().
        // The up-front validation loop above guarantees this never throws in practice.
        if (!isValidAutomergeUrl(docListing.automergeUrl)) {
          throw new Error(
            `Invalid automerge URL slipped past pre-validation. MissionId: ${docListing.missionId}`
          );
        }
        const handle: DocHandle<Mission> = await automergeRepo.find(docListing.automergeUrl);
        await handle.whenReady();
        loadedCount += 1;
        // Log progress every 10 docs so the user can see forward progress on large DBs.
        if (loadedCount % 10 === 0 || loadedCount === allDocListings.length) {
          serverLogger.debug({
            logId: "automerge-migration",
            logValue: `  loaded ${loadedCount}/${allDocListings.length} doc(s)`,
          });
        }
        return handle;
      })
    );
    serverLogger.debug({
      logId: "automerge-migration",
      logValue: `Loaded ${allDocHandles.length} doc handle(s) in ${Date.now() - loadStartMs} ms`,
    });

    // Migrate existing docs to include entities as properties of Mission.
    // All DB fetches for a given mission are performed before any docHandle.change() call so
    // that a single atomic Automerge change is applied only when every fetch succeeds. This
    // prevents a half-migrated doc state: if any fetch throws, no change is written for that
    // mission and it will be retried on the next run.
    serverLogger.debug({
      logId: "automerge-migration",
      logValue: "Checking for documents that need migration to include entities in Mission...",
    });
    for (let i = 0; i < allDocListings.length; i++) {
      const docListing = allDocListings[i];
      const docHandle = allDocHandles[i];
      const doc = docHandle.doc();

      if (!doc) {
        serverLogger.error(
          {
            logId: "automerge-migration",
            logValue: `Error retrieving automerge doc for listing ${docListing}`,
          },
          new Error(`Error retrieving automerge doc for listing ${docListing}`)
        );
        process.exitCode = 1; // error
        process.exit();
      }

      // Determine which entities still need to be migrated for this mission.
      const needsPois = !("pois" in doc);
      const needsActions = !("actions" in doc);
      const needsStations = !("stations" in doc);
      const needsTraverses = !("traverses" in doc);
      const needsEvas = !("evas" in doc);
      const needsRexes = !("rexes" in doc);

      const anyNeedsMigration =
        needsPois || needsActions || needsStations || needsTraverses || needsEvas || needsRexes;

      if (!anyNeedsMigration) continue;

      // One fork per mission covers all entity fetches for this loop iteration
      const em = globalValues.orm.em.fork();

      // Fetch all required data from the DB first
      let poisRecord: Record<string, POI> | undefined;
      if (needsPois) {
        const dbPois = await em.find(
          Poi_db,
          { missionId: docListing.missionId },
          { orderBy: { name: QueryOrder.ASC } }
        );
        poisRecord = {};
        for (const dbPoi of dbPois) {
          const convertedPoi: POI = {
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
            createdAt: dbPoi.createdAt.getTime(), // Make dates numeric
            updatedAt: dbPoi.updatedAt.getTime(), // Make dates numeric
          };
          poisRecord[convertedPoi.uuid] = convertedPoi;
        }
      }

      let allActionRecords: Record<string, Action> | undefined;
      if (needsActions) {
        const dbActions = await em.find(
          Action_db,
          { missionId: docListing.missionId },
          {
            populate: ["poi", "station", "traverse", "parentAction"],
            orderBy: { name: QueryOrder.ASC },
          }
        );
        allActionRecords = {};
        for (const dbAction of dbActions) {
          const convertedAction: Action = {
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
          allActionRecords[convertedAction.uuid] = convertedAction;
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
          const convertedStation: Station = {
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
            poiUuids: dbStation.poi.map((p: Poi_db) => p.uuid),
            createdAt: dbStation.createdAt.getTime(), // Make dates numeric
            updatedAt: dbStation.updatedAt.getTime(), // Make dates numeric
          };
          stationsRecord[convertedStation.uuid] = convertedStation;
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
          const convertedTraverse: Traverse = {
            uuid: dbTraverse.uuid,
            refUuid: dbTraverse.refUuid,
            missionId: dbTraverse.missionId,
            name: dbTraverse.name,
            path: dbTraverse.path,
            pathSegmentDistances: dbTraverse.pathSegmentDistances,
            pathSegmentElevations: dbTraverse.pathSegmentElevations,
            pathSegmentAbsoluteSlopes: null,
            status: dbTraverse.status,
            duration: dbTraverse.duration,
            description: dbTraverse.description,
            traverseRate: dbTraverse.traverseRate,
            color: dbTraverse.color,
            actionOrderUuids: dbTraverse.actionOrderUuids,
            createdAt: dbTraverse.createdAt.getTime(), // Make dates numeric
            updatedAt: dbTraverse.updatedAt.getTime(), // Make dates numeric
          };
          traversesRecord[convertedTraverse.uuid] = convertedTraverse;
        }
      }

      let evasRecord: Record<string, Eva> | undefined;
      if (needsEvas) {
        const dbEvas = await em.find(
          Eva_db,
          { missionId: docListing.missionId },
          { orderBy: { name: QueryOrder.ASC } }
        );
        evasRecord = {};
        for (const dbEva of dbEvas) {
          const convertedEva: Eva = {
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
            datetime: dbEva.datetime ? new Date(dbEva.datetime).getTime() : null, // Make datetime numeric
            createdAt: dbEva.createdAt.getTime(), // Make dates numeric
            updatedAt: dbEva.updatedAt.getTime(), // Make dates numeric
          };
          evasRecord[convertedEva.uuid] = convertedEva;
        }
      }

      let rexesRecord: Record<string, Rex> | undefined;
      if (needsRexes) {
        const dbRexes = await em.find(Rex_db, { missionId: docListing.missionId });
        rexesRecord = {};
        for (const dbRex of dbRexes) {
          const convertedRex: Rex = {
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
            posEntries: structuredClone(dbRex.posEntries ?? []), // we mutate this below so clone it
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
            createdAt: dbRex.createdAt.getTime(), // Make dates numeric
            updatedAt: dbRex.updatedAt.getTime(), // Make dates numeric
          };
          // Loop through the PosEntries and convert the dates to numeric as well
          for (const posEntry of convertedRex.posEntries) {
            if (posEntry.createdAt != null) {
              posEntry.createdAt = new Date(posEntry.createdAt).getTime(); // Make dates numeric
            }
            if (posEntry.updatedAt != null) {
              posEntry.updatedAt = new Date(posEntry.updatedAt).getTime(); // Make dates numeric
            }
          }
          rexesRecord[convertedRex.uuid] = convertedRex;
        }
      }

      // Apply all needed changes in a single atomic change() call ---
      docHandle.change((m: Mission) => {
        if (poisRecord !== undefined) m.pois = poisRecord;
        if (allActionRecords !== undefined) m.actions = allActionRecords;
        if (stationsRecord !== undefined) m.stations = stationsRecord;
        if (traversesRecord !== undefined) m.traverses = traversesRecord;
        if (evasRecord !== undefined) m.evas = evasRecord;
        if (rexesRecord !== undefined) m.rexes = rexesRecord;
      });

      serverLogger.debug({
        logId: "automerge-migration",
        logValue:
          `Mission ${docListing.missionId} entity migration applied:` +
          (poisRecord !== undefined ? ` ${Object.keys(poisRecord).length} POI(s)` : "") +
          (allActionRecords !== undefined
            ? ` ${Object.keys(allActionRecords).length} action(s)`
            : "") +
          (stationsRecord !== undefined
            ? ` ${Object.keys(stationsRecord).length} station(s)`
            : "") +
          (traversesRecord !== undefined
            ? ` ${Object.keys(traversesRecord).length} traverse(s)`
            : "") +
          (evasRecord !== undefined ? ` ${Object.keys(evasRecord).length} EVA(s)` : "") +
          (rexesRecord !== undefined ? ` ${Object.keys(rexesRecord).length} REX(es)` : ""),
      });
    }

    /**
     * MIGRATION FUNCTIONS - ADD NEW ONES HERE
     *  All functions should be able to be run multiple times without breaking anything.
     *  Essentially, if the migration has already occurred, it should be able to detect that and skip
     */
    // EXAMPLE MIGRATION FUNCTION
    // const automergeMigration20250203 = async (docHandle: DocHandle<Mission>) => {
    //   // Migration Example. Make document changes via the docHandle.change function
    //   docHandle.change((doc: Mission) => {
    //     // change a field
    //     const newBannerMessage = "TEST BANNER FOR MIGRATION SCRIPT 123";
    //     if (doc.missionBanner !== newBannerMessage) doc.missionBanner = newBannerMessage;
    //     // remove the "description" property
    //     if ("description" in doc) delete doc.description;
    //     // add a new field with a default value
    //     if (!("newField" in doc)) doc["newField"] = "default value";
    //   });
    // };

    // Migration: Add maestroDocId field (null by default) to all mission docs
    const automergeMigration20260528AddMaestroDocId = async (docHandle: DocHandle<Mission>) => {
      docHandle.change((mission: Mission) => {
        if (!("maestroDocId" in mission)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (mission as any).maestroDocId = null;
        }
      });
    };

    // Migration: Add the action definition labels and conjunction fields, seeded with the
    // defaults so existing missions render exactly as before.
    const automergeMigration20260717AddActionNaming = async (docHandle: DocHandle<Mission>) => {
      docHandle.change((mission: Mission) => {
        // The persisted doc may predate these (now required) fields; the type says they always
        // exist, so view it as Partial to add them conditionally without narrowing to `never`.
        const doc = mission as Partial<Mission>;
        if (!("actionDefinitionLabels" in doc)) {
          doc.actionDefinitionLabels = structuredClone(DEFAULT_ACTION_DEFINITION_LABELS);
        }
        if (!("actionDefinitionConjunctions" in doc)) {
          doc.actionDefinitionConjunctions = structuredClone(
            DEFAULT_ACTION_DEFINITION_CONJUNCTIONS
          );
        }
      });
    };

    // Migration: rename legacy circle-label stroke properties to halo properties.
    const automergeMigration20260807MigrateLegacyCircleHaloStyles = async (
      docHandle: DocHandle<Mission>
    ) => {
      docHandle.change((mission: Mission) => {
        for (const station of Object.values(mission.stations ?? {})) {
          migrateLegacyCircleControlHaloStyles(station.mapCircleControls);
        }
      });
    };

    // Migration: pull the mission's grid metadata out of the legacy grid_db table and onto
    // the mission doc as `mission.serverFileGrid`, and remove the legacy `activeGridUuid` pointer.
    // Grid coordinate arrays remain on disk (Data/<fileName>) and are NOT moved.
    const automergeMigration20260722GridToMissionDoc = async (docHandle: DocHandle<Mission>) => {
      const doc = docHandle.doc();
      const missionId = doc.id;

      // Idempotent: already migrated (has grid metadata, no legacy pointer) → skip.
      if ("serverFileGrid" in doc && !("activeGridUuid" in doc)) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legacyActiveUuid: string | null = (doc as any).activeGridUuid ?? null;

      // Read any legacy grid_db rows for this mission (raw SQL — the model is gone).
      type LegacyGridRow = {
        uuid: string;
        numRows: number | null;
        numCols: number | null;
        spacing: number | string | null;
        name: string | null;
        fileName: string | null;
        isActiveGrid: boolean | null;
      };
      let rows: LegacyGridRow[] = [];
      let tableExists = true;
      try {
        const em = globalValues.orm.em.fork();
        rows = (await em.getConnection().execute(
          `select "uuid", "num_rows" as "numRows", "num_cols" as "numCols", "spacing",
                  "name", "file_name" as "fileName", "is_active_grid" as "isActiveGrid"
           from "grid_db" where "mission_id" = ?`,
          [missionId]
        )) as LegacyGridRow[];
      } catch {
        // Table no longer exists (drop migration already ran) — cannot recover metadata.
        tableExists = false;
      }

      // Resolve the effective grid row. The mission doc's activeGridUuid is the runtime
      // source of truth for which grid the mission displayed; grid_db.is_active_grid can
      // drift from it (e.g. a hotfix grid activated on the doc while the flag stayed on the
      // old grid). Prefer the doc pointer, then the flag, then single-row / ambiguous fallbacks.
      let chosen: LegacyGridRow | undefined;
      let outcome: string;
      if (legacyActiveUuid) chosen = rows.find((r) => r.uuid === legacyActiveUuid);
      if (!chosen) chosen = rows.find((r) => r.isActiveGrid);
      if (!chosen && rows.length === 1) chosen = rows[0];
      if (!chosen && rows.length > 1) {
        chosen = rows[0];
        outcome = `ambiguous (${rows.length} grids, none active) — kept first`;
      }

      let definition: MissionGridDefinition | null = null;
      if (chosen) {
        definition = {
          numRows: Number(chosen.numRows) || 0,
          numCols: Number(chosen.numCols) || 0,
          name: chosen.name ?? "",
          fileName: chosen.fileName ?? "",
        };
        outcome ??= "migrated";
        // Warn (don't fail) if the coordinate file is missing on disk.
        const filePath = `${process.env.STATIC_DIR}/missionFiles/${missionId}/Data/${definition.fileName}`;
        if (!definition.fileName || !fs.existsSync(filePath)) {
          outcome = `migrated (coordinate file missing: ${definition.fileName || "<none>"})`;
        }

        const unusedFileNames = new Set(
          rows
            .filter((row) => row.uuid !== chosen.uuid)
            .map((row) => row.fileName)
            .filter(
              (fileName): fileName is string => !!fileName && fileName !== definition.fileName
            )
        );
        for (const fileName of unusedFileNames) {
          const filePath = `${process.env.STATIC_DIR}/missionFiles/${missionId}/Data/${fileName}`;
          fs.rmSync(filePath, { force: true });
        }
      } else if (!tableExists && legacyActiveUuid) {
        outcome = "grid_db already dropped — metadata unrecoverable, cleared";
        serverLogger.error(
          {
            logId: "automerge-migration",
            logValue: `Mission ${missionId} had activeGridUuid ${legacyActiveUuid} but grid_db is gone; grid cleared`,
          },
          new Error(`Grid metadata unrecoverable for mission ${missionId}`)
        );
      } else {
        outcome = "no grid";
      }

      docHandle.change((m: Mission) => {
        m.serverFileGrid = definition;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ("activeGridUuid" in m) delete (m as any).activeGridUuid;
      });

      serverLogger.debug({
        logId: "automerge-migration",
        logValue: `Mission ${missionId} grid migration: ${outcome}`,
      });
    };

    // Migration: legacy missions with LGRS enabled use dynamic rendering by default.
    const automergeMigration20260809AddGridRenderMode = async (docHandle: DocHandle<Mission>) => {
      docHandle.change((mission: Mission) => {
        if (mission.gridRenderMode === undefined) {
          mission.gridRenderMode = mission.usingLGRSCoordinates ? "dynamic-lgrs" : "server-file";
        }
      });
    };

    const automergeMigration20260810RenameStationLabelStrokeToHalo = async (
      docHandle: DocHandle<Mission>
    ) => {
      docHandle.change((mission: Mission) => {
        for (const station of Object.values(mission.stations)) {
          for (const control of Object.values(station.mapCircleControls)) {
            const style = control.style as MapSublayerStyle & {
              labelStrokeColor?: string;
              labelStrokeWidth?: number;
              labelStrokeOpacity?: number;
            };
            if ("labelStrokeColor" in style) {
              if (style.labelHaloColor === undefined) style.labelHaloColor = style.labelStrokeColor;
              delete style.labelStrokeColor;
            }
            if ("labelStrokeWidth" in style) {
              if (style.labelHaloWidth === undefined) style.labelHaloWidth = style.labelStrokeWidth;
              delete style.labelStrokeWidth;
            }
            if ("labelStrokeOpacity" in style) {
              if (style.labelHaloOpacity === undefined) {
                style.labelHaloOpacity = style.labelStrokeOpacity;
              }
              delete style.labelStrokeOpacity;
            }
          }
        }
      });
    };

    serverLogger.debug({ logId: "automerge-migration", logValue: "Starting migrations..." });
    // Add migration functions to the list and run all the migrations on every doc
    const migrationFunctions: ((docHandle: DocHandle<Mission>) => Promise<void>)[] = [
      automergeMigration20260528AddMaestroDocId,
      automergeMigration20260717AddActionNaming,
      automergeMigration20260807MigrateLegacyCircleHaloStyles,
      automergeMigration20260722GridToMissionDoc,
      automergeMigration20260809AddGridRenderMode,
      automergeMigration20260810RenameStationLabelStrokeToHalo,
    ];
    // Run all the migrations in the list above
    for (const func of migrationFunctions) {
      serverLogger.debug({
        logId: "automerge-migration",
        logValue: `Running migration ${func.name}`,
      });
      for (const docHandle of allDocHandles) {
        await func(docHandle);
      }
    }
    serverLogger.debug({ logId: "automerge-migration", logValue: "Migrations complete." });

    // Migrations are done.
    // Validate schema against all automerge docs
    serverLogger.debug({ logId: "automerge-migration", logValue: "Running validator" });
    for (const docHandle of allDocHandles) {
      const mission = docHandle.doc();
      // Use structuredClone instead of cloneDeep so we don't need an extra dependency
      // when this file is built
      const isValid = missionValidator(structuredClone(mission));
      if (!isValid && missionValidator.errors?.length > 0) {
        serverLogger.error(
          { logId: "automerge-migration", logValue: JSON.stringify(missionValidator.errors) },
          new Error(`${mission.id} - ${mission.name} is invalid`)
        );
        process.exitCode = 1; // error
        process.exit();
      } else {
        serverLogger.debug({
          logId: "automerge-migration",
          logValue: `${mission.id} - ${mission.name} is valid`,
        });
      }
    }
    serverLogger.debug({ logId: "automerge-migration", logValue: "Validation complete." });
    // Flush all Automerge documents to the storage adapter before proceeding.
    // After docHandle.change(), the Repo schedules saves via a debounced/throttled timer
    // (saveDebounceRate) rather than writing synchronously. Calling process.exit() before
    // that timer fires would lose the changes. automergeRepo.flush() bypasses the debounce
    // and directly awaits storageSubsystem.saveDoc() for every cached document handle,
    // guaranteeing all changes are persisted to Postgres before we continue.
    // Note: flush() is marked @experimental in automerge-repo but is the correct mechanism
    // and is also used internally by Repo.shutdown().
    await automergeRepo.flush();

    serverLogger.info({
      logId: "automerge-migration",
      logValue: "All processes complete. Exiting.",
    });
    process.exitCode = 0; // success
    process.exit();
  })
  .catch((err: unknown) => {
    serverLogger.error(
      { logId: "automerge-migration", logValue: "Unhandled error in migration" },
      err instanceof Error ? err : new Error(String(err))
    );
    process.exitCode = 1;
    process.exit();
  });
