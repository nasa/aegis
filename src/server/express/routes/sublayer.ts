import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";
import cloneDeep from "lodash/cloneDeep";
import { hasPerms } from "utils/permissions";
import { getEM } from "utils/mikro";
import {
  Loaded,
  EntityData,
  QueryOrder,
  ForeignKeyConstraintViolationException,
} from "@mikro-orm/core";
import { Sublayer_db } from "server/database/models/_allModels";
import {
  convertSublayersTypeDbToStore,
  convertSublayersTypeStoreToDb,
} from "store/storeUtils/sublayer";
import path from "path";
import fs from "fs";
import { SCHEMA_DIR } from "utils/consts-server";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, uuid } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    uuid: uuid ? uuid.toString() : null,
  };
  return queryObj;
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const emssToken = req.headers["emss-token"] as string;

  const viewPermission = await hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  try {
    const records: Sublayer[] = await getSublayers(queryObj.missionId, queryObj.uuid);

    res.status(200).json({
      status: "success",
      message: "sublayers retrieved",
      data: records,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

router.get("/schema", async (req: Request, res: Response): Promise<void> => {
  try {
    const schemaFile = fs.readFileSync(path.join(SCHEMA_DIR, "sublayerImportable.json"), "utf8");
    const schema = JSON.parse(schemaFile);
    res.status(200).json({
      status: "success",
      message: "importableSublayer schema retrieved",
      data: schema,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      status: "error",
      message: `Error retrieving schema: ${e}`,
      data: null,
    });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, sublayers } = req.body as SublayerUpsertRequest;
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
    //perform the upsert
    const upsertResponse: Sublayer[] = await upsertSublayers(sublayers);

    //check response
    if (upsertResponse.length === 0) {
      res.status(500).json({
        status: "error",
        message:
          "Upsert response did not return a value. Could you be trying to insert a second time-based sublayer?",
        data: null,
      });
    } else {
      res.status(200).json({
        status: "success",
        message: `Sublayer upserted with ID ${upsertResponse.map((s) => s.uuid)}`,
        data: upsertResponse,
      });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, sublayerUuids } = req.body as SublayerDeleteRequest;
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
    const deletedUUIDs = await deleteSublayers(sublayerUuids);

    if (deletedUUIDs.length > 0) {
      res.status(200).json({
        status: "success",
        message: "Sublayer Deleted",
      });
    } else {
      res.status(404).json({
        status: "failure",
        message: "Record not found. Nothing deleted",
      });
    }
  } catch (e) {
    console.error(e);
    if (e instanceof ForeignKeyConstraintViolationException) {
      res.status(500).json({
        status: "error",
        message: "Cannot delete sublayer. This sublayer is referenced elsewhere",
      });
    } else {
      res.status(500).json({ status: "error", message: "Error processing the DELETE request" });
    }
  }
});

export default router;

/**
 * get sublayer(s) from the database
 * @param missionId required. Mission ID for the sublayers.
 * @param sublayerUUID optional. UUID of the sublayer to retrieve
 * @returns array of sublayers
 */
export async function getSublayers(missionId: number, sublayerUUID?: string): Promise<Sublayer[]> {
  const em = getEM();

  let sublayers_db: Loaded<Sublayer_db, never>[];
  if (sublayerUUID) {
    //find by sublayer uuid
    sublayers_db = await em.find(
      Sublayer_db,
      { uuid: sublayerUUID },
      { orderBy: [{ layer: { uuid: QueryOrder.ASC }, name: QueryOrder.ASC }] }
    );
  } else {
    //find by mission id
    sublayers_db = await em.find(
      Sublayer_db,
      { mission: { id: missionId } },
      { orderBy: [{ layer: { uuid: QueryOrder.ASC }, name: QueryOrder.ASC }] }
    );
  }

  if (sublayers_db) {
    return convertSublayersTypeDbToStore(sublayers_db);
  } else {
    return [];
  }
}

/**
 * Inserts or Updates sublayers into the database
 * @param sublayers the sublayers to upsert
 * @returns a copy of the sublayers  that was upserted
 */
export async function upsertSublayers(sublayers: Sublayer[]): Promise<Sublayer[]> {
  const em = getEM();
  const sublayersToUpsert: Sublayer[] = cloneDeep(sublayers);
  const sublayersUpsertedToDb = [];

  for (const sublayerToUpsert of sublayersToUpsert) {
    //convert fks and upsert
    const convertedRecord: EntityData<Sublayer_db> = convertSublayersTypeStoreToDb([
      sublayerToUpsert,
    ])[0];
    const upsertReference = await em.upsert(Sublayer_db, convertedRecord);
    em.persist(upsertReference);
    sublayersUpsertedToDb.push(upsertReference);
  }

  await em.flush();

  //convert fks back
  return convertSublayersTypeDbToStore(sublayersUpsertedToDb);
}

/**
 * Deletes sublayers
 * @param uuids sublayer uuids to delete
 * @returns the uuids of the deleted sublayers
 */
export async function deleteSublayers(uuids: string[]): Promise<string[]> {
  const em = getEM();
  const deletedUuids = [];
  for (const uuid of uuids) {
    const entity = await em.findOne(Sublayer_db, uuid);
    if (entity) {
      em.remove(entity);
      deletedUuids.push(uuid);
    }
  }
  await em.flush(); //perform deletes
  return deletedUuids;
}
