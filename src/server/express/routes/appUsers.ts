import type { EntityData } from "@mikro-orm/postgresql";
import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import bcrypt from "bcryptjs";
import express from "express";
import cloneDeep from "lodash/cloneDeep";

import { App_User_db } from "server/database/models/_allModels";
import {
  convertAppUsersTypeDbToStore,
  convertAppUsersTypeStoreToDb,
} from "store/storeUtils/appUser";
import { upsertDatabaseRetry } from "utils/database";
import { globalValues } from "../global";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { userId } = query;
  const queryObj = {
    userId: userId ? parseInt(userId as string) : undefined,
  };
  return queryObj;
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);

  //only super admin can view/edit users
  if (!req.session.appUser?.isSuperAdmin) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "appUsers",
      appUsername: req.session?.appUser?.username,
      uuids: queryObj.userId ? [queryObj.userId.toString()] : [],
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const users: AppUser[] = await getAppUsers(queryObj.userId);

    res.status(200).json({
      status: "success",
      message: "user retrieved",
      data: users,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "appUsers",
      appUsername: req.session?.appUser?.username,
      uuids: queryObj.userId ? [queryObj.userId.toString()] : [],
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { users } = req.body as UserUpsertRequest;
  //only super admin can view/edit users
  if (!req.session.appUser?.isSuperAdmin) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "appUsers",
      appUsername: req.session?.appUser?.username,
      uuids: users?.map((u) => u.id?.toString()),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    // validate
    if (!users || users.length === 0) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "appUsers",
        appUsername: req.session?.appUser?.username,
        uuids: users?.map((u) => u.id?.toString()),
        message: `No users provided in request body`,
      });
      res.status(400).json({ status: "failure", message: `No users provided in request body` });
      return;
    }
    const upsertResponse: AppUser[] = await upsertDatabaseRetry(() => upsertAppUsers(users));

    // Check response
    if (!upsertResponse || upsertResponse.length === 0) {
      serverLogger.apiRoute({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "appUsers",
        appUsername: req.session?.appUser?.username,
        uuids: users?.map((u) => u.id?.toString()),
        message: "Failed to update app user after multiple tries due to optimistic locking",
        error: new Error(
          "Failed to update app user after multiple tries due to optimistic locking"
        ),
      });
      res.status(500).json({
        status: "error",
        message: "Failed to update app user after multiple tries due to optimistic locking",
        data: null,
      });
      return;
    }

    res.status(200).json({
      status: "success",
      message: "user upserted",
      data: upsertResponse,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "appUsers",
      appUsername: req.session?.appUser?.username,
      uuids: users?.map((u) => u.id?.toString()),
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { userIds } = req.body as UserDeleteRequest;
  //only super admin can view/edit users
  if (!req.session.appUser?.isSuperAdmin) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "DELETE",
      responseStatus: 401,
      routeName: "appUsers",
      appUsername: req.session?.appUser?.username,
      uuids: userIds?.map((id) => id.toString()),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const deletedUuids = await deleteAppUsers(userIds);

    if (deletedUuids.length > 0) {
      res.status(200).json({
        status: "success",
        message: "user deleted",
      });
    } else {
      serverLogger.apiRoute({
        logLevel: "error",
        httpMethod: "DELETE",
        responseStatus: 500,
        routeName: "appUsers",
        appUsername: req.session?.appUser?.username,
        uuids: userIds?.map((id) => id.toString()),
        message: "Error in query",
        error: new Error("Error in query"),
      });
      res.status(500).json({ status: "error", message: "Error in query" });
    }
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "DELETE",
      responseStatus: 500,
      routeName: "appUsers",
      appUsername: req.session?.appUser?.username,
      uuids: userIds?.map((id) => id.toString()),
      message: `Error processing the DELETE request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the DELETE request ${e}` });
  }
});

export default router;

/**
 * get user(s) from the database
 * @returns array of users
 * @param userId
 */
async function getAppUsers(userId: number = null): Promise<AppUser[]> {
  const model = globalValues.orm.em;
  let users: App_User_db[];
  if (!userId) {
    users = await model.find(App_User_db, {});
  } else {
    users = await model.find(App_User_db, { id: userId });
  }

  return convertAppUsersTypeDbToStore(users);
}

/**
 * Inserts or Updates users into the database
 * @returns a copy of the user objects that were upserted
 * @param users
 */
export async function upsertAppUsers(users: AppUser[]): Promise<AppUser[]> {
  const em = globalValues.orm.em;
  await em.begin(); // Start a transaction

  const usersToUpsert: AppUser[] = cloneDeep(users);
  const usersUpsertedToDb = [];

  try {
    for (const userToUpsert of usersToUpsert) {
      const convertedUser: EntityData<App_User_db> = convertAppUsersTypeStoreToDb([
        userToUpsert,
      ])[0];

      if (convertedUser.id) {
        // Upserting
        const userInDb = await em.findOne(App_User_db, { id: convertedUser.id });
        if (!userInDb) {
          throw new Error(`User with id ${convertedUser.id} not found for update`);
        }
        // Encrypt new password
        if (convertedUser.password !== userInDb.password) {
          const salt = await bcrypt.genSalt();
          convertedUser.password = await bcrypt.hash(convertedUser.password, salt);
        }
        const updatedUser = em.assign(userInDb, convertedUser);
        em.persist(updatedUser);
        usersUpsertedToDb.push(updatedUser);
      } else {
        // Creating. passwords are salted in the @beforeCreate() in the user model
        // Can't use "upsert" to insert a new record if there's no other unique column in the table
        delete convertedUser.id; // Attempting to insert with an id of null will throw a mikro error. remove the property completely so mikro can give us a new id.
        const createReference = em.create(App_User_db, convertedUser);
        em.persist(createReference);
        usersUpsertedToDb.push(createReference);
      }
    }

    await em.commit(); // Flush and commit the transaction
  } catch (e) {
    await em.rollback(); // Rollback the transaction
    throw e; // Re-throw the error to be handled by the caller
  }

  return convertAppUsersTypeDbToStore(usersUpsertedToDb);
}

/**
 * Deletes users from the Database
 * @param userIds user IDs to delete
 * @returns the uuids of the deleted users
 */
async function deleteAppUsers(userIds: number[]): Promise<number[]> {
  const em = globalValues.orm.em;
  const deletedUuids = [];
  for (const userId of userIds) {
    const entity = await em.findOne(App_User_db, { id: userId });
    if (entity) {
      em.remove(entity);
      deletedUuids.push(userId);
    }
  }
  await em.flush(); //perform deletes

  return deletedUuids;
}
