import type { Request, Response } from "express";
import express from "express";
import { hasPerms, emssTokenIsValid } from "utils/permissions";
import { getAutomergeDocListing } from "./docListing";
import { globalValues } from "../global";
import type { DocHandle, AutomergeUrl, DocumentId } from "@automerge/automerge-repo/slim";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";
import { generateBlankMission } from "store/storeUtils/mission";
import { Doc_Listing_db } from "server/database/models/doc_listing.model";
import type { RequiredEntityData } from "@mikro-orm/core";
import { deleteBackupDbMissionAndRelatedEntities, upsertBackupDbMissions } from "./mission";
import { deleteFile } from "server/file/file";
import { missionFieldsValidator } from "utils/validateSchemaServer";

/**
 * Endpoint for working with the mission document in automerge
 */

const router = express.Router();

/**
 * Get all mission automerge documents the caller has permission to view.
 * Uses the server-side automerge repo (already loaded all docs in memory),
 * so the client doesn't have to replay the document over the WebSocket connection,
 * which is very slow for large/many missions.
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const emssToken = req.headers["emss-token"] as string;
  const viewPermission =
    req.session?.appUser?.isSuperAdmin ||
    req.session?.appUser?.permissionList?.find((p) => p.permissions.view)?.permissions.view ||
    emssTokenIsValid(emssToken);
  if (!viewPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "missionAutomerge",
      appUsername: req.session?.appUser?.username,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  try {
    let missionIds: number[] | undefined;
    if (!req.session?.appUser?.isSuperAdmin && !emssTokenIsValid(emssToken)) {
      missionIds = req.session.appUser.permissionList.flatMap((p) =>
        p.permissions.view ? [p.missionId] : []
      );
    }
    const missions = await getAutomergeMissions(missionIds);
    res.status(200).json({ status: "success", message: "missions retrieved", data: missions });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "missionAutomerge",
      appUsername: req.session?.appUser?.username,
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

/**
 * Create a new mission automerge document, this will also add to the document listing table
 * This endpoint should NOT be used to modify the mission automerge document,
 *  modifications should be done directly using automerge document hooks
 *  and change functions
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const emssToken = req.headers["emss-token"] as string;
  const createPermissions = hasPerms({
    missionId: null,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!createPermissions) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "missionAutomerge",
      appUsername: req.session?.appUser?.username,
      missionId: null,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    //perform the create
    const createResponse: AutomergeDocListing = await createAutomergeMission();

    //check response
    if (!createResponse) {
      res.status(500).json({
        status: "error",
        message: "Create response did not return a value",
        data: null,
      });
      return;
    }
    res.status(200).json({
      status: "success",
      message: "Automerge mission document created",
      data: createResponse,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "missionAutomerge",
      appUsername: req.session?.appUser?.username,
      missionId: null,
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

/**
 * Apply a subset of GIS/setup fields to an existing mission's automerge document.
 *
 * Mission entity data lives only in automerge (mutated in-browser via doc hooks), so
 * external tooling normally cannot set projection/DEM/lander metadata over HTTP. This
 * route loads the server-side doc handle and applies an allow-listed set of fields in a
 * single change(). It does NOT accept entity collections — use the websocket repo for those.
 * Access uses the standard mission edit permission: a valid EMSS token, a super-admin
 * session, or an authenticated user session with edit permission for the mission.
 *
 * Mounted as a POST sub-route so it never collides with the create
 * endpoint above and keeps the API to GET/POST/DELETE verbs.
 */
router.post("/fields", async (req: Request, res: Response): Promise<void> => {
  const { missionId, fields } = (req.body ?? {}) as MissionFieldsUpdateRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "missionAutomerge/fields",
      appUsername: req.session?.appUser?.username,
      missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  if (!missionId || isNaN(missionId)) {
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  if (!fields || typeof fields !== "object") {
    res.status(400).json({ status: "error", message: "No fields provided in request body" });
    return;
  }

  try {
    const handle = await getAutomergeMissionHandle(missionId);
    if (!handle) {
      res.status(404).json({ status: "failure", message: `Mission ${missionId} not found` });
      return;
    }

    if (!missionFieldsValidator(fields)) {
      res.status(400).json({
        status: "error",
        message: "Invalid mission fields",
        data: missionFieldsValidator.errors,
      });
      return;
    }

    const applied = Object.keys(fields) as (keyof MissionFields)[];
    if (applied.length === 0) {
      res.status(400).json({
        status: "error",
        message: "No mission fields provided",
      });
      return;
    }

    const mission = handle.doc();
    const requestedLanderLocation = fields.landerLocation;
    const landerLocationChanged =
      requestedLanderLocation !== undefined &&
      (mission.landerLocation?.lat !== requestedLanderLocation.lat ||
        mission.landerLocation?.lng !== requestedLanderLocation.lng ||
        mission.landerLocation?.alt !== requestedLanderLocation.alt);

    if (landerLocationChanged && missionHasLanderDependentEntities(mission)) {
      res.status(409).json({
        status: "failure",
        message:
          "landerLocation cannot be changed through this endpoint after lander-dependent assets exist; use the Automerge lander-location update workflow",
      });
      return;
    }

    handle.change((m: Mission) => {
      Object.assign(m, fields);
      m.updatedAt = new Date().getTime();
    });

    res.status(200).json({
      status: "success",
      message: `Mission ${missionId} updated (${applied.join(", ")})`,
      data: handle.doc(),
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "missionAutomerge/fields",
      appUsername: req.session?.appUser?.username,
      missionId,
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete the automerge document, the doc listing, and the backup copy in the DB
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionIds } = req.body as MissionDeleteRequest;
  const emssToken = req.headers["emss-token"] as string;

  // Must have edit permission the mission ids
  for (const missionIdToDelete of missionIds) {
    if (!missionIdToDelete || isNaN(missionIdToDelete)) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "DELETE",
        responseStatus: 400,
        routeName: "missionAutomerge",
        missionId: missionIdToDelete,
        appUsername: req.session?.appUser?.username,
        message: "Invalid mission Id",
      });
      res.status(400).json({ status: "error", message: "Invalid mission ID" });
      return;
    }

    const canEditThisMission = hasPerms({
      missionId: missionIdToDelete,
      permission: "edit",
      appUser: req.session.appUser,
      emssToken,
    });
    if (!canEditThisMission) {
      serverLogger.apiRoute({
        logLevel: "warning",
        httpMethod: "DELETE",
        responseStatus: 401,
        routeName: "missionAutomerge",
        appUsername: req.session?.appUser?.username,
        missionId: missionIdToDelete,
        message: "Unauthorized",
      });
      res.status(401).json({ status: "failure", message: "Unauthorized" });
      return;
    }
  }

  try {
    // delete the automerge doc, the listing, and the backup copy in the DB
    const deletedMissionIds: number[] = await deleteAutomergeMissions(missionIds);
    if (deletedMissionIds.length > 0) {
      res.status(200).json({
        status: "success",
        message: "Mission deleted from automerge, the document listing, and the backup database",
      });
    } else {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "DELETE",
        responseStatus: 404,
        routeName: "missionAutomerge",
        appUsername: req.session?.appUser?.username,
        missionId: null,
        uuids: missionIds?.map((id) => id.toString()),
        message: "No record found. Nothing deleted",
      });
      res.status(404).json({
        status: "failure",
        message: "No record found. Nothing deleted",
      });
    }
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "DELETE",
      responseStatus: 500,
      routeName: "missionAutomerge",
      appUsername: req.session?.appUser?.username,
      missionId: null,
      uuids: missionIds?.map((e) => e.toString()),
      message: `Error processing the DELETE request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: "Error processing the DELETE request" });
  }
});

export default router;

export function missionHasLanderDependentEntities(mission: Mission): boolean {
  const hasPlacedStation = Object.values(mission.stations ?? {}).some(
    (station) => station.location != null || (station.walkbackPath?.length ?? 0) > 0
  );
  if (hasPlacedStation) return true;

  return Object.values(mission.evas ?? {}).some((eva) => {
    if (eva.sequence.length === 0) return false;

    const firstTraverse = mission.traverses?.[eva.sequence[0].uuid];
    const lastTraverse = mission.traverses?.[eva.sequence[eva.sequence.length - 1].uuid];
    return Boolean(
      (eva.egressLocationUuid === "lander" && firstTraverse) ||
      (eva.ingressLocationUuid === "lander" && lastTraverse)
    );
  });
}

/**
 * Get the automerge document handle for a single mission.
 * @param missionId The ID of the mission to get the handle for
 * @returns The doc handle, or null if the mission is not found
 */
export async function getAutomergeMissionHandle(
  missionId: number
): Promise<DocHandle<Mission> | null> {
  const listings = await getAutomergeDocListing([missionId]);
  if (!listings.length) return null;
  const handle = await globalValues.automergeRepo.find<Mission>(
    listings[0].automergeUrl as AutomergeUrl
  );
  await handle.whenReady();
  return handle;
}

/**
 * Get automerge document for mission ids.
 * This will query the automerge doc listing to find the URLs for the docs and
 * then load the docs from the automerge repo in parallel
 * @param missionIds Ids for the missions. If no id is provided it will return all missions
 */
export async function getAutomergeMissions(missionIds?: number[]): Promise<Mission[]> {
  const automergeListings = await getAutomergeDocListing(missionIds);
  const missionPromises = automergeListings.map(async (listing) => {
    const missionDocHandle: DocHandle<Mission> = await globalValues.automergeRepo.find(
      listing.automergeUrl as AutomergeUrl
    );
    await missionDocHandle.whenReady();
    return missionDocHandle.doc();
  });

  const missionsToReturn = await Promise.all(missionPromises);
  return missionsToReturn;
}

// Creates a new mission automerge document, add it to the doc listing
// Adds new mission to the backup mission db table and adds a listener
// Returns the new listing for the mission
export async function createAutomergeMission(
  sourceMission?: Mission // optional mission definition to create from
): Promise<AutomergeDocListing> {
  // create new mission automerge doc and add it to the doc listing table
  const newMission: Mission = sourceMission || generateBlankMission();
  const missionDocHandle = globalValues.automergeRepo.create<Mission>(newMission);
  await missionDocHandle.whenReady();
  const docListing: Partial<AutomergeDocListing> = {
    automergeUrl: missionDocHandle.url,
  };

  const em = globalValues.orm.em;
  // Add a new automerge listing record and get a new mission ID
  // TODO - this should be wrapped in a retry logic for optimistic locking
  const dbReference = em.create(
    Doc_Listing_db,
    docListing as RequiredEntityData<DocListing_db_type>
  );
  // Have to both persist and flush in order to get the new mission id back
  await em.persist(dbReference).flush();

  // This mission in automerge didn't have an ID yet.
  // Assign it the one from our newly inserted record
  missionDocHandle.change((m: Mission) => (m.id = dbReference.missionId));

  // Add mission to the mission DB as backup.
  const automergeMission: Mission = missionDocHandle.doc();
  await upsertBackupDbMissions([automergeMission]); // add new mission to database

  return dbReference as AutomergeDocListing;
}

/**
 * Deletes automerge doc from the repo, also remove the doc listing.
 * Also deletes the mission from the backup database
 * @param missionIds mission IDs to delete
 * @returns the ids of the deleted mission ids
 */
export async function deleteAutomergeMissions(missionIds: number[]): Promise<number[]> {
  const deletedMissionIds = [];

  const em = globalValues.orm.em;
  for (const missionId of missionIds) {
    // delete from automerge table
    const entity = await em.findOne(Doc_Listing_db, { missionId });
    const automergeUrl = entity.automergeUrl as AutomergeUrl;
    if (entity) em.remove(entity);
    await em.flush();

    // delete the doc handler the server is holding
    const allHandles: Record<DocumentId, DocHandle<unknown>> = globalValues.automergeRepo.handles;
    for (const docId in allHandles) {
      if (docId === automergeUrl.toString().slice(10)) {
        allHandles[docId as DocumentId].delete();
        break;
      }
    }
    // delete the doc from the automerge repo storage system
    globalValues.automergeRepo.delete(automergeUrl as AutomergeUrl);

    // delete from mission db backup table, and also all records in other tables associated with this mission
    await deleteBackupDbMissionAndRelatedEntities([missionId]);

    // delete from files
    await deleteFile(`missionFiles/${missionId.toString()}`);

    deletedMissionIds.push(missionId);
  }

  return deletedMissionIds;
}
