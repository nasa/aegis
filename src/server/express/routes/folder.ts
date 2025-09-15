import type { Request, Response } from "express";
import type { EntityData, Loaded } from "@mikro-orm/postgresql";

import { ForeignKeyConstraintViolationException, QueryOrder } from "@mikro-orm/postgresql";
import express from "express";
import cloneDeep from "lodash/cloneDeep";

import { getEM } from "utils/mikro";
import { hasPerms } from "utils/permissions";
import { Folder_db } from "server/database/models/_allModels";
import { convertFolderDbToStore, convertFolderStoreToDb } from "store/storeUtils/folder";

import { emitStoreDelete, emitStoreUpsert } from "../sockets";
import { upsertDatabaseRetry } from "utils/database";

const router = express.Router();

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, folders } = req.body as FolderUpsertRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const upsertResponse: Folder[] = await upsertDatabaseRetry(() => upsertFolders(folders));

    // Check response
    if (!upsertResponse || upsertResponse.length === 0) {
      res.status(500).json({
        status: "error",
        message: "Failed to update folder after multiple tries",
        data: null,
      });
      return;
    }

    // Emit the upserted item to all clients via socket.io
    emitStoreUpsert({
      missionId,
      socketId,
      type: "folder",
      data: upsertResponse,
    } as StoreUpsert);

    res.status(200).json({
      status: "success",
      message: `Folders upserted with Uuids ${upsertResponse.map((f) => f.uuid)}`,
      data: upsertResponse,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, folderUuids } = req.body as FolderDeleteRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const deletedUuids = await deleteFolders(folderUuids);
    if (deletedUuids.length > 0) {
      // emit the deleted item to all clients via socket.io
      emitStoreDelete({
        missionId,
        socketId,
        type: "folder",
        uuids: deletedUuids,
      } as StoreDelete);

      res.status(200).json({
        status: "success",
        message: "Folders Deleted",
      });
    } else {
      res.status(404).json({
        status: "failure",
        message: "Records not found. Nothing deleted",
      });
    }
  } catch (e) {
    console.error(e);
    if (e instanceof ForeignKeyConstraintViolationException) {
      res.status(500).json({
        status: "error",
        message: "Cannot delete folder. This Folder is referenced elsewhere",
      });
    } else {
      res.status(500).json({ status: "error", message: "Error processing the DELETE request" });
    }
  }
});

export default router;

/**
 * get Folder(s) from the database
 * @param missionId required. Mission ID for the folder.
 * @param folderUuid optional. UUID of the folder to retrieve
 * @returns array of folders
 */
export async function getFolders(missionId: number, folderUuid?: string): Promise<Folder[]> {
  const em = getEM();

  //find folders by either mission Id or uuid
  let dbFolders: Loaded<Folder_db, never>[];

  if (folderUuid) {
    dbFolders = await em.find(
      Folder_db,
      { uuid: folderUuid },
      { orderBy: [{ name: QueryOrder.ASC }] }
    );
  } else {
    dbFolders = await em.find(
      Folder_db,
      { mission: { id: missionId } },
      { orderBy: [{ name: QueryOrder.ASC }] }
    );
  }

  //convert to store format
  return dbFolders.map(convertFolderDbToStore);
}

/**
 * Inserts or Updates Folders into the database
 * @param folders the Folder objects to upsert
 * @returns a copy of the Folder objects that was upserted
 */
async function upsertFolders(folders: Folder[]): Promise<Folder[]> {
  const em = getEM();
  await em.begin(); // Start a transaction

  const foldersToUpsert = cloneDeep(folders); // Create a copy to manipulate
  const foldersUpsertedToDb = [];

  try {
    for (const folderToUpsert of foldersToUpsert) {
      const convertedFolder: EntityData<Folder_db> = convertFolderStoreToDb(folderToUpsert);

      // Upsert folder
      const folderRefFromDb: Folder_db = await em.upsert(Folder_db, convertedFolder);
      em.persist(folderRefFromDb);
      foldersUpsertedToDb.push(folderRefFromDb);
    }

    await em.commit(); // Flush and commit the transaction
  } catch (e) {
    await em.rollback(); // Rollback the transaction
    throw e; // Re-throw the error to be handled by the caller
  }

  // Convert to store format
  return foldersUpsertedToDb.map(convertFolderDbToStore);
}

/**
 * Deletes Folders from the database
 * @param folderUuids Folder uuids to delete
 * @returns the uuids of the deleted Folders
 */
async function deleteFolders(folderUuids: string[]): Promise<string[]> {
  const em = getEM();
  const deletedUuids = [];
  for (const folderUuid of folderUuids) {
    const entity = await em.findOne(Folder_db, { uuid: folderUuid });
    if (entity) {
      deletedUuids.push(folderUuid);
      em.remove(entity); //delete folder
    }
  }

  await em.flush(); //perform deletes
  return deletedUuids;
}
