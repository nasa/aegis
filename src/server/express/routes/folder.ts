import express, { Request, Response } from "express";

import cloneDeep from "lodash/cloneDeep";

import { hasPerms } from "utils/permissions";

import { getEM } from "utils/mikro";
import {
  Loaded,
  EntityData,
  QueryOrder,
  ForeignKeyConstraintViolationException,
} from "@mikro-orm/core";
import { Folder_db } from "server/database/models/_allModels";
import { emitStoreDelete, emitStoreUpsert } from "../sockets";
import { convertFolderDbToStore, convertFolderStoreToDb } from "store/storeUtils/folder";

const router = express.Router();

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, folders } = req.body as FolderUpsertRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = await hasPerms({
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
    const upsertResponse: Folder[] = await upsertFolders(folders);

    //check response
    if (upsertResponse.length === 0) {
      res.status(500).json({
        status: "error",
        message: "Upsert response did not return a value",
        data: null,
      });
      return;
    }

    // emit the upserted item to all clients via socket.io
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

  const editPermission = await hasPerms({
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
export async function upsertFolders(folders: Folder[]): Promise<Folder[]> {
  const em = getEM();

  const foldersToUpsert = cloneDeep(folders); //create a copy to manipulate
  const foldersUpsertedToDb = [];

  for (const folderToUpsert of foldersToUpsert) {
    const convertedFolder: EntityData<Folder_db> = convertFolderStoreToDb(folderToUpsert);

    //upsert folder
    const folderRefFromDb: Folder_db = await em.upsert(Folder_db, convertedFolder);
    em.persist(folderRefFromDb);
    foldersUpsertedToDb.push(folderRefFromDb);
  }

  await em.flush();
  //convert to store format
  return foldersUpsertedToDb.map(convertFolderDbToStore);
}

/**
 * Deletes Folders from the database
 * @param folderUuids Folder uuids to delete
 * @returns the uuids of the deleted Folders
 */
export async function deleteFolders(folderUuids: string[]): Promise<string[]> {
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
