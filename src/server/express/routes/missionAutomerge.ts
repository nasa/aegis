import type { Request, Response } from "express";
import express from "express";
import { hasPerms } from "utils/permissions";
import { getAutomergeDocListing } from "./docListing";
import { globalValues } from "../global";
import type { DocHandle, AutomergeUrl, DocumentId } from "@automerge/automerge-repo/slim";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";
import { generateBlankMission } from "store/storeUtils/mission";
import { Doc_Listing_db } from "server/database/models/doc_listing.model";
import type { RequiredEntityData } from "@mikro-orm/core";
import {
  addDbBackupListener,
  deleteBackupDbMissionAndRelatedEntities,
  upsertBackupDbMissions,
} from "./mission";
import { deleteFile } from "server/file/file";

/**
 * Endpoint for working with the mission document in automerge
 */

const router = express.Router();

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

  // Attach listeners to this doc handle. Wait until after the mission is in the DB
  // Any subsequent changes will trigger updates to the backup copy of mission in the DB
  addDbBackupListener(missionDocHandle);

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
